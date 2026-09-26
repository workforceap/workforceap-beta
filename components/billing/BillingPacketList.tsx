'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { requestFailureMessage } from '@/lib/http/requestFailureCopy';
import type { BillingPacketSummary } from '@/lib/billing/packetAccess';
import { formatLongDate, formatLongDateOfInstant, formatMoney, formatShortDateTimeOfInstant } from '@/lib/billing/packetText';
import { describeSendResult, duplicateCopyConfirmText, type SendResponseBody } from '@/lib/billing/sendResultCopy';

type BillingPacketListProps = {
  packets: BillingPacketSummary[];
  /** Admins get the "Email to counselor and student" button. */
  canSend?: boolean;
  /** Unused since recipients come only from the signed snapshot; kept for callers. */
  counselorLabel?: string | null;
  memberEmail?: string | null;
  /** Called with the updated packet after a successful send. */
  onPacketUpdated?: (packet: BillingPacketSummary) => void;
  /** Admin: start "Supersede and re-issue" for a signed packet. */
  onSupersede?: (packet: BillingPacketSummary) => void;
  emptyText?: string;
};

type SendState = { id: string; busy: boolean; ok?: boolean; message?: string } | null;

type SendAction = {
  action?: 'send' | 'email_again' | 'send_remaining' | 'reconcile';
  recipient?: string;
  delivered?: boolean;
  note?: string;
  confirmDuplicateTo?: string[];
};

type ActionButton = { label: string; body: SendAction; disabled: boolean; why?: string; confirm?: string | null };

export const SEND_BLOCKED_COPY = 'Re-issue required: this packet has no valid signed snapshot, so it cannot be emailed. Use “Supersede and re-issue”.';

/** Full resend to every snapshot recipient; duplicates need an explicit confirmation (server-checked too). */
function emailAgainAction(p: BillingPacketSummary, label: string): ActionButton {
  const delivered = p.sendState?.delivered ?? [];
  return {
    label,
    body: { action: 'email_again', ...(delivered.length ? { confirmDuplicateTo: delivered.map((d) => d.recipient) } : {}) },
    disabled: false,
    confirm: duplicateCopyConfirmText(p),
  };
}

/** Button label and request for the current attempt's next action (the send route enforces the same rule). */
export function primaryAction(p: BillingPacketSummary): ActionButton {
  if (p.sendBlockedReason) return { label: 'Email to counselor and student', body: {}, disabled: true, why: SEND_BLOCKED_COPY };
  switch (p.sendState?.nextAction ?? 'send') {
    case 'retry':
      return { label: 'Retry (same attempt, same keys)', body: { action: 'send' }, disabled: false };
    case 'in_progress':
      return { label: 'Sending…', body: {}, disabled: true, why: 'A copy is being sent right now.' };
    case 'reconcile':
      return { label: 'Email again', body: {}, disabled: true, why: 'A copy needs reconciliation below before anything else can be sent.' };
    case 'email_again': {
      const remaining = p.sendState?.remaining ?? [];
      if (remaining.length > 0 && (p.sendState?.delivered.length ?? 0) > 0) {
        return { label: `Send to remaining recipients (${remaining.join(', ')})`, body: { action: 'send_remaining' }, disabled: false };
      }
      return emailAgainAction(p, 'Email again to counselor and student (new attempt)');
    }
    default:
      return { label: 'Email to counselor and student', body: { action: 'send' }, disabled: false };
  }
}

/** When "Send to remaining" is primary, the full resend is still offered, behind the duplicate confirmation. */
export function secondaryAction(p: BillingPacketSummary): ActionButton | null {
  if (p.sendBlockedReason || p.sendState?.nextAction !== 'email_again') return null;
  if (primaryAction(p).body.action !== 'send_remaining') return null;
  return emailAgainAction(p, 'Email again to everyone (duplicate copy)');
}

/**
 * Who the primary action would email: "Send to remaining" goes to the
 * remaining recipients; continuing or retrying the current attempt goes to its
 * stored recipients that have no delivered copy in it yet; a first send or a
 * full "Email again" goes to every snapshot recipient.
 */
export function plannedRecipients(p: BillingPacketSummary): string[] {
  const all = p.recipients?.counselor ? ['student', 'counselor'] : ['student'];
  const s = p.sendState;
  const action = primaryAction(p).body.action;
  if (action === 'send_remaining') return s?.remaining ?? all;
  if (s && s.attemptNo != null && s.nextAction !== 'email_again') {
    const done = new Set(s.rows.filter((r) => r.status === 'sent' || r.status === 'reconciled_delivered').map((r) => r.recipient));
    return s.attemptRecipients.filter((r) => !done.has(r));
  }
  return all;
}

/** "Emailed to student (Sep 26, 10:02 AM CT) and counselor (…)" from the cross-attempt delivered summary. */
export function emailedSummary(p: BillingPacketSummary): string | null {
  const delivered = p.sendState?.delivered ?? [];
  if (delivered.length > 0) {
    return `Emailed to ${delivered.map((d) => `${d.recipient}${d.at ? ` (${formatShortDateTimeOfInstant(d.at)})` : ''}`).join(' and ')}`;
  }
  return p.sentAt ? `emailed ${formatLongDateOfInstant(p.sentAt)}` : null;
}

function pdfHref(id: string, doc: 'j5' | 'j6' | 'both', download = false) {
  return `/api/billing-packets/${id}/pdf?doc=${doc}${download ? '&download=1' : ''}`;
}

/**
 * Read-only list of signed J5/J6 packets with download links. Shared by the
 * admin billing page, the counselor student page and the member documents
 * page. Only admins see the send button.
 */
export default function BillingPacketList({
  packets,
  canSend = false,
  onPacketUpdated,
  onSupersede,
  emptyText = 'No invoice packets yet.',
}: BillingPacketListProps) {
  const [send, setSend] = useState<SendState>(null);
  const tCommon = useTranslations('common');

  if (packets.length === 0) {
    return <p style={{ margin: 0, color: 'var(--color-muted, #64748b)', fontSize: '0.95rem' }}>{emptyText}</p>;
  }

  const sendPacket = async (packet: BillingPacketSummary, body: SendAction = {}, confirmText?: string | null) => {
    if (confirmText && typeof window !== 'undefined' && !window.confirm(confirmText)) return;
    setSend({ id: packet.id, busy: true });
    try {
      const res = await fetch(`/api/billing-packets/${packet.id}/send`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = (await res.json().catch(() => ({}))) as SendResponseBody;
      if (data.packet && onPacketUpdated) onPacketUpdated(data.packet);
      const result = describeSendResult(res.ok, data);
      setSend({ id: packet.id, busy: false, ...result });
    } catch (err) {
      setSend({ id: packet.id, busy: false, ok: false, message: requestFailureMessage(err, { connection: tCommon('connectionError'), fallback: 'Could not send the documents right now.' }, 'billing-packet-send') });
    }
  };

  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.75rem' }}>
      {packets.map((p) => {
        const state = send?.id === p.id ? send : null;
        const superseded = p.status === 'superseded';
        const replacement = p.supersededByPacketId ? packets.find((x) => x.id === p.supersededByPacketId) : undefined;
        const live = canSend && !superseded;
        return (
          <li key={p.id} className="wa-kit-card" style={{ padding: '1rem', display: 'grid', gap: '0.6rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'baseline' }}>
              <div>
                <strong style={{ fontSize: '1rem' }}>Invoice {p.packetNumber}</strong>
                <span style={{ marginLeft: 8, fontSize: '0.8125rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: p.status === 'sent' ? 'var(--color-green, #15803d)' : superseded ? 'var(--color-muted, #64748b)' : 'var(--color-accent, #ad2c4d)' }}>
                  {p.status === 'sent' ? 'Sent' : superseded ? 'Superseded' : 'Signed'}
                </span>
              </div>
              <strong>{formatMoney(p.totalAmount)}</strong>
            </div>
            <div style={{ fontSize: '0.9rem', color: 'var(--color-muted, #64748b)', lineHeight: 1.5 }}>
              {p.programTitle} · {formatLongDate(p.invoiceDate)} · billed to {p.billToName}
              {p.referenceNumber ? ` · ref ${p.referenceNumber}` : ''}
              <br />
              Signed by {p.signerName}, {p.signerTitle}
              {emailedSummary(p) ? ` · ${emailedSummary(p)}` : ''}
            </div>
            {superseded ? (
              <p style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600 }}>
                Superseded — replaced by{' '}
                {replacement ? (
                  <a href={pdfHref(replacement.id, 'j5')} target="_blank" rel="noopener">
                    invoice {replacement.packetNumber}
                  </a>
                ) : (
                  'a newer invoice'
                )}
                {canSend && p.supersededAt ? ` on ${formatLongDateOfInstant(p.supersededAt)}` : ''}
                {canSend && p.supersededReason ? `. Reason: ${p.supersededReason}` : ''}
              </p>
            ) : null}
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <a className="btn btn-outline" style={{ minHeight: 40 }} href={pdfHref(p.id, 'j5')} target="_blank" rel="noopener">
                View J5 invoice
              </a>
              <a className="btn btn-outline" style={{ minHeight: 40 }} href={pdfHref(p.id, 'j6')} target="_blank" rel="noopener">
                View J6 cover letter
              </a>
              <a className="btn btn-outline" style={{ minHeight: 40 }} href={pdfHref(p.id, 'both', true)} download>
                Download both (PDF)
              </a>
              <a className="btn btn-outline" style={{ minHeight: 40 }} href={pdfHref(p.id, 'j5', true)} download>
                Download J5
              </a>
              <a className="btn btn-outline" style={{ minHeight: 40 }} href={pdfHref(p.id, 'j6', true)} download>
                Download J6
              </a>
              {live ? (
                <button
                  type="button"
                  className="btn"
                  style={{ minHeight: 40 }}
                  disabled={Boolean(state?.busy) || primaryAction(p).disabled}
                  title={primaryAction(p).why}
                  onClick={() => void sendPacket(p, primaryAction(p).body, primaryAction(p).confirm)}
                >
                  {state?.busy ? 'Sending…' : primaryAction(p).label}
                </button>
              ) : null}
              {live && secondaryAction(p) ? (
                <button
                  type="button"
                  className="btn btn-outline"
                  style={{ minHeight: 40 }}
                  disabled={Boolean(state?.busy)}
                  onClick={() => void sendPacket(p, secondaryAction(p)!.body, secondaryAction(p)!.confirm)}
                >
                  {secondaryAction(p)!.label}
                </button>
              ) : null}
              {live && onSupersede ? (
                <button type="button" className="btn btn-outline" style={{ minHeight: 40 }} onClick={() => onSupersede(p)}>
                  Supersede and re-issue
                </button>
              ) : null}
            </div>
            {live && p.recipients && !p.sendBlockedReason && plannedRecipients(p).length > 0 && !primaryAction(p).disabled ? (
              <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--color-muted, #64748b)' }}>
                {goesToLine(p.recipients, plannedRecipients(p))}
              </p>
            ) : null}
            {state && !state.busy && state.message ? (
              <p role="status" style={{ margin: 0, fontSize: '0.9rem', color: state.ok ? 'var(--color-green, #15803d)' : 'var(--color-accent, #ad2c4d)' }}>
                {state.message}
              </p>
            ) : null}
            {canSend && p.sendState?.warnings.length ? (
              <p role="alert" style={{ margin: 0, fontSize: '0.82rem', color: 'var(--color-accent, #ad2c4d)', fontWeight: 600 }}>{p.sendState.warnings.join(' ')}</p>
            ) : null}
            {canSend && primaryAction(p).why ? (
              <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--color-accent, #ad2c4d)' }}>{primaryAction(p).why}</p>
            ) : null}
            {canSend && p.sendState && p.sendState.history.length > 0 ? <SendHistory history={p.sendState.history} /> : null}
            {canSend && p.sendState
              ? p.sendState.rows
                  // Superseded packets cannot retry, so any unsettled copy is offered for reconciliation.
                  .filter((r) => r.status === 'needs_reconciliation' || (superseded && (r.status === 'ambiguous' || r.status === 'claimed')))
                  .map((r) => (
                    <ReconcileRow
                      key={r.recipient}
                      recipient={r.recipient}
                      lastError={r.lastError}
                      busy={Boolean(state?.busy)}
                      onSubmit={(delivered, note) => void sendPacket(p, { action: 'reconcile', recipient: r.recipient, delivered, note })}
                    />
                  ))
              : null}
          </li>
        );
      })}
    </ul>
  );
}

function goesToLine(recipients: NonNullable<BillingPacketSummary['recipients']>, planned: string[]): string {
  const label = (r: string) => (r === 'counselor' ? `counselor ${recipients.counselor ?? ''}`.trim() : `student ${recipients.student}`);
  if (!recipients.counselor) return `Goes to ${label('student')} only (no counselor was assigned at signing, so there is no counselor copy).`;
  if (planned.length === 1) return `Goes to ${label(planned[0])} only.`;
  return `Goes to ${planned.map(label).join(' and ')}.`;
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'not sent yet',
  claimed: 'sending',
  sent: 'delivered to the provider',
  rejected_definite: 'rejected (not sent)',
  ambiguous: 'unconfirmed',
  needs_reconciliation: 'needs reconciliation',
  reconciled_delivered: 'marked delivered',
  reconciled_not_delivered: 'marked not delivered',
};

/** Every attempt's per-recipient outcome (admin view), so partial delivery stays visible after a reload. */
function SendHistory({ history }: { history: NonNullable<BillingPacketSummary['sendState']>['history'] }) {
  return (
    <details open style={{ fontSize: '0.82rem' }}>
      <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Send history</summary>
      <ul style={{ margin: '0.35rem 0 0', paddingLeft: '1.1rem', display: 'grid', gap: '0.2rem' }}>
        {history.map((h) => (
          <li key={`${h.attemptNo}-${h.recipient}`}>
            Attempt {h.attemptNo}, {h.recipient} ({h.email}): {STATUS_LABEL[h.status] ?? h.status}
            {h.sentAt ? ` · ${formatLongDateOfInstant(h.sentAt)}` : ''}
            {h.reconciledAt ? ` · reconciled ${formatLongDateOfInstant(h.reconciledAt)}${h.reconciledBy ? ` by ${h.reconciledBy}` : ''}` : ''}
            {h.reconcileNote ? ` · note: ${h.reconcileNote}` : ''}
            {h.lastError && !h.sentAt ? ` · ${h.lastError}` : ''}
          </li>
        ))}
      </ul>
    </details>
  );
}

/** Operator reconciliation for one copy: record the outcome checked in the provider, with a note. */
function ReconcileRow(props: { recipient: string; lastError: string | null; busy: boolean; onSubmit: (delivered: boolean, note: string) => void }) {
  const [note, setNote] = useState('');
  const ready = note.trim().length >= 3 && !props.busy;
  return (
    <div style={{ display: 'grid', gap: '0.4rem', padding: '0.5rem', border: '1px solid var(--outline-variant, #cbd5e1)', borderRadius: 8 }}>
      <span style={{ fontSize: '0.85rem' }}>
        The {props.recipient} copy needs reconciliation{props.lastError ? `: ${props.lastError}` : ''}. Check the Resend dashboard or logs, then record what you found.
      </span>
      <input
        aria-label={`What you checked for the ${props.recipient} copy`}
        placeholder="Provider evidence you checked (e.g. Resend log entry or message id)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        style={{ minHeight: 38, padding: '0.4rem 0.6rem', border: '1px solid var(--outline-variant, #cbd5e1)', borderRadius: 8 }}
      />
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-outline" style={{ minHeight: 38 }} disabled={!ready} onClick={() => props.onSubmit(true, note)}>
          Mark delivered
        </button>
        <button
          type="button"
          className="btn btn-outline"
          style={{ minHeight: 38 }}
          disabled={!ready}
          title="Allowed only after the provider's 24-hour idempotency window; before that, use Retry."
          onClick={() => props.onSubmit(false, note)}
        >
          Confirm not delivered
        </button>
      </div>
    </div>
  );
}
