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

  const sendPacket = async (packet: BillingPacketSummary) => {
    setSend({ id: packet.id, busy: true });
    try {
      const res = await fetch(`/api/billing-packets/${packet.id}/send`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        packet?: BillingPacketSummary;
        sentTo?: string[];
        counselorMissing?: boolean;
        warnings?: string[];
      };
      if (!res.ok) throw new Error(data.error ?? 'Could not send the documents right now.');
      const to = (data.sentTo ?? []).join(', ');
      const warn = data.counselorMissing ? ' No counselor is assigned yet, so only the student received it.' : '';
      const extra = data.warnings && data.warnings.length ? ` ${data.warnings.join(' ')}` : '';
      setSend({ id: packet.id, busy: false, ok: true, message: `Sent to ${to}.${warn}${extra}` });
      if (data.packet && onPacketUpdated) onPacketUpdated(data.packet);
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
                <button type="button" className="btn" style={{ minHeight: 40 }} disabled={Boolean(state?.busy)} onClick={() => void sendPacket(p)}>
                  {state?.busy ? 'Sending…' : p.status === 'sent' ? 'Email again to counselor and student' : 'Email to counselor and student'}
                </button>
              ) : null}
            </div>
            {canSend ? (
              <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--color-muted, #64748b)' }}>
                {/* The admin is cc'd on the counselor copy only, so there is no cc without a counselor. */}
                Goes to {memberEmail ?? 'the student'}
                {counselorLabel ? ` and ${counselorLabel}; you are cc\u2019d on the counselor copy.` : ' only (no counselor assigned yet, so no counselor copy and no cc to you).'}
              </p>
            ) : null}
            {state && !state.busy && state.message ? (
              <p role="status" style={{ margin: 0, fontSize: '0.9rem', color: state.ok ? 'var(--color-green, #15803d)' : 'var(--color-accent, #ad2c4d)' }}>
                {state.message}
              </p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
