/**
 * Payment tracking for a sent J6 (billing_payment_events, append-only).
 *
 *  - pending: set when the J6 is sent, with an *expected* follow-up window of
 *    send date + 10 to + 14 days. It is an expectation for staff follow-up,
 *    not a due date, and there is no "overdue" state.
 *  - received: only when staff record the received date and the evidence
 *    (e.g. remittance advice). Nothing marks a case paid automatically.
 */
import { PAYMENT_FOLLOW_UP_MAX_DAYS, PAYMENT_FOLLOW_UP_MIN_DAYS } from './constants';
import { addDays, billingToday, compareIsoDates, isIsoDate } from './dates';

export type PaymentStatus = 'pending' | 'received';

/**
 * Payment is tracked against a J6 that was actually sent, proven by retained
 * evidence (sent_at plus a delivered copy for finance, counselor and student),
 * not by its current status: a sent J6 later superseded by a corrected cover
 * letter still reconciles a payment that arrives afterwards.
 */
export function canTrackPayment(j6: { stage: 'j5' | 'j6'; sentAt: Date | string | null; deliveredRoles: readonly string[] }): boolean {
  if (j6.stage !== 'j6' || !j6.sentAt) return false;
  const delivered = new Set(j6.deliveredRoles);
  return ['finance', 'counselor', 'student'].every((role) => delivered.has(role));
}

export type PaymentEvent =
  | { status: 'pending'; expectedFollowUpFrom: string; expectedFollowUpTo: string; recordedAt: string }
  | { status: 'received'; receivedOn: string; evidence: string; recordedAt: string };

/** Send date (calendar date in the billing time zone) + 10 and + 14 days. */
export function expectedFollowUpWindow(j6SentAt: Date): { expectedFollowUpFrom: string; expectedFollowUpTo: string } {
  const sentOn = billingToday(j6SentAt);
  return { expectedFollowUpFrom: addDays(sentOn, PAYMENT_FOLLOW_UP_MIN_DAYS), expectedFollowUpTo: addDays(sentOn, PAYMENT_FOLLOW_UP_MAX_DAYS) };
}

/** The pending event written when a J6 is sent. */
export function pendingOnJ6Sent(j6SentAt: Date): Extract<PaymentEvent, { status: 'pending' }> {
  return { status: 'pending', ...expectedFollowUpWindow(j6SentAt), recordedAt: j6SentAt.toISOString() };
}

export type PaymentTransition = { ok: true; event: Extract<PaymentEvent, { status: 'received' }> } | { ok: false; error: string };

/** pending -> received, only with a received date (not in the future) and evidence. */
export function recordPaymentReceived(
  current: PaymentEvent | null,
  input: { receivedOn: string; evidence: string; now: Date },
): PaymentTransition {
  if (!current) return { ok: false, error: 'Payment is tracked only after the J6 has been sent.' };
  if (current.status === 'received') return { ok: false, error: 'Payment is already recorded as received.' };
  if (!isIsoDate(input.receivedOn)) return { ok: false, error: 'Enter the date the payment was received.' };
  if (compareIsoDates(input.receivedOn, billingToday(input.now)) > 0) return { ok: false, error: 'The received date cannot be in the future.' };
  // Not before the J6 was sent: the pending window is anchored at send date + MIN days (as in the database).
  const sentOn = addDays(current.expectedFollowUpFrom, -PAYMENT_FOLLOW_UP_MIN_DAYS);
  if (compareIsoDates(input.receivedOn, sentOn) < 0) return { ok: false, error: 'The received date cannot be before the J6 was sent.' };
  const evidence = input.evidence.trim();
  if (!evidence) return { ok: false, error: 'Record the payment evidence (e.g. remittance advice or deposit reference).' };
  return { ok: true, event: { status: 'received', receivedOn: input.receivedOn, evidence, recordedAt: input.now.toISOString() } };
}

export type PaymentView =
  | { status: 'not_applicable' }
  | { status: 'pending'; expectedFollowUpFrom: string; expectedFollowUpTo: string; followUp: 'awaiting' | 'follow_up_now' }
  | { status: 'received'; receivedOn: string };

/** Latest state for the admin page. `follow_up_now` is a nudge to staff, not a lateness claim. */
export function paymentView(latest: PaymentEvent | null, now: Date): PaymentView {
  if (!latest) return { status: 'not_applicable' };
  if (latest.status === 'received') return { status: 'received', receivedOn: latest.receivedOn };
  const today = billingToday(now);
  return {
    status: 'pending',
    expectedFollowUpFrom: latest.expectedFollowUpFrom,
    expectedFollowUpTo: latest.expectedFollowUpTo,
    followUp: compareIsoDates(today, latest.expectedFollowUpFrom) >= 0 ? 'follow_up_now' : 'awaiting',
  };
}

/**
 * The case's current payment event, monotonic like the database rules: once
 * any event is `received`, the case stays received (the database refuses a
 * later pending); otherwise the latest pending.
 */
export function currentCasePaymentEvent<T extends { status: PaymentStatus; recordedAt: string }>(events: ReadonlyArray<T>): T | null {
  const byTime = [...events].sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
  return byTime.filter((e) => e.status === 'received').at(-1) ?? byTime.at(-1) ?? null;
}

/** Case-level payment view over the events of every sent J6 on the case. */
export function casePaymentView(events: ReadonlyArray<PaymentEvent & { j6RecordId: string }>, now: Date): PaymentView & { j6RecordId: string | null } {
  const latest = currentCasePaymentEvent(events);
  return { ...paymentView(latest, now), j6RecordId: latest?.j6RecordId ?? null };
}
