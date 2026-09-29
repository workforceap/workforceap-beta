/**
 * Display words for the two-stage J5/J6 billing page. Every map is keyed by a
 * type from `lib/billing/twoStage/dto.ts` (or its M1 re-exports), so a code
 * added on the server fails the type check here instead of drifting; nothing
 * in this file lists codes of its own.
 */
import { AUTHORIZED_SIGNER } from '@/lib/billing/twoStage/constants';
import type {
  BillingStage,
  ContactSource,
  GateName,
  GateState,
  ReadinessKey,
  RecipientRole,
  SendStatus,
  StageStatus,
  VoucherMatch,
} from '@/lib/billing/twoStage/dto';
import type { KitTone } from '@/components/portal/kit';

/** "Michael A. Brown" (the printed signer line without credentials). */
export const SIGNER_SHORT_NAME = AUTHORIZED_SIGNER.name.split(',')[0].trim();
export const WAITING_ON_SIGNER_LABEL = `Waiting on ${SIGNER_SHORT_NAME}`;

export const READINESS_LABELS: Readonly<Record<ReadinessKey, string>> = {
  studentApprovedAndReady: 'Student approved and ready for training',
  counselorRequestedQuote: 'Counselor requested the quote',
  boardConfirmed: 'Workforce Solutions board confirmed',
  counselorContactVerified: 'Counselor name, phone, and email verified',
  studentEmailVerified: 'Student email verified',
  programAndClassDatesConfirmed: 'Approved class, hours, and class dates confirmed',
  priorQuoteVerified: 'J5 quote sent, or approved external quote on file',
  voucherReferenceAndReceivedDateVerified: 'Voucher / PO reference and received date verified',
  originalVoucherHashVerified: 'Original signed voucher uploaded with uploader and file hash recorded',
  michaelReceivingSignatureAttested: 'Michael’s receiving signature on the voucher explicitly attested',
  voucherTermsVerified: 'Voucher matches the approved class, dates, and $7,500 tuition',
  classStarted: 'Student has started the class',
  financeContactVerified: 'Board finance name and email verified',
};

/** J6 shows the shared contact keys with a shorter counselor label (as #2706 did). */
export const J6_LABEL_OVERRIDES: Readonly<Partial<Record<ReadinessKey, string>>> = {
  counselorContactVerified: 'Counselor contact verified',
};

export const GATE_LABELS: Readonly<Record<GateName, string>> = {
  migration: 'Database migration',
  providerOrg: 'Billing organization',
  financeArchive: 'Finance archive',
  signing: 'Signer account',
  signedRenderer: 'Signed PDF',
  receiptSignaturePrincipal: 'Designated signer',
  realEmail: 'Email delivery',
};

/**
 * The gates the server checks before each action (docs §4). Used only to
 * explain a disabled button with the gate's own message; the route re-checks.
 */
export const ACTION_GATES = {
  upload: ['financeArchive'],
  voucherData: ['receiptSignaturePrincipal'],
  receiptAttestation: ['signing', 'receiptSignaturePrincipal'],
  sign: ['signing', 'signedRenderer', 'receiptSignaturePrincipal', 'financeArchive'],
  sendJ5: ['realEmail', 'financeArchive'],
  sendJ6: ['realEmail', 'receiptSignaturePrincipal', 'financeArchive'],
} as const satisfies Record<string, readonly GateName[]>;

/** The first gate that is reported closed (`enabled: false`); an unchecked gate (`null`) is not a reason. */
export function closedGate(gates: Record<GateName, GateState> | undefined, names: readonly GateName[]): GateState | null {
  if (!gates) return null;
  for (const name of names) {
    const g = gates[name];
    if (g && g.enabled === false) return g;
  }
  return null;
}

export function sendGates(stage: BillingStage): readonly GateName[] {
  return stage === 'j5' ? ACTION_GATES.sendJ5 : ACTION_GATES.sendJ6;
}

const ROLE_LABELS: Readonly<Partial<Record<RecipientRole, string>>> = {
  student: 'Student',
  counselor: 'Counselor',
  finance: 'Board finance',
};

const ROLE_PHRASES: Readonly<Partial<Record<RecipientRole, string>>> = {
  student: 'student',
  counselor: 'counselor',
  finance: 'board finance person',
};

function humanize(role: string): string {
  const words = role.replace(/[_-]+/gu, ' ').trim();
  return words ? words[0].toUpperCase() + words.slice(1) : role;
}

/** A role added on the server (for example an internal copy) still gets a readable label. */
export function roleLabel(role: RecipientRole | string): string {
  return ROLE_LABELS[role as RecipientRole] ?? humanize(role);
}

/** "Counselor and student", "Board finance person, counselor, and student". */
export function rolesSentence(roles: readonly (RecipientRole | string)[]): string {
  const words = roles.map((r) => ROLE_PHRASES[r as RecipientRole] ?? humanize(r).toLowerCase());
  const text = words.length <= 2 ? words.join(' and ') : `${words.slice(0, -1).join(', ')}, and ${words.at(-1)}`;
  return text ? text[0].toUpperCase() + text.slice(1) : '';
}

export const CONTACT_SOURCE_LABELS: Readonly<Record<ContactSource, string>> = {
  frozen_snapshot: 'as signed',
  draft: 'saved draft',
  assigned_counselor: 'assigned counselor',
  member_profile: 'member profile',
  none: 'not on file',
};

export const STAGE_STATUS_LABELS: Readonly<Record<StageStatus, string>> = {
  draft: 'Draft',
  signed: 'Signed',
  sent: 'Sent',
  superseded: 'Superseded',
  voided: 'Voided',
};

export const STAGE_STATUS_TONES: Readonly<Record<StageStatus, KitTone>> = {
  draft: 'info',
  signed: 'warn',
  sent: 'ok',
  superseded: 'muted',
  voided: 'muted',
};

export const SEND_STATUS_LABELS: Readonly<Record<SendStatus, string>> = {
  pending: 'Sending',
  provider_accepted: 'Accepted by the email provider',
  ambiguous: 'Unknown: may or may not have been sent',
  needs_reconciliation: 'Needs a person to confirm',
  failed: 'Rejected by the email provider',
  reconciled_delivered: 'Confirmed delivered',
  reconciled_failed: 'Confirmed not delivered',
};

export const SEND_STATUS_TONES: Readonly<Record<SendStatus, KitTone>> = {
  pending: 'info',
  provider_accepted: 'ok',
  ambiguous: 'warn',
  needs_reconciliation: 'warn',
  failed: 'danger',
  reconciled_delivered: 'ok',
  reconciled_failed: 'danger',
};

export const MATCH_LABELS: Readonly<Record<VoucherMatch['check'], string>> = {
  amount: 'Amount',
  program: 'Program',
  class: 'Class',
  period: 'Period',
  contract_end_date: 'Contract end date',
  prior_quote: 'Prior quote',
};

export function shortHash(sha256: string): string {
  return sha256.slice(0, 12);
}
