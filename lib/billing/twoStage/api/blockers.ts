import 'server-only';

/**
 * Stable codes for M1's prerequisite messages. M1's gates return sentences;
 * M3 maps each one to a code so the UI can key on it. An unknown sentence
 * becomes PREREQUISITE_UNMET with the M1 text, never a silent pass, and a
 * test pins this table to M1's current wording.
 */
import type { Blocker, BlockerCode, HoldReason } from '../dto';
import { REVIEW_REASON_TEXT } from '../stateMachine';

const EXACT: ReadonlyArray<readonly [BlockerCode, RegExp]> = [
  ['J5_ALREADY_OPEN', /^This case already has an open J5\./u],
  ['J5_READINESS_MISSING', /^Record the J5 readiness attestation/u],
  ['J5_STUDENT_NOT_READY', /^The readiness attestation must confirm the student is approved and ready\./u],
  ['J5_COUNSELOR_REQUEST_MISSING', /^The readiness attestation must record the counselor.s request/u],
  ['J6_ALREADY_OPEN', /^This case already has an open J6\./u],
  ['J6_PRIOR_QUOTE_MISSING', /^J6 is on hold: send the J5 quote\/voucher request first/u],
  ['J6_J5_NOT_SENT', /^The J5 quote\/voucher request has not been sent/u],
  ['J6_EXTERNAL_QUOTE_INCOMPLETE', /^Record the manually issued quote/u],
  ['J6_VOUCHER_MISSING', /^Upload the voucher signed by the board/u],
  ['J6_VOUCHER_ATTESTATION_INCOMPLETE', /^Confirm the uploaded board-signed voucher/u],
  ['J6_VOUCHER_UNSIGNED', /^J6 cannot use an unsigned voucher/u],
  ['J6_BOARD_INVOICE_INVALID', /^The optional board invoice must be its own/u],
  ['J6_CLASS_START_MISSING', /^Record that the class has begun/u],
  ['J6_CLASS_START_FUTURE', /^The class start .* is after today/u],
  ['CLASS_NOT_STARTED', /^The class has not started yet/u],
  ['COUNSELOR_PHONE_MISSING', /^Counselor phone is required\./u],
  ['BOARD_NAME_MISSING', /^Workforce Solutions board is required\./u],
  ['RECIPIENTS_INVALID', /^(Student|Counselor|Board finance) (name is required|email is missing or not valid)\.|share .*; each recipient needs their own address\.$/u],
  ['PROGRAM_TERMS_UNAVAILABLE', /^(The student has no enrolled program to bill\.|No approved syllabus for |The approved syllabus lists )/u],
];

export function blockerCodeFor(message: string): BlockerCode {
  return EXACT.find(([, re]) => re.test(message))?.[0] ?? 'PREREQUISITE_UNMET';
}

export function blockersFromMessages(messages: readonly string[]): Blocker[] {
  return messages.map((message) => ({ code: blockerCodeFor(message), message, hardHold: false }));
}

const HOLD_CODE: Readonly<Record<HoldReason, BlockerCode>> = {
  voucher_amount_differs: 'HOLD_VOUCHER_AMOUNT_DIFFERS',
  voucher_class_differs: 'HOLD_VOUCHER_CLASS_DIFFERS',
  voucher_period_conflict: 'HOLD_VOUCHER_PERIOD_CONFLICT',
  end_date_not_contract: 'HOLD_END_DATE_NOT_CONTRACT',
  class_differs_from_quote: 'HOLD_CLASS_DIFFERS_FROM_QUOTE',
};

/** Hard holds use REVIEW_REASON_TEXT alone (canSignJ6 appends a sentence that repeats one of them). */
export function holdBlockers(holds: readonly HoldReason[]): Blocker[] {
  return holds.map((hold) => ({ code: HOLD_CODE[hold], message: REVIEW_REASON_TEXT[hold], hardHold: true }));
}

/** J6_VOUCHER_ATTESTATION_INCOMPLETE once a voucher file exists: only the designated signer can record its details. */
export const VOUCHER_DATA_WAITING_MESSAGE =
  'Waiting on Michael A. Brown to record the voucher details (reference, received date, authorized program/class, amount and period) for this exact file. A staff account cannot record them.';

export const RECEIVING_SIGNATURE_NOT_ATTESTED_MESSAGE =
  "Michael A. Brown must attest, signed in as himself, that his receiving signature is on this exact uploaded voucher. A staff confirmation does not count.";

export const VOUCHER_RECEIPT_FUTURE_MESSAGE = 'The voucher received date is after today; the J6 is issued on or after the day the signed voucher arrived.';

export const J6_ISSUE_DATE_NOT_TODAY_MESSAGE = 'The J6 is dated the day it is signed. Save the draft again today before signing.';

export const J5_ISSUE_DATE_NOT_TODAY_MESSAGE = 'The J5 is dated the day it is signed. Save the draft again today before signing.';

export const DRAFT_STALE_MESSAGE = 'The evidence or letterhead changed since this draft was saved. Save the draft again and review the new preview.';
