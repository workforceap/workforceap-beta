import { z } from 'zod';
import { isWholeCents, sumMoney } from './packetText';

const WHOLE_CENTS = 'Amounts must be whole cents (at most 2 decimal places).';

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
  amount: z
    .number({ required_error: 'Enter an amount for every row.', invalid_type_error: 'Enter an amount for every row.' })
    .min(0, 'Amounts cannot be negative')
    .max(1_000_000)
    .refine(isWholeCents, WHOLE_CENTS),
});

/**
 * Staff-recorded funding attestation: the funding basis staff selected, the
 * approved amount and the ITA / contract reference they checked, and their
 * explicit confirmations. It is a record of what staff attested, not proof of
 * Board or contract approval. Nothing here is ever prefilled or defaulted; the
 * price-list figure is a maximum, not an approval (TWC 40 TAC §840.61).
 */
const fundingAttestationSchema = z.object(
  {
    fundingBasis: z.enum(['wioa_ita', 'separate_contract'], {
      errorMap: () => ({ message: 'Choose the funding basis (WIOA ITA or separate contract).' }),
    }),
    approvedAmount: z
      .number({ required_error: 'Enter the approved amount.', invalid_type_error: 'Enter the approved amount.' })
      .finite()
      .positive('Enter the approved amount.')
      .max(1_000_000)
      .refine(isWholeCents, 'The approved amount must be whole cents (at most 2 decimal places).'),
    /** ITA / voucher / contract reference staff checked the amount against. */
    reference: z
      .string({ required_error: 'Enter the ITA approval or contract reference.' })
      .trim()
      .min(4, 'Enter the ITA approval or contract reference (at least 4 characters).')
      .max(200),
    /** Optional staff note about an exception. Recorded as unverified. */
    exceptionNote: z.string().trim().max(300).optional().default(''),
    reviewed: z.literal(true, {
      errorMap: () => ({ message: 'Confirm you reviewed the approved amount, funding basis and reference before signing.' }),
    }),
    tuitionMatches: z.literal(true, {
      errorMap: () => ({ message: 'Confirm the tuition row amounts match the ITA or contract before signing.' }),
    }),
  },
  { required_error: 'Record the funding basis, approved amount and reference before signing.' },
);

export type FundingAttestation = z.infer<typeof fundingAttestationSchema>;

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
    /** J6 narrative only; the facts block is generated from the rows. */
    coverLetterBody: z.string().trim().min(20, 'The cover letter is too short').max(6000),
    signerName: z.string().trim().min(2).max(120),
    signerTitle: z.string().trim().min(2).max(120),
    /** Drawn signature (PNG data URL). Omit when the signer typed their name. */
    signatureImage: z.string().regex(PNG_DATA_URL, 'Signature must be a PNG image').max(400_000).nullable().optional(),
    /** Explicit "I am signing this by typing my name" acknowledgement. */
    signatureTyped: z.boolean().optional().default(false),
    fundingAttestation: fundingAttestationSchema,
    /** "Supersede and re-issue": the signed packet this one replaces, and why. */
    supersedesPacketId: z.string().uuid().optional(),
    supersedeReason: z.string().trim().max(1000).optional(),
    /** Fingerprint the form recorded when staff ticked the confirmations (attestationFingerprint). */
    reviewedFingerprint: z.string().regex(/^[0-9a-f]{16}$/, 'Review and confirm the funding and J6 facts before signing.'),
    /** Explicit "I reviewed the generated J6 facts block" confirmation. */
    j6FactsReviewed: z.literal(true, {
      errorMap: () => ({ message: 'Confirm you reviewed the J6 facts block before signing.' }),
    }),
  })
  .refine((v) => Boolean(v.signatureImage) || v.signatureTyped, {
    message: 'Sign the documents (draw your signature or type your name) before creating them.',
    path: ['signatureImage'],
  });

export type CreatePacketInput = z.infer<typeof createPacketSchema>;

/**
 * Key for the one-packet-per-member-and-approval rule: upper-cased with every
 * character that is not a letter or digit removed, so "ITA-123", "ita 123" and
 * "ITA_123." collide. Over-matching is the conservative failure mode for a
 * same-member duplicate guard. The reference as typed stays in the snapshot.
 */
export function normalizeFundingReference(reference: string): string {
  return reference.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Round to cents so JSON storage and PDF totals agree. */
export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Invoice total: summed in integer cents per row (see sumMoney). */
export function sumLineItems(items: ReadonlyArray<{ amount: number }>): number {
  return sumMoney(items);
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
