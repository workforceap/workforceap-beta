'use client';

import { useCallback, useEffect, useState } from 'react';

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

type Affiliation = 'wap_staff' | 'partner' | 'independent' | 'community_ambassador';
const AFFILIATION_LABELS: Record<Affiliation, string> = {
  wap_staff: 'WorkforceAP Staff',
  partner: 'Partner Org',
  independent: 'Independent Advisor',
  community_ambassador: 'Community Ambassador',
};

export default function AdminCounselorsClient({ partners }: { partners: PartnerOpt[] }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState('');
  const [affiliation, setAffiliation] = useState<Affiliation>('wap_staff');
  const [partnerId, setPartnerId] = useState('');
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

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

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!userId.trim()) { setMsg({ type: 'err', text: 'Enter the user ID of the account to promote.' }); return; }
    if (affiliation === 'partner' && !partnerId) { setMsg({ type: 'err', text: 'Select a partner organization for partner-affiliated counselors.' }); return; }
    setSaving(true); setMsg(null);
    try {
      const r = await fetch('/api/admin/counselors', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: userId.trim(), partnerId: partnerId || null, affiliation, title: title.trim() || null }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg({ type: 'err', text: typeof data.error === 'string' ? data.error : 'Save failed' }); return; }
      const typeLabel = affiliation === 'independent' ? 'Advisor' : 'Counselor';
      setMsg({ type: 'ok', text: `${typeLabel} added. They can now sign in via the ${typeLabel === 'Advisor' ? 'Advisor' : 'Counselor'} portal.` });
      setUserId(''); setTitle(''); setAffiliation('wap_staff'); setPartnerId('');
      void load();
    } catch { setMsg({ type: 'err', text: 'Network error' }); }
    finally { setSaving(false); }
  }

  return (
    <div>
      {/* Add counselor form */}
      <div className="portal-card portal-card--flat" style={{ padding: '1.25rem', marginBottom: '1.5rem', maxWidth: '560px' }}>
        <h2 style={{ fontSize: '0.8125rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--color-on-surface-variant)', margin: '0 0 0.875rem' }}>
          Add Counselor
        </h2>
        <p style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', marginBottom: '1rem', lineHeight: 1.55 }}>
          Link an existing WorkforceAP user. Choose <strong>WorkforceAP Staff</strong> for internal team, <strong>Partner Org</strong> for affiliated counselors, or <strong>Independent Advisor</strong> for solo practitioners.
        </p>
        {msg && (
          <div role={msg.type === 'ok' ? 'status' : 'alert'} style={{ padding: '0.625rem 0.875rem', borderRadius: '0.625rem', background: msg.type === 'ok' ? 'rgba(74,155,79,0.1)' : 'rgba(173,44,77,0.1)', color: msg.type === 'ok' ? 'var(--wa-success-dark)' : 'var(--color-accent)', fontSize: '0.875rem', marginBottom: '0.75rem' }}>
            {msg.text}
          </div>
        )}
        <form onSubmit={handleAdd} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {[
            { id: 'admincounselorsclient-user-id-field', label: 'User ID (UUID)', value: userId, set: setUserId, placeholder: 'Paste from admin member detail URL', type: 'text' },
            { id: 'admincounselorsclient-title-field', label: 'Title (optional)', value: title, set: setTitle, placeholder: 'e.g. Career Coach', type: 'text' },
          ].map(({ id, label, value, set, placeholder, type }) => (
            <div key={id}>
              {/* Labels are tied to their inputs so screen readers name the fields (audit 2026-09-20). */}
              <label htmlFor={id} style={{ fontSize: '0.8125rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--color-on-surface-variant)', display: 'block', marginBottom: '0.375rem' }}>{label}</label>
              <input id={id} type={type} value={value} onChange={(e) => set(e.target.value)} placeholder={placeholder}
                style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '0.5rem', border: '1px solid var(--outline-variant)', background: 'var(--surface-container)', color: 'var(--color-on-surface)', fontSize: '0.875rem', boxSizing: 'border-box' as const }} />
            </div>
          ))}
          <div>
            <label htmlFor="admincounselorsclient-affiliation-field" style={{ fontSize: '0.8125rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--color-on-surface-variant)', display: 'block', marginBottom: '0.375rem' }}>Affiliation</label>
            <select id="admincounselorsclient-affiliation-field" value={affiliation} onChange={(e) => {
              const a = e.target.value as Affiliation;
              setAffiliation(a);
              if (a !== 'partner') setPartnerId('');
            }}
              style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '0.5rem', border: '1px solid var(--outline-variant)', background: 'var(--surface-container)', color: 'var(--color-on-surface)', fontSize: '0.875rem' }}>
              <option value="wap_staff">{AFFILIATION_LABELS.wap_staff}</option>
              <option value="partner">{AFFILIATION_LABELS.partner}</option>
              <option value="independent">{AFFILIATION_LABELS.independent}</option>
              <option value="community_ambassador">{AFFILIATION_LABELS.community_ambassador}</option>
            </select>
          </div>
          {affiliation === 'partner' && (
            <div>
              <label htmlFor="admincounselorsclient-partner-organization-field" style={{ fontSize: '0.8125rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--color-on-surface-variant)', display: 'block', marginBottom: '0.375rem' }}>Partner Organization</label>
              <select id="admincounselorsclient-partner-organization-field" value={partnerId} onChange={(e) => setPartnerId(e.target.value)}
                style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '0.5rem', border: '1px solid var(--outline-variant)', background: 'var(--surface-container)', color: 'var(--color-on-surface)', fontSize: '0.875rem' }}>
                <option value="">Select a partner…</option>
                {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          )}
          <button type="submit" className="btn btn-primary btn-sm" disabled={saving} aria-busy={saving} style={{ alignSelf: 'flex-start' }}>
            <span aria-live="polite" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              {saving ? (
                <>
                  <span className="material-symbols-outlined" style={{ fontSize: '1rem', animation: 'spin 1s linear infinite' }} aria-hidden="true">progress_activity</span>
                  Adding…
                </>
              ) : (
                'Add ' + (affiliation === 'independent' ? 'Advisor' : 'Counselor')
              )}
            </span>
          </button>
        </form>
      </div>

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
