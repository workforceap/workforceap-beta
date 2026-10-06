/**
 * Two-stage state machine (pure). Mirrors the database guards in
 * migration 20260927230000_billing_two_stage_j5_j6 so the API can explain a
 * refusal before the database enforces it.
 *
 *   J5:      (none) -> draft -> signed -> sent            [needs j5_readiness: ready + counselor request]
 *   Voucher: none -> received                             [board-signed upload + attestation]
 *   J6:      (none) -> draft [-> review] -> signed -> sent
 *            [needs a prior quote (system J5 sent, or attested external),
 *             the receipt-signed board voucher + attestation, class_started <= today;
 *             derived holds (amount, voucher class/period, contract end, class vs
 *             quote) block signing until corrected evidence clears them]
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
import { currentCasePaymentEvent } from './payment';
import type { VoucherReceiptSignatureStatus } from './voucherReceipt';

export const VOUCHER_RECEIPT_SIGNATURE_UNATTESTED = 'VOUCHER_RECEIPT_SIGNATURE_UNATTESTED';

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

/** `codes` carries machine-readable blocker codes where a gate has them. */
export type Gate = { ok: true } | { ok: false; errors: string[]; codes?: string[] };

/**
 * J5 may be created before any voucher exists. Its prerequisites are a
 * j5_readiness attestation that records both facts (student approved/ready,
 * and the counselor's request for the quote), the admin-confirmed start date,
 * a program with approved contract hours, and no other open J5 on the case.
 * There is deliberately no voucher or funding-approval input.
 */
export function checkJ5Prerequisites(input: { hasOpenJ5: boolean; readiness: Attestation | null; programSlug: string }): Gate {
  const errors: string[] = [];
  if (input.hasOpenJ5) errors.push('This case already has an open J5. Supersede or void it to issue a corrected version.');
  const r = input.readiness;
  if (!r || r.kind !== 'j5_readiness' || !r.classStartDate) {
    errors.push('Record the J5 readiness attestation (with the confirmed class start date) first.');
  } else {
    if (r.studentReadyConfirmed !== true) errors.push('The readiness attestation must confirm the student is approved and ready.');
    if (!r.counselorRequestedBy?.trim() || !r.counselorRequestedOn || !r.counselorRequestReference?.trim()) {
      errors.push('The readiness attestation must record the counselor’s request for the quote (who, when, reference).');
    }
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

/** Same order and names as the database's billing_stage_record_rules(). */
export type ReviewReason =
  | 'voucher_amount_differs'
  | 'voucher_class_differs'
  | 'voucher_period_conflict'
  | 'end_date_not_contract'
  | 'class_differs_from_quote';

/**
 * Every reason is a hard hold with no bypass: no review note and no exception
 * clears it. Each clears only when corrected structured evidence (a corrected
 * voucher attestation or class_started attestation, or a corrected document)
 * makes it disappear. Mirrors billing_stage_record_rules() in the migration.
 */
export const BLOCKING_REVIEW_REASONS: ReadonlySet<ReviewReason> = new Set([
  'voucher_amount_differs',
  'voucher_class_differs',
  'voucher_period_conflict',
  'end_date_not_contract',
  'class_differs_from_quote',
]);

export const REVIEW_REASON_TEXT: Readonly<Record<ReviewReason, string>> = {
  voucher_amount_differs: 'The voucher authorizes a different amount than the $7,500.00 quote. Record a corrected voucher; a review note cannot clear this.',
  voucher_class_differs: 'The voucher authorizes a different program or class than this J6. Get a corrected voucher.',
  voucher_period_conflict: 'The class dates fall outside the period the voucher authorizes. Record a corrected voucher (period) or class-start attestation.',
  end_date_not_contract: 'The confirmed end date is not six calendar months after the actual start. Record corrected class dates.',
  class_differs_from_quote: 'The program, class or hours differ from the quote this J6 follows. Issue a corrected document.',
};

export type J6Variance = { startShiftDays: number; endShiftDays: number; hoursDelta: number } | null;

export type PriorJ5Summary =
  | { source: 'system'; recordId: string; contentSha256: string; estimate: TrainingTerms }
  | { source: 'external'; attestationId: string; reference: string; quoteDate: string; copyArtifactId: string | null; programSlug: string; className: string };

export type J6Gate =
  | {
      ok: true;
      /** Staff-confirmed actual terms printed on the J6. */
      training: TrainingTerms;
      priorJ5: PriorJ5Summary;
      /** Actual vs the frozen J5 estimate (system J5 only). Informational. */
      variance: J6Variance;
      /** Non-empty = the J6 is held; no reason is ever cleared by a review. */
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
    if (prior.j5.status !== 'sent') errors.push('The J5 quote/voucher request has not been sent to both recipients yet.');
    else priorJ5 = { source: 'system', recordId: prior.j5.recordId, contentSha256: prior.j5.contentSha256, estimate: { ...prior.j5.content.training } };
  } else {
    const a = prior.attestation;
    if (a.kind !== 'external_j5_reference' || !a.externalReference || !a.externalQuoteDate || !a.quotedProgramSlug || !a.quotedClassName) {
      errors.push('Record the manually issued quote (reference, date, program and class) before creating the J6.');
    } else {
      priorJ5 = {
        source: 'external',
        attestationId: a.id,
        reference: a.externalReference,
        quoteDate: a.externalQuoteDate,
        copyArtifactId: a.artifactId,
        programSlug: a.quotedProgramSlug,
        className: a.quotedClassName,
      };
    }
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
    voucherAttestation.authorizedAmountCents == null ||
    !voucherAttestation.authorizedProgramSlug ||
    !voucherAttestation.authorizedClassName ||
    !voucherAttestation.authorizedStartDate ||
    !voucherAttestation.authorizedEndDate
  ) {
    errors.push('Confirm the uploaded board-signed voucher: reference, received date, authorized program/class, amount and period.');
  } else if (voucherAttestation.receivingSignaturePresent !== true) {
    errors.push('J6 cannot use an unsigned voucher: Michael A. Brown’s receiving signature must be on the uploaded document.');
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
  const reasons: ReviewReason[] = [];
  if (voucherAttestation.authorizedAmountCents !== TUITION_AND_FEES_CENTS) reasons.push('voucher_amount_differs');
  if (voucherAttestation.authorizedProgramSlug !== training.programSlug || voucherAttestation.authorizedClassName !== training.className) {
    reasons.push('voucher_class_differs');
  }
  const authStart = voucherAttestation.authorizedStartDate!;
  const authEnd = voucherAttestation.authorizedEndDate!;
  if (compareIsoDates(start, authStart) < 0 || compareIsoDates(end, authEnd) > 0) reasons.push('voucher_period_conflict');
  if (end !== classEndDate(start)) reasons.push('end_date_not_contract');
  let variance: J6Variance = null;
  if (priorJ5.source === 'system') {
    const q = priorJ5.estimate;
    variance = {
      startShiftDays: daysBetween(q.classStartDate, start),
      endShiftDays: daysBetween(q.classEndDate, end),
      hoursDelta: training.contactHours - q.contactHours,
    };
    if (q.programSlug !== training.programSlug || q.className !== training.className || q.contactHours !== training.contactHours) {
      reasons.push('class_differs_from_quote');
    }
  } else if (priorJ5.programSlug !== training.programSlug || priorJ5.className !== training.className) {
    reasons.push('class_differs_from_quote');
  }
  return { ok: true, training, priorJ5, variance, reviewReasons: reasons, classStarted, voucher, voucherAttestation };
}

/**
 * Whether a J6 may be signed: only with no hold at all, and only once its class
 * has started (start <= today in America/Chicago). A review note never clears
 * a hold; there is no amount exception.
 */
export function canSignJ6(input: {
  reviewReasons: readonly string[];
  classStartDate: string;
  now: Date;
  /** From voucherReceiptSignatureStatus(); absent means unattested (fail closed). */
  voucherReceiptSignature?: VoucherReceiptSignatureStatus;
}): Gate {
  const errors: string[] = [];
  const codes: string[] = [];
  const receipt = input.voucherReceiptSignature;
  if (!receipt || !receipt.ok) {
    codes.push(VOUCHER_RECEIPT_SIGNATURE_UNATTESTED);
    if (receipt && !receipt.ok && receipt.code !== VOUCHER_RECEIPT_SIGNATURE_UNATTESTED) codes.push(receipt.code);
    errors.push(receipt && !receipt.ok ? receipt.error : 'The designated signer has not attested his receiving signature on this voucher.');
  }
  for (const reason of input.reviewReasons as readonly ReviewReason[]) {
    errors.push(`${REVIEW_REASON_TEXT[reason] ?? reason} A review note cannot clear this.`);
  }
  if (compareIsoDates(input.classStartDate, billingToday(input.now)) > 0) {
    errors.push('The class has not started yet; a J6 is signed only after it starts.');
  }
  return errors.length > 0 ? { ok: false, errors, ...(codes.length > 0 ? { codes } : {}) } : { ok: true };
}

export type CaseProgress = {
  j5: StageStatus | 'none';
  voucher: 'none' | 'received';
  j6: StageStatus | 'none';
  payment: 'not_applicable' | 'pending' | 'received';
};

type RecordLite = { id: string; stage: 'j5' | 'j6'; status: StageStatus; version: number; sentAt: Date | string | null };

/**
 * Summary for the admin page: the latest version per stage, voucher and
 * payment state. Payment is case-level: the most recently recorded payment
 * event on any J6 that was ever sent (sent_at set), whatever the latest J6
 * version's status is. A sent v2 superseded by a draft or voided v3 still
 * shows v2's pending/received payment.
 */
export function summarizeCase(input: {
  records: RecordLite[];
  hasVoucherAttestation: boolean;
  paymentEvents: ReadonlyArray<{ j6RecordId: string; status: 'pending' | 'received'; recordedAt: string }>;
}): CaseProgress {
  const latest = (stage: 'j5' | 'j6') =>
    input.records.filter((r) => r.stage === stage).sort((a, b) => b.version - a.version)[0]?.status ?? 'none';
  const everSent = new Set(input.records.filter((r) => r.stage === 'j6' && r.sentAt).map((r) => r.id));
  const payment = currentCasePaymentEvent(input.paymentEvents.filter((e) => everSent.has(e.j6RecordId)));
  return {
    j5: latest('j5'),
    voucher: input.hasVoucherAttestation ? 'received' : 'none',
    j6: latest('j6'),
    payment: payment?.status ?? 'not_applicable',
  };
}
