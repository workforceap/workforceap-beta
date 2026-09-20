'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import DataTable from '@/components/portal/ui/DataTable';

export type PayoutRow = {
  placementId: string;
  memberName: string;
  employerName: string | null;
  jobTitle: string | null;
  placedAt: string | null;
  paid: boolean;
  /** Human-readable reason the payout is blocked, or null when sendable. */
  blockedReason: string | null;
};

type Props = {
  partnerId: string;
  rows: PayoutRow[];
  payoutAmountUsd: number;
  /** False when the partner type is not payout-eligible or Stripe isn't active. */
  payoutsAvailable: boolean;
  payoutsUnavailableReason: string | null;
};

/**
 * Admin UI for the previously curl-only POST /api/partner/payout. One button
 * per verified, unpaid placement; the route re-checks every gate server-side.
 */
export default function PartnerPayoutsPanel({
  partnerId,
  rows,
  payoutAmountUsd,
  payoutsAvailable,
  payoutsUnavailableReason,
}: Props) {
  const router = useRouter();
  const [confirming, setConfirming] = useState<PayoutRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const closeConfirm = () => {
    if (!busy) setConfirming(null);
  };
  const trapRef = useFocusTrap(!!confirming, closeConfirm);

  async function sendPayout(row: PayoutRow) {
    setBusy(true);
    setHint(null);
    try {
      const res = await fetch('/api/partner/payout', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partnerId, placementId: row.placementId }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; transferId?: string; amount?: number };
      if (!res.ok) {
        setHint({ type: 'err', text: data.error ?? 'Payout failed' });
        return;
      }
      setHint({ type: 'ok', text: `Sent $${data.amount ?? payoutAmountUsd} for ${row.memberName} (transfer ${data.transferId ?? ''})` });
      router.refresh();
    } catch {
      setHint({ type: 'err', text: 'Network error — the payout may not have been sent. Check before retrying.' });
    } finally {
      setBusy(false);
      setConfirming(null);
    }
  }

  if (rows.length === 0) return null;

  return (
    <section style={{ marginTop: '2rem' }}>
      <h2 style={{ fontSize: '1.1rem', marginBottom: '0.25rem' }}>Placement payouts</h2>
      <p style={{ fontSize: '0.85rem', color: 'var(--color-on-surface-variant)', marginBottom: '0.75rem' }}>
        ${payoutAmountUsd} per verified placement, paid via Stripe Connect. Every send is idempotent and audited.
      </p>
      {!payoutsAvailable && payoutsUnavailableReason ? (
        <p style={{ fontSize: '0.85rem', color: '#b45309', marginBottom: '0.75rem' }}>{payoutsUnavailableReason}</p>
      ) : null}
      {hint ? (
        <p role={hint.type === 'err' ? 'alert' : 'status'} style={{ fontSize: '0.85rem', margin: '0 0 0.75rem', color: hint.type === 'ok' ? '#166534' : '#b91c1c' }}>
          {hint.text}
        </p>
      ) : null}
      <div className="admin-table-scroll">
        <DataTable
          variant="admin"
          tableClassName="admin-table admin-table--dense"
          scrollX={false}
          rows={rows}
          rowKey={(row) => row.placementId}
          columns={[
            { key: 'member', header: 'Member', cell: (row) => row.memberName },
            { key: 'employer', header: 'Employer', cell: (row) => row.employerName ?? '—' },
            { key: 'role', header: 'Role', cell: (row) => row.jobTitle ?? '—' },
            { key: 'placed', header: 'Placed', cell: (row) => (row.placedAt ? new Date(row.placedAt).toLocaleDateString() : '—') },
            {
              key: 'payout',
              header: 'Payout',
              cell: (row) =>
                row.paid ? (
                  <span style={{ color: '#166534', fontWeight: 600 }}>Paid</span>
                ) : row.blockedReason || !payoutsAvailable ? (
                  <span style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>
                    {row.blockedReason ?? payoutsUnavailableReason}
                  </span>
                ) : (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={busy}
                    onClick={() => setConfirming(row)}
                  >
                    Send ${payoutAmountUsd} payout
                  </button>
                ),
            },
          ]}
        />
      </div>

      {confirming && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="payout-confirm-title"
          onClick={(e) => { if (e.target === e.currentTarget) closeConfirm(); }}
          style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
        >
          <div ref={trapRef as React.RefObject<HTMLDivElement>} style={{ background: 'var(--color-surface, #fff)', borderRadius: 12, padding: '1.5rem', maxWidth: 420, width: '100%' }}>
            <h3 id="payout-confirm-title" style={{ marginTop: 0 }}>Send ${payoutAmountUsd} payout?</h3>
            <p style={{ fontSize: '0.9rem' }}>
              This transfers ${payoutAmountUsd} to the partner&apos;s Stripe account for {confirming.memberName}&apos;s
              placement{confirming.employerName ? ` at ${confirming.employerName}` : ''}. It cannot be undone from here.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
              <button type="button" className="btn btn-outline" onClick={closeConfirm} disabled={busy}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void sendPayout(confirming)}>
                {busy ? 'Sending…' : 'Confirm payout'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
