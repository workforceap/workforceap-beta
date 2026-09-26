import { z } from 'zod';

/** One row on the J5 invoice: a class in the program or a fee. */
export type PacketLineItem = {
  description: string;
  /** Contact hours for a class row; null for fee rows. */
  hours: number | null;
  amount: number;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const PNG_DATA_URL = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/;

const lineItemSchema = z.object({
  description: z.string().trim().min(1, 'Line item needs a description').max(200),
  hours: z.number().min(0).max(10_000).nullable().optional().transform((v) => (v == null ? null : v)),
  amount: z.number().min(0, 'Amounts cannot be negative').max(1_000_000),
});

/**
 * The approved amount and funding basis the signer checked against the
 * Board-issued ITA approval or the contract. Never prefilled: the price-list
 * default is a maximum, not an approval (TWC 40 TAC §840.61 ties ITA funding
 * to Board approval).
 */
const fundingApprovalSchema = z.object(
  {
    fundingType: z.enum(['wioa_ita', 'separate_contract'], {
      errorMap: () => ({ message: 'Choose the funding basis (WIOA ITA or separate contract).' }),
    }),
    approvedAmount: z
      .number({ required_error: 'Enter the approved amount.', invalid_type_error: 'Enter the approved amount.' })
      .positive('Enter the approved amount.')
      .max(1_000_000),
    /** ITA / voucher / contract reference or approval note. */
    basis: z.string().trim().min(3, 'Record the ITA approval or contract reference the amount comes from.').max(300),
    /** Board-approved exception reference; required for a WIOA ITA above the maximum. */
    capException: z.string().trim().max(300).optional().default(''),
    reviewed: z.literal(true, {
      errorMap: () => ({ message: 'Confirm you reviewed the approved amount and funding basis before signing.' }),
    }),
  },
  { required_error: 'Record the approved amount and funding basis before signing.' },
);

export type FundingApproval = z.infer<typeof fundingApprovalSchema>;

export const createPacketSchema = z
  .object({
    programSlug: z.string().trim().min(1).max(120),
    invoiceDate: z.string().regex(ISO_DATE, 'Invoice date must be YYYY-MM-DD'),
    dueDate: z.string().regex(ISO_DATE, 'Due date must be YYYY-MM-DD').nullable().optional(),
    billToName: z.string().trim().min(1, 'Who is this invoice billed to?').max(200),
    billToAttention: z.string().trim().max(200).optional().default(''),
    billToAddress: z.string().trim().max(600).optional().default(''),
    billToEmail: z.union([z.literal(''), z.string().trim().email('Bill-to email is not valid').max(200)]).optional().default(''),
    referenceNumber: z.string().trim().max(120).optional().default(''),
    lineItems: z.array(lineItemSchema).min(1, 'Add at least one class or fee').max(40),
    coverLetterBody: z.string().trim().min(20, 'The cover letter is too short').max(6000),
    signerName: z.string().trim().min(2).max(120),
    signerTitle: z.string().trim().min(2).max(120),
    /** Drawn signature (PNG data URL). Omit when the signer typed their name. */
    signatureImage: z.string().regex(PNG_DATA_URL, 'Signature must be a PNG image').max(400_000).nullable().optional(),
    /** Explicit "I am signing this by typing my name" acknowledgement. */
    signatureTyped: z.boolean().optional().default(false),
    fundingApproval: fundingApprovalSchema,
  })
  .refine((v) => Boolean(v.signatureImage) || v.signatureTyped, {
    message: 'Sign the documents (draw your signature or type your name) before creating them.',
    path: ['signatureImage'],
  });

export type CreatePacketInput = z.infer<typeof createPacketSchema>;

/** Round to cents so JSON storage and PDF totals agree. */
export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export function sumLineItems(items: ReadonlyArray<{ amount: number }>): number {
  return roundMoney(items.reduce((sum, item) => sum + (Number.isFinite(item.amount) ? item.amount : 0), 0));
}

/** Read the JSON column back into typed rows; tolerates hand-edited rows. */
export function parseLineItems(value: unknown): PacketLineItem[] {
  if (!Array.isArray(value)) return [];
  const rows: PacketLineItem[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const description = typeof r.description === 'string' ? r.description : '';
    const amount = typeof r.amount === 'number' && Number.isFinite(r.amount) ? r.amount : 0;
    const hours = typeof r.hours === 'number' && Number.isFinite(r.hours) ? r.hours : null;
    if (!description) continue;
    rows.push({ description, hours, amount });
  }
  return rows;
}
