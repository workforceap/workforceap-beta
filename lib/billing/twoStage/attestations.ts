/**
 * Staff attestations the two stages rest on. Each is an explicit statement by
 * a named staff member with an evidence reference; nothing is inferred from
 * enrollment rows (CourseEnrollment has no approval or start status, and a
 * completed enrollment neither qualifies nor disqualifies a student).
 *
 *  - j5_readiness: the student is ready for a quote/voucher request, with the
 *    admin-confirmed class start date. No funding approval is required: J5
 *    comes before any voucher.
 *  - class_started: the class has begun on a date that is not in the future,
 *    with the staff-confirmed end date. J6 prints these actual dates; the J5
 *    estimate stays frozen on the J5.
 *  - voucher_board_signed: the uploaded file is the voucher signed by the
 *    board, received on a given date, with Michael's receiving signature
 *    already on the document (signed by hand on receipt). The app never
 *    stamps, overlays or alters the voucher bytes, and this is not the J6
 *    cover-letter signature, which is its own executive sign action.
 *  - external_j5_reference: a quote/voucher request issued manually before
 *    this system (reference, date, optional uploaded copy). It lets J6
 *    proceed without a system J5; no system J5 or signature is fabricated.
 */
import { billingToday, compareIsoDates, formatLongCalendarDate, isIsoDate } from './dates';

export type AttestationKind = 'j5_readiness' | 'class_started' | 'voucher_board_signed' | 'external_j5_reference';

export type Attestation = {
  id: string;
  kind: AttestationKind;
  statement: string;
  evidenceReference: string;
  classStartDate: string | null;
  classEndDate: string | null;
  artifactId: string | null;
  voucherReference: string | null;
  authorizedAmountCents: number | null;
  authorizedStartDate: string | null;
  authorizedEndDate: string | null;
  receivedOn: string | null;
  receivingSignaturePresent: boolean | null;
  externalReference: string | null;
  externalQuoteDate: string | null;
  attestedBySubjectId: string;
  attestedAt: string;
};

export type AttestationDraft = Omit<Attestation, 'id' | 'attestedAt'>;
export type AttestationResult = { ok: true; attestation: AttestationDraft } | { ok: false; errors: string[] };

const EMPTY = {
  classStartDate: null,
  classEndDate: null,
  artifactId: null,
  voucherReference: null,
  authorizedAmountCents: null,
  authorizedStartDate: null,
  authorizedEndDate: null,
  receivedOn: null,
  receivingSignaturePresent: null,
  externalReference: null,
  externalQuoteDate: null,
} as const;

const MAX_TEXT = 500;

function common(evidenceReference: string, attestedBySubjectId: string, confirmed: boolean): string[] {
  const errors: string[] = [];
  if (confirmed !== true) errors.push('Confirm the statement before recording it.');
  if (!attestedBySubjectId.trim()) errors.push('The attesting staff member is required.');
  const evidence = evidenceReference.trim();
  if (!evidence) errors.push('Enter the evidence this rests on (e.g. counselor referral, attendance record, board email).');
  if (evidence.length > MAX_TEXT) errors.push(`Evidence reference is limited to ${MAX_TEXT} characters.`);
  return errors;
}

function notFuture(date: string, now: Date, message: string, errors: string[]): void {
  if (compareIsoDates(date, billingToday(now)) > 0) errors.push(message);
}

export function j5ReadinessStatement(args: { studentName: string; className: string; classStartDate: string }): string {
  return (
    `I confirm that ${args.studentName} is ready for a Workforce Solutions quote/voucher request for ` +
    `${args.className}, and that the class start date is ${formatLongCalendarDate(args.classStartDate)}.`
  );
}

export function classStartedStatement(args: { studentName: string; className: string; classStartDate: string; classEndDate: string }): string {
  return (
    `I confirm that ${args.studentName} began ${args.className} on ${formatLongCalendarDate(args.classStartDate)}, ` +
    `with a scheduled end date of ${formatLongCalendarDate(args.classEndDate)}.`
  );
}

export function voucherBoardSignedStatement(args: { boardName: string; voucherReference: string; receivedOn: string }): string {
  return (
    `I confirm that the uploaded file is voucher ${args.voucherReference} as signed by ${args.boardName}, received on ` +
    `${formatLongCalendarDate(args.receivedOn)}, and that Michael A. Brown’s receiving signature is on the uploaded document. ` +
    'The file is stored exactly as uploaded.'
  );
}

export function externalJ5Statement(args: { externalReference: string; externalQuoteDate: string }): string {
  return (
    `I confirm that quote/voucher request ${args.externalReference} was issued manually on ` +
    `${formatLongCalendarDate(args.externalQuoteDate)}, before this system; no system J5 exists for it.`
  );
}

export function recordJ5Readiness(input: {
  studentName: string;
  className: string;
  classStartDate: string;
  evidenceReference: string;
  attestedBySubjectId: string;
  confirmed: boolean;
}): AttestationResult {
  const errors = common(input.evidenceReference, input.attestedBySubjectId, input.confirmed);
  if (!isIsoDate(input.classStartDate)) errors.push('Enter the confirmed class start date (YYYY-MM-DD).');
  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    attestation: {
      kind: 'j5_readiness',
      statement: j5ReadinessStatement(input),
      evidenceReference: input.evidenceReference.trim(),
      ...EMPTY,
      classStartDate: input.classStartDate,
      attestedBySubjectId: input.attestedBySubjectId,
    },
  };
}

export function recordClassStarted(input: {
  studentName: string;
  className: string;
  classStartDate: string;
  classEndDate: string;
  evidenceReference: string;
  attestedBySubjectId: string;
  confirmed: boolean;
  now: Date;
}): AttestationResult {
  const errors = common(input.evidenceReference, input.attestedBySubjectId, input.confirmed);
  const startOk = isIsoDate(input.classStartDate);
  if (!startOk) errors.push('Enter the date the class began (YYYY-MM-DD).');
  else notFuture(input.classStartDate, input.now, 'A class cannot be recorded as begun on a future date.', errors);
  if (!isIsoDate(input.classEndDate)) errors.push('Enter the confirmed class end date (YYYY-MM-DD).');
  else if (startOk && compareIsoDates(input.classEndDate, input.classStartDate) <= 0) errors.push('The class end date must be after its start.');
  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    attestation: {
      kind: 'class_started',
      statement: classStartedStatement(input),
      evidenceReference: input.evidenceReference.trim(),
      ...EMPTY,
      classStartDate: input.classStartDate,
      classEndDate: input.classEndDate,
      attestedBySubjectId: input.attestedBySubjectId,
    },
  };
}

export function recordVoucherBoardSigned(input: {
  boardName: string;
  voucherReference: string;
  artifact: { id: string; kind: string };
  authorizedAmountCents: number;
  authorizedStartDate?: string | null;
  authorizedEndDate?: string | null;
  receivedOn: string;
  /** Staff confirm Michael's receiving signature is on the uploaded document. Must be exactly true. */
  receivingSignaturePresent: boolean;
  evidenceReference: string;
  attestedBySubjectId: string;
  confirmed: boolean;
  now: Date;
}): AttestationResult {
  const errors = common(input.evidenceReference, input.attestedBySubjectId, input.confirmed);
  const reference = input.voucherReference.trim();
  if (!reference) errors.push('Enter the voucher/PO reference printed on the board voucher.');
  if (reference.length > 120) errors.push('Voucher reference is limited to 120 characters.');
  if (input.artifact.kind !== 'board_signed_voucher') errors.push('Attach the uploaded board-signed voucher, not another file.');
  if (!Number.isSafeInteger(input.authorizedAmountCents) || input.authorizedAmountCents <= 0) {
    errors.push('Enter the amount the board authorized on the voucher.');
  }
  const start = input.authorizedStartDate ?? null;
  const end = input.authorizedEndDate ?? null;
  if ((start && !isIsoDate(start)) || (end && !isIsoDate(end))) errors.push('Authorized dates must be YYYY-MM-DD.');
  else if (start && end && compareIsoDates(end, start) < 0) errors.push('The authorized end date is before its start.');
  if (!isIsoDate(input.receivedOn)) errors.push('Enter the date the signed voucher was received.');
  else notFuture(input.receivedOn, input.now, 'The received date cannot be in the future.', errors);
  if (input.receivingSignaturePresent !== true) {
    errors.push('The voucher must carry Michael A. Brown’s receiving signature before it is uploaded; J6 cannot use an unsigned voucher.');
  }
  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    attestation: {
      kind: 'voucher_board_signed',
      statement: voucherBoardSignedStatement({ boardName: input.boardName, voucherReference: reference, receivedOn: input.receivedOn }),
      evidenceReference: input.evidenceReference.trim(),
      ...EMPTY,
      artifactId: input.artifact.id,
      voucherReference: reference,
      authorizedAmountCents: input.authorizedAmountCents,
      authorizedStartDate: start,
      authorizedEndDate: end,
      receivedOn: input.receivedOn,
      receivingSignaturePresent: true,
      attestedBySubjectId: input.attestedBySubjectId,
    },
  };
}

export function recordExternalJ5Reference(input: {
  externalReference: string;
  externalQuoteDate: string;
  copy: { id: string; kind: string } | null;
  evidenceReference: string;
  attestedBySubjectId: string;
  confirmed: boolean;
  now: Date;
}): AttestationResult {
  const errors = common(input.evidenceReference, input.attestedBySubjectId, input.confirmed);
  const reference = input.externalReference.trim();
  if (!reference) errors.push('Enter the reference of the manually issued quote.');
  if (!isIsoDate(input.externalQuoteDate)) errors.push('Enter the date the manual quote was issued.');
  else notFuture(input.externalQuoteDate, input.now, 'The manual quote date cannot be in the future.', errors);
  if (input.copy && input.copy.kind !== 'external_j5_copy') errors.push('The optional copy must be an uploaded manual-quote PDF.');
  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    attestation: {
      kind: 'external_j5_reference',
      statement: externalJ5Statement({ externalReference: reference, externalQuoteDate: input.externalQuoteDate }),
      evidenceReference: input.evidenceReference.trim(),
      ...EMPTY,
      artifactId: input.copy?.id ?? null,
      externalReference: reference,
      externalQuoteDate: input.externalQuoteDate,
      attestedBySubjectId: input.attestedBySubjectId,
    },
  };
}
