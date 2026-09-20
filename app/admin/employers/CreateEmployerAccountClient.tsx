'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { collectInvalidFieldLabels, describeMissingRequired, focusFirstInvalid } from '@/lib/forms/requiredFields';

type MemberRow = { id: string; fullName: string; email: string };

export default function CreateEmployerAccountClient() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [searching, setSearching] = useState(false);
  const [hits, setHits] = useState<MemberRow[]>([]);
  const [selected, setSelected] = useState<MemberRow | null>(null);
  const [companyName, setCompanyName] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [companyWebsite, setCompanyWebsite] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(async () => {
    const term = q.trim();
    if (term.length < 2) {
      setHits([]);
      return;
    }
    setSearching(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/members?q=${encodeURIComponent(term)}&limit=20`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Search failed');
        setHits([]);
        return;
      }
      setHits(data as MemberRow[]);
    } finally {
      setSearching(false);
    }
  }, [q]);

  function pickMember(m: MemberRow) {
    setSelected(m);
    setContactName(m.fullName);
    setContactEmail(m.email);
    setHits([]);
    setQ('');
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Name every blocker at once, inline, instead of the browser tooltip
    // (audit 2026-09-20: eight fields filled, nothing sent, no message).
    const formEl = e.currentTarget;
    const portalUser = selected;
    const missing = collectInvalidFieldLabels(formEl);
    if (!portalUser) missing.unshift('Portal user (search above and select who will log in)');
    if (!portalUser || missing.length > 0) {
      setError(describeMissingRequired(missing, { leadIn: 'Before you can create this employer account' }));
      if (portalUser) focusFirstInvalid(formEl);
      return;
    }
    if (!companyName.trim() || !contactName.trim() || !contactEmail.trim()) {
      setError('Company name, contact name, and contact email are required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/employers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: portalUser.id,
          companyName: companyName.trim(),
          contactName: contactName.trim(),
          contactEmail: contactEmail.trim(),
          contactPhone: contactPhone.trim() || null,
          companyWebsite: companyWebsite.trim() ? companyWebsite.trim() : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Could not create employer account');
        return;
      }
      setSelected(null);
      setCompanyName('');
      setContactName('');
      setContactEmail('');
      setContactPhone('');
      setCompanyWebsite('');
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <section style={{ marginTop: '2.5rem', paddingTop: '2rem', borderTop: '1px solid var(--color-border)' }}>
      <h2 style={{ fontSize: '1.2rem', marginBottom: '0.5rem' }}>Create employer portal account</h2>
      <p style={{ color: 'var(--color-on-surface-variant)', fontSize: '0.9rem', marginBottom: '1.25rem' }}>
        Link an existing site user (they sign in with their usual email) to a company record so they can use{' '}
        <strong>/employer</strong>. Super-admins can then use <strong>Open portal</strong> to work inside their account.
      </p>

      {error && (
        <div
          id="createemployeraccountclient-error"
          role="alert"
          style={{
            padding: '0.75rem',
            marginBottom: '1rem',
            background: 'color-mix(in srgb, var(--color-accent) 10%, transparent)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--color-accent)',
            fontSize: '0.9rem',
          }}
        >
          {error}
        </div>
      )}

      <form onSubmit={submit} noValidate style={{ maxWidth: 520 }}>
        <div className="form-group">
          <label htmlFor="createemployeraccountclient-find-user-by-name-or-email-field">Find user by name or email</label>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <input id="createemployeraccountclient-find-user-by-name-or-email-field"
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="e.g. name or email"
              disabled={saving}
              style={{ flex: '1 1 200px' }}
            />
            <button type="button" className="btn btn-muted" onClick={search} disabled={searching || saving}>
              {searching ? 'Searching…' : 'Search'}
            </button>
          </div>
          {hits.length > 0 && (
            <ul
              style={{
                listStyle: 'none',
                padding: 0,
                margin: '0.5rem 0 0',
                border: '1px solid var(--color-border)',
                borderRadius: 8,
                maxHeight: 200,
                overflowY: 'auto',
              }}
            >
              {hits.map((m) => (
                <li key={m.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <button
                    type="button"
                    onClick={() => pickMember(m)}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      padding: '0.5rem 0.75rem',
                      background: 'var(--color-light)',
                      border: 'none',
                      cursor: 'pointer',
                      font: 'inherit',
                    }}
                  >
                    <strong>{m.fullName}</strong>
                    <div style={{ fontSize: '0.85rem', color: 'var(--color-on-surface-variant)' }}>{m.email}</div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {selected && (
          <p style={{ fontSize: '0.9rem', marginBottom: '1rem' }}>
            Selected: <strong>{selected.fullName}</strong> ({selected.email})
            <button
              type="button"
              className="btn btn-outline btn-sm"
              style={{ marginLeft: '0.5rem', color: 'var(--color-on-surface)', borderColor: 'var(--outline-variant)' }}
              onClick={() => setSelected(null)}
            >
              Clear
            </button>
          </p>
        )}

        <div className="form-group">
          <label htmlFor="createemployeraccountclient-company-name-field">Company name *</label>
          <input id="createemployeraccountclient-company-name-field"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            required
            disabled={saving}
          />
        </div>
        <div className="form-group">
          <label htmlFor="createemployeraccountclient-contact-name-field">Contact name *</label>
          <input id="createemployeraccountclient-contact-name-field" value={contactName} onChange={(e) => setContactName(e.target.value)} required disabled={saving} />
        </div>
        <div className="form-group">
          <label htmlFor="createemployeraccountclient-contact-email-field">Contact email *</label>
          <input id="createemployeraccountclient-contact-email-field" type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} required disabled={saving} />
        </div>
        <div className="form-group">
          <label htmlFor="createemployeraccountclient-contact-phone-field">Contact phone</label>
          <input id="createemployeraccountclient-contact-phone-field" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} disabled={saving} />
        </div>
        <div className="form-group">
          <label htmlFor="createemployeraccountclient-company-website-field">Company website</label>
          <input id="createemployeraccountclient-company-website-field"
            type="url"
            placeholder="https://"
            value={companyWebsite}
            onChange={(e) => setCompanyWebsite(e.target.value)}
            disabled={saving}
          />
        </div>
        <button type="submit" className="btn btn-primary" disabled={saving} aria-describedby={error ? 'createemployeraccountclient-error' : undefined}>
          {saving ? 'Creating…' : 'Create employer account'}
        </button>
      </form>
    </section>
  );
}
