'use client';

import { useId, useState } from 'react';

type Props = {
  currentName: string;
  currentContactName: string;
  currentContactEmail: string;
  currentContactPhone: string;
  currentOrgType: string;
};

export default function PartnerSettingsEditRequest({
  currentName,
  currentContactName,
  currentContactEmail,
  currentContactPhone,
  currentOrgType,
}: Props) {
  const idPrefix = useId();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(currentName);
  const [contactName, setContactName] = useState(currentContactName);
  const [contactEmail, setContactEmail] = useState(currentContactEmail);
  const [contactPhone, setContactPhone] = useState(currentContactPhone);
  const [orgType, setOrgType] = useState(currentOrgType);
  const [notes, setNotes] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    setError(null);
    try {
      const body = [
        `Organization name: ${name}`,
        `Contact name: ${contactName}`,
        `Contact email: ${contactEmail}`,
        `Contact phone: ${contactPhone}`,
        `Organization type: ${orgType}`,
        notes ? `\nNotes: ${notes}` : '',
      ].filter(Boolean).join('\n');

      const res = await fetch('/api/partner/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: `[Settings change request]\n\n${body}` }),
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to send');
      setSent(true);
      setOpen(false);
    } catch {
      setError('Could not send your request. Please try again or email info@workforceap.org.');
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.875rem', background: 'rgba(74,155,79,0.08)', border: '1px solid rgba(74,155,79,0.2)', borderRadius: '0.75rem' }}>
        <span className="material-symbols-outlined" style={{ color: 'var(--color-green, #4a9b4f)', fontSize: '1.25rem', fontVariationSettings: "'FILL' 1", flexShrink: 0 }} aria-hidden="true">check_circle</span>
        <div>
          <p style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--color-on-surface)', margin: 0 }}>Request sent</p>
          <p style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', margin: '0.2rem 0 0' }}>
            We&rsquo;ll review your request, apply the changes, and email you when they&rsquo;re live.
          </p>
        </div>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem', padding: '0.5rem 1rem', borderRadius: '0.625rem', border: '1px solid var(--outline-variant)', background: 'var(--surface-container)', color: 'var(--wa-accent-text)', fontWeight: 700, fontSize: '0.875rem', cursor: 'pointer' }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: '1rem', fontVariationSettings: "'FILL' 1" }} aria-hidden="true">edit</span>
        Request changes
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
      {[
        { label: 'Organization name', value: name, set: setName, type: 'text' },
        { label: 'Contact name', value: contactName, set: setContactName, type: 'text' },
        { label: 'Contact email', value: contactEmail, set: setContactEmail, type: 'email' },
        { label: 'Contact phone', value: contactPhone, set: setContactPhone, type: 'tel' },
        { label: 'Organization type', value: orgType, set: setOrgType, type: 'text' },
      ].map(({ label, value, set, type }) => (
        <div key={label}>
          <label htmlFor={`${idPrefix}-${label.toLowerCase().replace(/\s+/g, '-')}`} style={{ fontSize: '0.8125rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--color-on-surface-variant)', display: 'block', marginBottom: '0.375rem' }}>
            {label}
          </label>
          <input
            id={`${idPrefix}-${label.toLowerCase().replace(/\s+/g, '-')}`}
            type={type}
            value={value}
            onChange={(e) => set(e.target.value)}
            style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '0.5rem', border: '1px solid var(--outline-variant)', background: 'var(--surface-container)', color: 'var(--color-on-surface)', fontSize: '0.875rem', boxSizing: 'border-box' }}
          />
        </div>
      ))}
      <div>
        <label htmlFor="partnersettingseditrequest-additional-notes-optional-field" style={{ fontSize: '0.8125rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--color-on-surface-variant)', display: 'block', marginBottom: '0.375rem' }}>
          Additional notes (optional)
        </label>
        <textarea id="partnersettingseditrequest-additional-notes-optional-field"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Anything else we should know..."
          style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '0.5rem', border: '1px solid var(--outline-variant)', background: 'var(--surface-container)', color: 'var(--color-on-surface)', fontSize: '0.875rem', resize: 'vertical', boxSizing: 'border-box' }}
        />
      </div>
      {error && <p role="alert" style={{ fontSize: '0.875rem', color: 'var(--wa-accent-text)', margin: 0 }}>{error}</p>}
      <div style={{ display: 'flex', gap: '0.625rem' }}>
        <button
          type="submit"
          disabled={sending}
          className="btn btn-primary"
          style={{ flex: 1 }}
        >
          {sending ? 'Sending…' : 'Submit change request'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="btn btn-outline"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
