/**
 * Two-stage state machine (pure). Mirrors the database guards in
 * migration 20260927230000_billing_two_stage_j5_j6 so the API can explain a
 * refusal before the database enforces it.
 *
 *   J5:      (none) -> draft -> signed -> sent            [needs j5_readiness only]
 *   Voucher: none -> received                             [board-signed upload + attestation]
 *   J6:      (none) -> draft [-> review] -> signed -> sent
 *            [needs a prior quote (system J5 sent, or attested external),
 *             the receipt-signed board voucher + attestation, class_started <= today;
 *             a voucher amount/period or date conflict holds it for audited review]
 *   Payment: not_applicable -> pending -> received        [pending on J6 sent; received needs evidence]
 *
 * Any signed/sent record may be superseded by a new version; drafts and
 * unsent signed records may be voided. Superseded/voided are terminal.
 */
import type { Attestation } from './attestations';
import { TUITION_AND_FEES_CENTS } from './constants';
import { billingToday, classEndDate, compareIsoDates, daysBetween, formatLongCalendarDate } from './dates';
import { resolveProgramTerms } from './hours';
import type { J5Content, TrainingTerms } from './content';

export type StageStatus = 'draft' | 'signed' | 'sent' | 'superseded' | 'voided';
export type StageEvent = 'edit_draft' | 'sign' | 'mark_sent' | 'supersede' | 'void';

export const OPEN_STAGE_STATUSES: ReadonlySet<StageStatus> = new Set(['draft', 'signed', 'sent']);

const TRANSITIONS: Readonly<Record<StageStatus, Partial<Record<StageEvent, StageStatus>>>> = {
  draft: { edit_draft: 'draft', sign: 'signed', void: 'voided' },
  signed: { mark_sent: 'sent', supersede: 'superseded', void: 'voided' },
  sent: { supersede: 'superseded' },
  superseded: {},
  voided: {},
};

export type Transition = { ok: true; status: StageStatus } | { ok: false; error: string };

export function nextStageStatus(current: StageStatus, event: StageEvent): Transition {
  const next = TRANSITIONS[current]?.[event];
  return next ? { ok: true, status: next } : { ok: false, error: `A ${current} document cannot ${event.replace('_', ' ')}.` };
}

export type Gate = { ok: true } | { ok: false; errors: string[] };

/**
 * J5 may be created before any voucher exists. Its only prerequisites are a
 * j5_readiness attestation (with the admin-confirmed start date), a program
 * with approved contract hours, and no other open J5 on the case. There is
 * deliberately no voucher or funding-approval input.
 */
export function checkJ5Prerequisites(input: { hasOpenJ5: boolean; readiness: Attestation | null; programSlug: string }): Gate {
  const errors: string[] = [];
  if (input.hasOpenJ5) errors.push('This case already has an open J5. Supersede or void it to issue a corrected version.');
  if (!input.readiness || input.readiness.kind !== 'j5_readiness' || !input.readiness.classStartDate) {
    errors.push('Record the J5 readiness attestation (with the confirmed class start date) first.');
  }
  const terms = resolveProgramTerms(input.programSlug);
  if (!terms.ok) errors.push(terms.message);
  return errors.length > 0 ? { ok: false, errors } : { ok: true };
}

export type ArtifactSummary = { id: string; kind: string; fileName: string; mimeType: string; byteLength: number; sha256: string };

export type SystemJ5 = { recordId: string; status: StageStatus; content: J5Content; contentSha256: string };

export type J6Prerequisites = {
  now: Date;
  hasOpenJ6: boolean;
  /** The case's program (canonical or legacy alias); hours come from its approved syllabus. */
  programSlug: string;
  /** Our sent J5, or an attested manual quote issued before this system. Neither = held. */
  priorJ5: { source: 'system'; j5: SystemJ5 } | { source: 'external'; attestation: Attestation } | null;
  classStarted: Attestation | null;
  voucher: ArtifactSummary | null;
  voucherAttestation: Attestation | null;
  boardInvoice: ArtifactSummary | null;
};

export type ReviewReason = 'voucher_amount_differs' | 'voucher_period_conflict' | 'end_date_not_contract' | 'hours_differ_from_quote';

export const REVIEW_REASON_TEXT: Readonly<Record<ReviewReason, string>> = {
  voucher_amount_differs: 'The voucher authorizes a different amount than the $7,500.00 quote.',
  voucher_period_conflict: 'The class dates fall outside the period the voucher authorizes.',
  end_date_not_contract: 'The confirmed end date is not five calendar months after the actual start.',
  hours_differ_from_quote: 'The contract hours differ from the hours on the J5 quote.',
};

export type J6Variance = { startShiftDays: number; endShiftDays: number; hoursDelta: number } | null;

export type PriorJ5Summary =
  | { source: 'system'; recordId: string; contentSha256: string; estimate: TrainingTerms }
  | { source: 'external'; attestationId: string; reference: string; quoteDate: string; copyArtifactId: string | null };

export type J6Gate =
  | {
      ok: true;
      /** Staff-confirmed actual terms printed on the J6. */
      training: TrainingTerms;
      priorJ5: PriorJ5Summary;
      /** Actual vs the frozen J5 estimate (system J5 only). Informational. */
      variance: J6Variance;
      /** Non-empty = the J6 is held until an audited staff review clears it. */
      reviewReasons: ReviewReason[];
      classStarted: Attestation;
      voucher: ArtifactSummary;
      voucherAttestation: Attestation;
    }
  | { ok: false; errors: string[] };

/**
 * J6 only after (a) a prior quote exists (our sent J5, or an attested manual
 * one), (b) the board-signed, receipt-signed voucher is on file with its
 * attestation, and (c) the class has begun (actual start <= today).
 */
export function checkJ6Prerequisites(input: J6Prerequisites): J6Gate {
  const errors: string[] = [];
  if (input.hasOpenJ6) errors.push('This case already has an open J6. Supersede or void it to issue a corrected version.');

  let priorJ5: PriorJ5Summary | null = null;
  const prior = input.priorJ5;
  if (!prior) {
    errors.push('J6 is on hold: send the J5 quote/voucher request first, or record the manually issued quote it follows.');
  } else if (prior.source === 'system') {
    if (prior.j5.status !== 'sent') errors.push('The J5 quote/voucher request has not been sent yet.');
    else priorJ5 = { source: 'system', recordId: prior.j5.recordId, contentSha256: prior.j5.contentSha256, estimate: { ...prior.j5.content.training } };
  } else if (prior.attestation.kind !== 'external_j5_reference' || !prior.attestation.externalReference || !prior.attestation.externalQuoteDate) {
    errors.push('Record the manually issued quote (reference and date) before creating the J6.');
  } else {
    priorJ5 = {
      source: 'external',
      attestationId: prior.attestation.id,
      reference: prior.attestation.externalReference,
      quoteDate: prior.attestation.externalQuoteDate,
      copyArtifactId: prior.attestation.artifactId,
    };
  }

  const { voucher, voucherAttestation, classStarted, boardInvoice } = input;
  if (!voucher || voucher.kind !== 'board_signed_voucher') {
    errors.push('Upload the voucher signed by the board before creating the J6.');
  }
  if (
    !voucherAttestation ||
    voucherAttestation.kind !== 'voucher_board_signed' ||
    !voucher ||
    voucherAttestation.artifactId !== voucher.id ||
    !voucherAttestation.voucherReference?.trim() ||
    !voucherAttestation.receivedOn ||
    voucherAttestation.authorizedAmountCents == null
  ) {
    errors.push('Confirm the uploaded board-signed voucher: its voucher/PO reference, received date and authorized amount.');
  } else if (voucherAttestation.receivingSignaturePresent !== true) {
    errors.push('J6 cannot use an unsigned voucher: Michael A. Brown\u2019s receiving signature must be on the uploaded document.');
  }
  if (boardInvoice && (boardInvoice.kind !== 'board_invoice' || boardInvoice.id === voucher?.id)) {
    errors.push('The optional board invoice must be its own uploaded board invoice file.');
  }

  const start = classStarted?.classStartDate ?? null;
  const end = classStarted?.classEndDate ?? null;
  if (!classStarted || classStarted.kind !== 'class_started' || !start || !end) {
    errors.push('Record that the class has begun (actual start and confirmed end) before creating the J6.');
  } else if (compareIsoDates(start, billingToday(input.now)) > 0) {
    errors.push(`The class start ${formatLongCalendarDate(start)} is after today; the J6 waits until the class has begun.`);
  }

  const terms = resolveProgramTerms(input.programSlug);
  if (!terms.ok) errors.push(terms.message);

  if (errors.length > 0 || !priorJ5 || !terms.ok || !start || !end || !classStarted || !voucher || !voucherAttestation) {
    return { ok: false, errors: errors.length > 0 ? errors : ['J6 prerequisites are incomplete.'] };
  }

  const training: TrainingTerms = { programSlug: terms.canonicalSlug, className: terms.className, contactHours: terms.hours, classStartDate: start, classEndDate: end };
  const reviewReasons: ReviewReason[] = [];
  if (voucherAttestation.authorizedAmountCents !== TUITION_AND_FEES_CENTS) reviewReasons.push('voucher_amount_differs');
  const authStart = voucherAttestation.authorizedStartDate;
  const authEnd = voucherAttestation.authorizedEndDate;
  if ((authStart && compareIsoDates(start, authStart) < 0) || (authEnd && compareIsoDates(end, authEnd) > 0)) reviewReasons.push('voucher_period_conflict');
  if (end !== classEndDate(start)) reviewReasons.push('end_date_not_contract');
  let variance: J6Variance = null;
  if (priorJ5.source === 'system') {
    variance = {
      startShiftDays: daysBetween(priorJ5.estimate.classStartDate, start),
      endShiftDays: daysBetween(priorJ5.estimate.classEndDate, end),
      hoursDelta: training.contactHours - priorJ5.estimate.contactHours,
    };
    if (variance.hoursDelta !== 0) reviewReasons.push('hours_differ_from_quote');
  }
  return { ok: true, training, priorJ5, variance, reviewReasons, classStarted, voucher, voucherAttestation };
}

/** A J6 with review reasons may be signed only after a recorded staff review. */
export function canSignJ6(record: { reviewReasons: readonly string[]; reviewClearedAt: string | null; reviewNote: string | null }): Gate {
  if (record.reviewReasons.length > 0 && (!record.reviewClearedAt || !record.reviewNote?.trim())) {
    return { ok: false, errors: ['This J6 is held for review. A staff member must record the review before it can be signed.'] };
  }
  return { ok: true };
}

export type CaseProgress = {
  j5: StageStatus | 'none';
  voucher: 'none' | 'received';
  j6: StageStatus | 'none';
  payment: 'not_applicable' | 'pending' | 'received';
};

type RecordLite = { stage: 'j5' | 'j6'; status: StageStatus; version: number };

/** Summary for the admin page: the latest version per stage, voucher and payment state. */
export function summarizeCase(input: {
  records: RecordLite[];
  hasVoucherAttestation: boolean;
  latestPaymentStatus: 'pending' | 'received' | null;
}): CaseProgress {
  const latest = (stage: 'j5' | 'j6') =>
    input.records.filter((r) => r.stage === stage).sort((a, b) => b.version - a.version)[0]?.status ?? 'none';
  const j6 = latest('j6');
  return {
    j5: latest('j5'),
    voucher: input.hasVoucherAttestation ? 'received' : 'none',
    j6,
    payment: j6 === 'sent' || j6 === 'superseded' ? input.latestPaymentStatus ?? 'not_applicable' : 'not_applicable',
  };
}
