'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type PartnerOpt = { id: string; name: string };

type Affiliation = 'wap_staff' | 'partner' | 'independent' | 'community_ambassador';
const AFFILIATION_LABELS: Record<Affiliation, string> = {
  wap_staff: 'WorkforceAP Staff',
  partner: 'Partner Org',
  independent: 'Independent Advisor',
  community_ambassador: 'Community Ambassador',
};

/**
 * Promote an existing user to counselor / advisor (POST /api/admin/counselors).
 * Shared by the default kit roster and the ?ui=legacy client (WAP-193). With
 * no `onAdded`, a successful add refreshes the server-rendered page.
 */
export function AddCounselorForm({ partners, onAdded }: { partners: PartnerOpt[]; onAdded?: () => void }) {
  const router = useRouter();
  const [userId, setUserId] = useState('');
  const [affiliation, setAffiliation] = useState<Affiliation>('wap_staff');
  const [partnerId, setPartnerId] = useState('');
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

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
      if (onAdded) onAdded();
      else router.refresh();
    } catch { setMsg({ type: 'err', text: 'Network error' }); }
    finally { setSaving(false); }
  }

  return (
    <>
      {/* Add counselor form */}
      <div className="portal-card portal-card--flat" style={{ padding: '1.25rem', marginBottom: '1.5rem', maxWidth: '560px' }}>
        <h2 style={{ fontSize: '0.8125rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--color-on-surface-variant)', margin: '0 0 0.875rem' }}>
          Add Counselor
        </h2>
        <p style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', marginBottom: '1rem', lineHeight: 1.55 }}>
          Link an existing WorkforceAP user. Choose <strong>WorkforceAP Staff</strong> for internal team, <strong>Partner Org</strong> for affiliated counselors, or <strong>Independent Advisor</strong> for solo practitioners.
        </p>
        {msg && (
          <div role={msg.type === 'ok' ? 'status' : 'alert'} style={{ padding: '0.625rem 0.875rem', borderRadius: '0.625rem', background: msg.type === 'ok' ? 'rgba(74,155,79,0.1)' : 'rgba(173,44,77,0.1)', color: msg.type === 'ok' ? 'var(--wa-success-dark)' : 'var(--wa-accent-text)', fontSize: '0.875rem', marginBottom: '0.75rem' }}>
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

    </>
  );
}
