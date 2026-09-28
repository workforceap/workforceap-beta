/**
 * Frozen content of a two-stage document version. The PDF (M2) renders only
 * from this object, the signer signs over its hash, and the database keeps it
 * immutable once signed. Hours, dates and the one line are frozen here, so a
 * later catalog or syllabus change cannot alter an issued document.
 */
import type { Attestation } from './attestations';
import { authorizedSignerLine, AUTHORIZED_SIGNER, CONTENT_VERSION, DOCUMENT_TITLES, J5_KIND, J6_KIND, PAYMENT_FOLLOW_UP_MAX_DAYS, PAYMENT_FOLLOW_UP_MIN_DAYS } from './constants';
import { contentSha256 } from './canonical';
import { classEndDate, isIsoDate } from './dates';
import { resolveProgramTerms, type ContractHours } from './hours';
import { WAP_BILLING_LETTERHEAD } from './letterhead';
import { buildTuitionLineItems, type TuitionLine } from './lineItem';
import { j5Recipients, j6Recipients, type Contact, type Recipient } from './recipients';
import { checkJ5Prerequisites, checkJ6Prerequisites, type J6Prerequisites, type J6Variance, type PriorJ5Summary, type ReviewReason } from './stateMachine';

export type CounselorContact = Contact & { phone: string };

export type TrainingTerms = {
  programSlug: string;
  className: string;
  contactHours: ContractHours;
  classStartDate: string;
  classEndDate: string;
};

type Common = {
  contentVersion: typeof CONTENT_VERSION;
  title: string;
  documentNumber: string;
  issueDate: string;
  /** logo.sha256 binds the exact logo PNG bytes into the version hash. */
  letterhead: { headerLines: string[]; footer: { phone: string; addressLines: string[] }; logo: { path: string; sha256: string } };
  student: Contact;
  boardName: string;
  counselor: CounselorContact;
  training: TrainingTerms;
  lineItems: TuitionLine[];
  totalCents: number;
  signer: { name: string; title: string; line: string };
  recipients: Recipient[];
};

export type J5Content = Common & {
  kind: typeof J5_KIND;
  readiness: {
    attestationId: string;
    attestedBySubjectId: string;
    attestedAt: string;
    evidenceReference: string;
    studentReadyConfirmed: true;
    counselorRequest: { requestedBy: string; requestedOn: string; reference: string };
  };
};

export type ArtifactRef = { artifactId: string; fileName: string; mimeType: string; byteLength: number; sha256: string };

export type J6Content = Common & {
  kind: typeof J6_KIND;
  finance: Contact;
  /** The board's voucher, received and receipt-signed by hand; attached exactly as uploaded. */
  voucher: ArtifactRef & {
    reference: string;
    attestationId: string;
    attestedBySubjectId: string;
    authorizedAmountCents: number;
    authorizedProgramSlug: string;
    authorizedClassName: string;
    authorizedStartDate: string;
    authorizedEndDate: string;
    receivedOn: string;
    receivingSignaturePresent: true;
  };
  boardInvoice: ArtifactRef | null;
  /** The quote this J6 follows: our sent J5 (with its frozen estimate) or an attested manual one. */
  priorJ5: PriorJ5Summary;
  /** Actual dates vs the J5 estimate, in days (system J5 only). */
  variance: J6Variance;
  /** Non-empty = held for audited staff review before signing. */
  reviewReasons: ReviewReason[];
  classStarted: { attestationId: string; classStartDate: string; classEndDate: string; attestedBySubjectId: string; attestedAt: string };
  /** An expectation for staff follow-up, never a due date or contract term. */
  paymentFollowUp: { minDays: number; maxDays: number; wording: string };
};

export type ContentResult<T> = { ok: true; content: T; contentSha256: string } | { ok: false; errors: string[] };

export const PAYMENT_FOLLOW_UP_WORDING = `We will follow up in ${PAYMENT_FOLLOW_UP_MIN_DAYS}–${PAYMENT_FOLLOW_UP_MAX_DAYS} days.`;

const HEX64 = /^[0-9a-f]{64}$/;

function letterhead(logoSha256: string): Common['letterhead'] {
  return {
    headerLines: [...WAP_BILLING_LETTERHEAD.headerLines],
    footer: { phone: WAP_BILLING_LETTERHEAD.footer.phone, addressLines: [...WAP_BILLING_LETTERHEAD.footer.addressLines] },
    logo: { path: WAP_BILLING_LETTERHEAD.logoPath, sha256: logoSha256 },
  };
}

function signer(): Common['signer'] {
  return { name: AUTHORIZED_SIGNER.name, title: AUTHORIZED_SIGNER.title, line: authorizedSignerLine() };
}

function lineItems(): { lineItems: TuitionLine[]; totalCents: number } {
  const items = buildTuitionLineItems().map((line) => ({ ...line }));
  return { lineItems: items, totalCents: items[0].amountCents };
}

function basics(documentNumber: string, issueDate: string, boardName: string, counselor: CounselorContact, logoSha256: string): string[] {
  const errors: string[] = [];
  if (!HEX64.test(logoSha256)) errors.push('The letterhead logo hash (sha256 of the exact PNG bytes) is required.');
  if (!documentNumber.trim()) errors.push('Document number is required.');
  if (!isIsoDate(issueDate)) errors.push('Issue date must be YYYY-MM-DD.');
  if (!boardName.trim()) errors.push('Workforce Solutions board is required.');
  if (!counselor.phone?.trim()) errors.push('Counselor phone is required.');
  return errors;
}

/** J5 Quote/Voucher Request. Needs only the readiness attestation: no voucher, no funding approval. */
export function buildJ5Content(input: {
  documentNumber: string;
  /** sha256 of the exact logo PNG bytes the renderer will embed. */
  logoSha256: string;
  issueDate: string;
  student: Contact;
  boardName: string;
  counselor: CounselorContact;
  programSlug: string;
  readiness: Attestation;
}): ContentResult<J5Content> {
  const errors = basics(input.documentNumber, input.issueDate, input.boardName, input.counselor, input.logoSha256);
  const gate = checkJ5Prerequisites({ hasOpenJ5: false, readiness: input.readiness, programSlug: input.programSlug });
  if (!gate.ok) errors.push(...gate.errors);
  const terms = resolveProgramTerms(input.programSlug);
  const recipients = j5Recipients({ student: input.student, counselor: input.counselor });
  if (!recipients.ok) errors.push(...recipients.errors);
  if (errors.length > 0 || !terms.ok || !recipients.ok || !input.readiness.classStartDate) return { ok: false, errors };

  const start = input.readiness.classStartDate;
  const content: J5Content = {
    kind: J5_KIND,
    contentVersion: CONTENT_VERSION,
    title: DOCUMENT_TITLES[J5_KIND],
    documentNumber: input.documentNumber.trim(),
    issueDate: input.issueDate,
    letterhead: letterhead(input.logoSha256),
    student: { name: input.student.name.trim(), email: recipients.recipients.find((r) => r.role === 'student')!.email },
    boardName: input.boardName.trim(),
    counselor: {
      name: input.counselor.name.trim(),
      phone: input.counselor.phone.trim(),
      email: recipients.recipients.find((r) => r.role === 'counselor')!.email,
    },
    training: { programSlug: terms.canonicalSlug, className: terms.className, contactHours: terms.hours, classStartDate: start, classEndDate: classEndDate(start) },
    ...lineItems(),
    signer: signer(),
    recipients: recipients.recipients,
    readiness: {
      attestationId: input.readiness.id,
      attestedBySubjectId: input.readiness.attestedBySubjectId,
      attestedAt: input.readiness.attestedAt,
      evidenceReference: input.readiness.evidenceReference,
      studentReadyConfirmed: true,
      counselorRequest: {
        requestedBy: input.readiness.counselorRequestedBy ?? '',
        requestedOn: input.readiness.counselorRequestedOn ?? '',
        reference: input.readiness.counselorRequestReference ?? '',
      },
    },
  };
  return { ok: true, content, contentSha256: contentSha256(content) };
}

/**
 * J6 Invoice/Voucher Cover Letter. Only after a prior quote, the board-signed
 * and receipt-signed voucher (with its attestation), and the class has begun.
 * Prints the staff-confirmed actual dates; the J5 estimate is kept, not changed.
 */
export function buildJ6Content(
  input: J6Prerequisites & {
    documentNumber: string;
    /** sha256 of the exact logo PNG bytes the renderer will embed. */
    logoSha256: string;
    issueDate: string;
    student: Contact;
    boardName: string;
    counselor: CounselorContact;
    finance: Contact;
  },
): ContentResult<J6Content> {
  const errors = basics(input.documentNumber, input.issueDate, input.boardName, input.counselor, input.logoSha256);
  const gate = checkJ6Prerequisites(input);
  if (!gate.ok) errors.push(...gate.errors);
  const recipients = j6Recipients({ finance: input.finance, counselor: input.counselor, student: input.student });
  if (!recipients.ok) errors.push(...recipients.errors);
  if (errors.length > 0 || !gate.ok || !recipients.ok) return { ok: false, errors };

  const email = (role: Recipient['role']) => recipients.recipients.find((r) => r.role === role)!.email;
  const { voucher, voucherAttestation, classStarted } = gate;
  const boardInvoice = input.boardInvoice;
  const content: J6Content = {
    kind: J6_KIND,
    contentVersion: CONTENT_VERSION,
    title: DOCUMENT_TITLES[J6_KIND],
    documentNumber: input.documentNumber.trim(),
    issueDate: input.issueDate,
    letterhead: letterhead(input.logoSha256),
    student: { name: input.student.name.trim(), email: email('student') },
    boardName: input.boardName.trim(),
    counselor: { name: input.counselor.name.trim(), phone: input.counselor.phone.trim(), email: email('counselor') },
    finance: { name: input.finance.name.trim(), email: email('finance') },
    training: gate.training,
    ...lineItems(),
    signer: signer(),
    recipients: recipients.recipients,
    voucher: {
      artifactId: voucher.id,
      fileName: voucher.fileName,
      mimeType: voucher.mimeType,
      byteLength: voucher.byteLength,
      sha256: voucher.sha256,
      reference: voucherAttestation.voucherReference ?? '',
      attestationId: voucherAttestation.id,
      attestedBySubjectId: voucherAttestation.attestedBySubjectId,
      authorizedAmountCents: voucherAttestation.authorizedAmountCents ?? 0,
      authorizedProgramSlug: voucherAttestation.authorizedProgramSlug ?? '',
      authorizedClassName: voucherAttestation.authorizedClassName ?? '',
      authorizedStartDate: voucherAttestation.authorizedStartDate ?? '',
      authorizedEndDate: voucherAttestation.authorizedEndDate ?? '',
      receivedOn: voucherAttestation.receivedOn ?? '',
      receivingSignaturePresent: true,
    },
    boardInvoice: boardInvoice
      ? { artifactId: boardInvoice.id, fileName: boardInvoice.fileName, mimeType: boardInvoice.mimeType, byteLength: boardInvoice.byteLength, sha256: boardInvoice.sha256 }
      : null,
    priorJ5: gate.priorJ5,
    variance: gate.variance,
    reviewReasons: gate.reviewReasons,
    classStarted: {
      attestationId: classStarted.id,
      classStartDate: classStarted.classStartDate ?? '',
      classEndDate: classStarted.classEndDate ?? '',
      attestedBySubjectId: classStarted.attestedBySubjectId,
      attestedAt: classStarted.attestedAt,
    },
    paymentFollowUp: { minDays: PAYMENT_FOLLOW_UP_MIN_DAYS, maxDays: PAYMENT_FOLLOW_UP_MAX_DAYS, wording: PAYMENT_FOLLOW_UP_WORDING },
  };
  return { ok: true, content, contentSha256: contentSha256(content) };
}

/** Human document numbers: WAP-Q-2026-0001 (J5 quote), WAP-I-2026-0001 (J6 invoice). */
export function formatStageDocumentNumber(stage: 'j5' | 'j6', year: number, sequence: number): string {
  if (!Number.isInteger(year) || !Number.isInteger(sequence) || sequence < 1) throw new RangeError('invalid document number parts');
  return `WAP-${stage === 'j5' ? 'Q' : 'I'}-${year}-${String(sequence).padStart(4, '0')}`;
}
