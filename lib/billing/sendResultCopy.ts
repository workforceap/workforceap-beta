/**
 * Client-safe copy for the send button's results and the post-sign banner.
 * Pure functions of the send route's response and the packet summary, so the
 * UI never claims a delivery the server did not report.
 */
import type { BillingPacketSummary } from './packetAccess';
import { formatLongDateOfInstant } from './packetText';

export type SendResponseBody = {
  ok?: boolean;
  kind?: 'sent' | 'reconciliation_recorded';
  error?: string;
  code?: string;
  packet?: BillingPacketSummary;
  sentTo?: string[];
  counselorMissing?: boolean;
  outcome?: 'delivered' | 'not_delivered';
  recipient?: string;
  replacementSendable?: boolean;
};

const recipientLabel = (r: string | undefined) => (r === 'counselor' ? 'Counselor copy' : r === 'student' ? 'Student copy' : 'Copy');

/** The status line after a send or reconcile request. */
export function describeSendResult(httpOk: boolean, data: SendResponseBody): { ok: boolean; message: string } {
  if (!httpOk) return { ok: false, message: data.error ?? 'Could not send the documents right now.' };
  if (data.kind === 'reconciliation_recorded') {
    const replacement =
      data.replacementSendable === true
        ? ' The replacement packet can now be sent.'
        : data.replacementSendable === false
          ? ' The replacement stays blocked until every copy of this packet is settled.'
          : '';
    return {
      ok: true,
      message: `Reconciliation recorded — ${recipientLabel(data.recipient)}: ${data.outcome === 'delivered' ? 'delivered' : 'not delivered'}.${replacement}`,
    };
  }
  const to = (data.sentTo ?? []).filter(Boolean);
  if (to.length === 0) return { ok: true, message: 'Send state updated.' };
  const warn = data.counselorMissing ? ' No counselor was assigned when it was signed, so only the student received it.' : '';
  return { ok: true, message: `Sent to ${to.join(', ')}.${warn}` };
}

/**
 * Banner under "Signed packets" for the packet just signed, derived from its
 * CURRENT send state (sendState.nextAction is computed server-side by the
 * shared nextSendAction). The "press Email" cue only appears before the first
 * send attempt.
 */
export function postSignCue(packet: BillingPacketSummary | null | undefined): string | null {
  if (!packet || packet.status === 'superseded') return null;
  const n = `Invoice ${packet.packetNumber}`;
  if (packet.sendBlockedReason) return `${n}: re-issue required. This packet has no valid signed snapshot.`;
  const s = packet.sendState;
  if (!s || s.attemptNo == null) return `${n} is ready. Next step: press “Email to counselor and student”.`;
  switch (s.nextAction) {
    case 'in_progress':
      return `${n} is being sent.`;
    case 'retry':
      return `${n}: a copy did not confirm. Press Retry to resend it with the same key.`;
    case 'reconcile':
      return `${n}: a copy needs reconciliation below.`;
    case 'send':
      return `${n}: the send did not finish. Press the send button to continue it.`;
    default:
      if (s.remaining.length === 0) return `${n} was emailed.`;
      if (s.delivered.length > 0) return `${n}: ${s.remaining.join(' and ')} still needs a copy. Use “Send to remaining recipients”.`;
      return `${n}: no copy was delivered. Start a new attempt.`;
  }
}

/** Confirm text for a full resend that would duplicate delivered copies; null when nobody has one yet. */
export function duplicateCopyConfirmText(packet: BillingPacketSummary): string | null {
  const delivered = packet.sendState?.delivered ?? [];
  if (delivered.length === 0) return null;
  const who = delivered
    .map((d) => `the ${d.recipient}${d.email ? ` (${d.email})` : ''}${d.at ? ` on ${formatLongDateOfInstant(d.at)}` : ''}, attempt ${d.attemptNo}`)
    .join('; ');
  return `Already received: ${who}. Send a duplicate copy to everyone?`;
}
