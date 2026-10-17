'use client';

import { useCallback, useEffect, useState } from 'react';
import { AddCounselorForm } from '@/components/admin/AddCounselorForm';

type Row = {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  title: string | null;
  active: boolean;
  affiliation: string;
  partnerId: string | null;
  partnerName: string | null;
  label: string;
};
type PartnerOpt = { id: string; name: string };

export default function AdminCounselorsClient({ partners }: { partners: PartnerOpt[] }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/admin/counselors', { credentials: 'include' });
      const d = await r.json();
      if (r.ok && d.counselors) setRows(d.counselors);
      else setRows([]);
    } catch { setRows([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const setActive = useCallback(async (row: Row, active: boolean) => {
    setActionError(null);
    setBusyId(row.id);
    try {
      const r = await fetch(`/api/admin/counselors/${row.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setActionError(typeof d.error === 'string' ? d.error : 'Could not update counselor status.');
        return;
      }
      await load();
    } catch {
      setActionError('Could not update counselor status.');
    } finally {
      setBusyId(null);
    }
  }, [load]);

  return (
    <div>
      <AddCounselorForm partners={partners} onAdded={() => void load()} />

      {/* Counselors list */}
      <div>
        <div className="portal-dash-section-header" style={{ marginBottom: '0.875rem' }}>
          <h2 className="portal-heading-with-bar portal-section-heading" style={{ margin: 0 }}>
            All Counselors
          </h2>
          <span style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>
            {loading ? '…' : `${rows.length} total`}
          </span>
        </div>

        {actionError ? (
          <p role="alert" style={{ color: 'var(--wa-danger, #b42318)', fontSize: '0.875rem', marginBottom: '0.75rem' }}>
            {actionError}
          </p>
        ) : null}

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {[1, 2, 3].map(i => <div key={i} className="portal-skeleton" style={{ height: '4rem', borderRadius: '0.875rem' }} />)}
          </div>
        ) : rows.length === 0 ? (
          <p style={{ color: 'var(--color-on-surface-variant)', fontSize: '0.875rem' }}>No counselors yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {rows.map((r) => {
              const initials = r.fullName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
              const toggling = busyId === r.id;
              return (
                <div key={r.id} className="portal-activity-item" style={{ justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', flex: 1, minWidth: 0 }}>
                    <div style={{ width: '2.5rem', height: '2.5rem', borderRadius: '9999px', background: 'linear-gradient(135deg, var(--color-accent-dark), var(--color-accent))', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: '0.875rem', flexShrink: 0 }}>
                      {initials}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontWeight: 700, fontSize: '0.9375rem', color: 'var(--color-on-surface)', margin: 0 }}>{r.fullName}</p>
                      <p style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', margin: '0.125rem 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.email} · {r.affiliation === 'independent' ? 'Independent Advisor' : (r.partnerName ?? 'WorkforceAP')}{r.title ? ` · ${r.title}` : ''}
                      </p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                    <span style={{ fontSize: '0.8125rem', fontWeight: 800, padding: '0.15rem 0.5rem', borderRadius: '9999px', background: r.affiliation === 'independent' ? 'rgba(30,58,138,0.12)' : 'var(--surface-container-high)', color: r.affiliation === 'independent' ? '#1e3a8a' : 'var(--color-on-surface-variant)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                      {r.affiliation === 'independent' ? 'Advisor' : 'Counselor'}
                    </span>
                    <span style={{ fontSize: '0.8125rem', fontWeight: 800, padding: '0.15rem 0.5rem', borderRadius: '9999px', background: r.active ? 'rgba(74,155,79,0.12)' : 'var(--surface-container-high)', color: r.active ? 'var(--wa-success-dark)' : 'var(--color-on-surface-variant)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                      {r.active ? 'Active' : 'Inactive'}
                    </span>
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      disabled={toggling || busyId !== null}
                      onClick={() => void setActive(r, !r.active)}
                    >
                      {toggling ? '…' : r.active ? 'Deactivate' : 'Activate'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
