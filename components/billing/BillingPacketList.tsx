'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { requestFailureMessage } from '@/lib/http/requestFailureCopy';
import type { BillingPacketSummary } from '@/lib/billing/packetAccess';
import { formatLongDate, formatLongDateOfInstant, formatMoney } from '@/lib/billing/packetText';

type BillingPacketListProps = {
  packets: BillingPacketSummary[];
  /** Admins get the "Email to counselor and student" button. */
  canSend?: boolean;
  /** Who the send goes to, shown next to the button so the admin knows before pressing it. */
  counselorLabel?: string | null;
  memberEmail?: string | null;
  /** Called with the updated packet after a successful send. */
  onPacketUpdated?: (packet: BillingPacketSummary) => void;
  emptyText?: string;
};

type SendState = { id: string; busy: boolean; ok?: boolean; message?: string } | null;

type SendAction = { action?: 'send' | 'email_again' | 'reconcile'; recipient?: string; delivered?: boolean; note?: string };

/** Button label and request for the current attempt's next action (the send route enforces the same rule). */
function primaryAction(p: BillingPacketSummary): { label: string; body: SendAction; disabled: boolean; why?: string } {
  switch (p.sendState?.nextAction ?? 'send') {
    case 'retry':
      return { label: 'Retry (same attempt, same keys)', body: { action: 'send' }, disabled: false };
    case 'in_progress':
      return { label: 'Sending…', body: {}, disabled: true, why: 'A copy is being sent right now.' };
    case 'reconcile':
      return { label: 'Email again', body: {}, disabled: true, why: 'A copy needs reconciliation below before anything else can be sent.' };
    case 'email_again':
      return { label: 'Email again to counselor and student (new attempt)', body: { action: 'email_again' }, disabled: false };
    default:
      return { label: 'Email to counselor and student', body: { action: 'send' }, disabled: false };
  }
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
  counselorLabel,
  memberEmail,
  onPacketUpdated,
  emptyText = 'No invoice packets yet.',
}: BillingPacketListProps) {
  const [send, setSend] = useState<SendState>(null);
  const tCommon = useTranslations('common');

  if (packets.length === 0) {
    return <p style={{ margin: 0, color: 'var(--color-muted, #64748b)', fontSize: '0.95rem' }}>{emptyText}</p>;
  }

  const sendPacket = async (packet: BillingPacketSummary, body: SendAction = {}) => {
    setSend({ id: packet.id, busy: true });
    try {
      const res = await fetch(`/api/billing-packets/${packet.id}/send`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        packet?: BillingPacketSummary;
        sentTo?: string[];
        counselorMissing?: boolean;
      };
      if (data.packet && onPacketUpdated) onPacketUpdated(data.packet);
      if (!res.ok) {
        setSend({ id: packet.id, busy: false, ok: false, message: data.error ?? 'Could not send the documents right now.' });
        return;
      }
      const to = (data.sentTo ?? []).join(', ');
      const warn = data.counselorMissing ? ' No counselor was assigned when it was signed, so only the student received it.' : '';
      setSend({ id: packet.id, busy: false, ok: true, message: `Sent to ${to}.${warn}` });
    } catch (err) {
      setSend({ id: packet.id, busy: false, ok: false, message: requestFailureMessage(err, { connection: tCommon('connectionError'), fallback: 'Could not send the documents right now.' }, 'billing-packet-send') });
    }
  };

  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.75rem' }}>
      {packets.map((p) => {
        const state = send?.id === p.id ? send : null;
        return (
          <li key={p.id} className="wa-kit-card" style={{ padding: '1rem', display: 'grid', gap: '0.6rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'baseline' }}>
              <div>
                <strong style={{ fontSize: '1rem' }}>Invoice {p.packetNumber}</strong>
                <span style={{ marginLeft: 8, fontSize: '0.8125rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: p.status === 'sent' ? 'var(--color-green, #15803d)' : 'var(--color-accent, #ad2c4d)' }}>
                  {p.status === 'sent' ? 'Sent' : 'Signed'}
                </span>
              </div>
              <strong>{formatMoney(p.totalAmount)}</strong>
            </div>
            <div style={{ fontSize: '0.9rem', color: 'var(--color-muted, #64748b)', lineHeight: 1.5 }}>
              {p.programTitle} · {formatLongDate(p.invoiceDate)} · billed to {p.billToName}
              {p.referenceNumber ? ` · ref ${p.referenceNumber}` : ''}
              <br />
              Signed by {p.signerName}, {p.signerTitle}
              {p.sentAt ? ` · emailed ${formatLongDateOfInstant(p.sentAt)}${p.sendCount > 1 ? ` (${p.sendCount} times)` : ''}` : ''}
            </div>
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
              {canSend ? (
                <button
                  type="button"
                  className="btn"
                  style={{ minHeight: 40 }}
                  disabled={Boolean(state?.busy) || primaryAction(p).disabled}
                  title={primaryAction(p).why}
                  onClick={() => void sendPacket(p, primaryAction(p).body)}
                >
                  {state?.busy ? 'Sending…' : primaryAction(p).label}
                </button>
              ) : null}
            </div>
            {canSend ? (
              <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--color-muted, #64748b)' }}>
                {/* The admin is cc'd on the counselor copy only, so there is no cc without a counselor. */}
                Goes to {p.recipients ? p.recipients.student : (memberEmail ?? 'the student')}
                {(p.recipients ? p.recipients.counselor : counselorLabel)
                  ? ` and ${p.recipients ? p.recipients.counselor : counselorLabel}; you are cc\u2019d on the counselor copy.`
                  : ' only (no counselor was assigned at signing, so no counselor copy and no cc to you).'}
              </p>
            ) : null}
            {state && !state.busy && state.message ? (
              <p role="status" style={{ margin: 0, fontSize: '0.9rem', color: state.ok ? 'var(--color-green, #15803d)' : 'var(--color-accent, #ad2c4d)' }}>
                {state.message}
              </p>
            ) : null}
            {canSend && primaryAction(p).why ? (
              <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--color-accent, #ad2c4d)' }}>{primaryAction(p).why}</p>
            ) : null}
            {canSend && p.sendState?.nextAction === 'reconcile'
              ? p.sendState.rows
                  .filter((r) => r.status === 'needs_reconciliation')
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
        placeholder="What you checked (e.g. Resend log entry)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        style={{ minHeight: 38, padding: '0.4rem 0.6rem', border: '1px solid var(--outline-variant, #cbd5e1)', borderRadius: 8 }}
      />
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-outline" style={{ minHeight: 38 }} disabled={!ready} onClick={() => props.onSubmit(true, note)}>
          Mark delivered
        </button>
        <button type="button" className="btn btn-outline" style={{ minHeight: 38 }} disabled={!ready} onClick={() => props.onSubmit(false, note)}>
          Confirm not delivered
        </button>
      </div>
    </div>
  );
}
