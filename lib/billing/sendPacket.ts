import type { TrainingBillingPacket } from '@prisma/client';
import { getResend } from '@/lib/email';
import { FixtureRecipientSkippedError, sendBrandedEmailOrThrowOnSkip } from '@/lib/email/send';
import { brandedEmailLayout } from '@/lib/email/template';
import { sanitizeEmailSubjectLine } from '@/lib/email/escapeHtml';
import { billingPacketCounselorHtml, billingPacketStudentHtml, type BillingPacketEmailFacts } from '@/emails/billing-packet';
import { packetDocumentFilename, renderJ5InvoicePdf, renderJ6CoverLetterPdf } from './packetPdf';
import { packetToDocumentInput } from './packetDocument';
import type { SignedPacketSnapshot } from './packetSnapshot';
import type { PacketRecipient, SendAttemptRecord } from './sendAttempts';
import { formatLongDate, formatMoney } from './packetText';

/** From address frozen into a send attempt when it starts. */
export function currentEmailFrom(): string {
  return process.env.EMAIL_FROM || 'WorkforceAP <hello@workforceap.org>';
}

export type PacketEmail = {
  recipient: PacketRecipient;
  from: string;
  to: string;
  replyTo: string;
  subject: string;
  html: string;
  attachments: Array<{ filename: string; content: Buffer }>;
};

/**
 * Build one delivery email. Every input is frozen: recipients, names, the
 * reply-to and the PDFs come from the signed snapshot and packet row; the
 * from address and branding from the send attempt. No cc: ops asked for the
 * student and the counselor only. So a retry of the same
 * attempt produces the same payload. Live and NOT frozen: the email template
 * code and the List-Unsubscribe header the mail wrapper adds (see
 * lib/email/send.ts); a change there surfaces as a provider 409.
 */
export async function buildPacketEmail(args: {
  packet: TrainingBillingPacket;
  snapshot: SignedPacketSnapshot;
  attempt: SendAttemptRecord;
  recipient: PacketRecipient;
}): Promise<PacketEmail> {
  const { packet, snapshot, attempt } = args;
  const input = await packetToDocumentInput(packet, snapshot.member, async () => null);
  const [j5, j6] = await Promise.all([renderJ5InvoicePdf(input), renderJ6CoverLetterPdf(input)]);
  const attachments = [
    { filename: packetDocumentFilename('j5', packet.packetNumber, snapshot.member.fullName), content: Buffer.from(j5) },
    { filename: packetDocumentFilename('j6', packet.packetNumber, snapshot.member.fullName), content: Buffer.from(j6) },
  ];
  const facts: BillingPacketEmailFacts = {
    memberName: snapshot.member.fullName,
    programTitle: snapshot.programTitle,
    packetNumber: packet.packetNumber,
    totalLabel: formatMoney(packet.totalAmount),
    billToName: packet.billToName,
    invoiceDateLabel: formatLongDate(packet.invoiceDate),
    signerName: packet.signerName,
    signerTitle: packet.signerTitle,
    classLines: input.lineItems.map((row) =>
      `${row.description}${row.hours != null ? ` (${row.hours} contact hours)` : ''} - ${formatMoney(row.amount)}`,
    ),
  };
  const branding = attempt.branding;
  const common = { from: attempt.from, replyTo: snapshot.provider.email, attachments };

  if (args.recipient === 'student') {
    const first = snapshot.member.fullName.trim().split(/\s+/)[0] || 'there';
    const documentsUrl = `${branding.domain}/dashboard/documents`;
    return {
      ...common,
      recipient: 'student',
      to: snapshot.member.email,
      subject: sanitizeEmailSubjectLine(`Your ${facts.programTitle} enrollment documents (invoice ${facts.packetNumber})`),
      html: brandedEmailLayout({
        title: 'Your signed training documents',
        bodyHtml: billingPacketStudentHtml({ firstName: first, facts, documentsUrl }),
        ctaText: 'Open my documents',
        ctaUrl: documentsUrl,
        branding,
      }),
    };
  }
  const counselor = snapshot.counselor;
  if (!counselor) throw new Error('No counselor was assigned when this packet was signed.');
  const first = counselor.fullName.trim().split(/\s+/)[0] || 'there';
  const studentUrl = `${branding.domain}/counselor/students/${packet.memberId}`;
  return {
    ...common,
    recipient: 'counselor',
    to: counselor.email,
    subject: sanitizeEmailSubjectLine(`J5/J6 for ${facts.memberName} - ${facts.programTitle} (${facts.packetNumber})`),
    html: brandedEmailLayout({
      title: `Signed J5 invoice and J6 cover letter for ${facts.memberName}`,
      bodyHtml: billingPacketCounselorHtml({ counselorFirstName: first, facts, studentUrl, memberEmail: snapshot.member.email }),
      ctaText: 'Open student record',
      ctaUrl: studentUrl,
      branding,
    }),
  };
}

export class EmailNotConfiguredError extends Error {
  constructor() {
    super('Email is not configured (RESEND_API_KEY missing).');
    this.name = 'EmailNotConfiguredError';
  }
}

/** Resend error codes (node_modules/resend) that definitively mean "not accepted". */
const DEFINITE_REJECTIONS = new Set([
  'missing_required_field',
  'invalid_idempotency_key',
  'invalid_access',
  'invalid_parameter',
  'invalid_region',
  'missing_api_key',
  'invalid_api_Key',
  'invalid_from_address',
  'validation_error',
  'not_found',
  'method_not_allowed',
]);

export type DeliveryErrorClass =
  /** Resend refused a reused key with a changed payload: operator reconciliation, never a new key. */
  | 'idempotency_conflict'
  /** Definitely not accepted (local skip, config, provider 4xx validation). */
  | 'rejected_definite'
  /** Unknown whether it was accepted (timeout, network, 5xx, 429, unknown): same-key retry only. */
  | 'ambiguous';

export function classifyDeliveryError(err: unknown): DeliveryErrorClass {
  if (err instanceof EmailNotConfiguredError || err instanceof FixtureRecipientSkippedError) return 'rejected_definite';
  const name = err && typeof err === 'object' ? (err as { providerErrorName?: unknown }).providerErrorName : undefined;
  if (name === 'invalid_idempotent_request') return 'idempotency_conflict';
  if (typeof name === 'string' && DEFINITE_REJECTIONS.has(name)) return 'rejected_definite';
  return 'ambiguous';
}

/**
 * Hard bound on one provider call. A timeout is an ambiguous outcome (the
 * provider may still accept it), handled by a same-key retry.
 */
export const PROVIDER_SEND_TIMEOUT_MS = 30_000;

export class DeliveryTimeoutError extends Error {
  constructor() {
    super(`The email provider did not answer within ${PROVIDER_SEND_TIMEOUT_MS / 1000}s.`);
    this.name = 'DeliveryTimeoutError';
  }
}

/**
 * Deliver one packet email with its attempt's idempotency key. Throws on
 * failure. When the call times out, the still-running request's eventual
 * result is handed to `onLateResult` so it is recorded, never dropped.
 */
export async function deliverPacketEmail(
  email: PacketEmail,
  idempotencyKey: string,
  opts: { timeoutMs?: number; onLateResult?: (outcome: { delivered: boolean; detail: string }) => void } = {},
): Promise<void> {
  const resend = getResend();
  if (!resend) throw new EmailNotConfiguredError();
  const request = sendBrandedEmailOrThrowOnSkip(resend, {
    from: email.from,
    to: email.to,
    replyTo: email.replyTo,
    subject: email.subject,
    html: email.html,
    attachments: email.attachments,
    idempotencyKey,
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      reject(new DeliveryTimeoutError());
    }, opts.timeoutMs ?? PROVIDER_SEND_TIMEOUT_MS);
  });
  request.then(
    () => timedOut && opts.onLateResult?.({ delivered: true, detail: 'provider accepted after the timeout' }),
    (err: unknown) => timedOut && opts.onLateResult?.({ delivered: false, detail: err instanceof Error ? err.message : 'provider error after the timeout' }),
  );
  try {
    await Promise.race([request, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
