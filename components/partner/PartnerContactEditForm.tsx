'use client';

import { useState } from 'react';
import { FormField } from '@/components/portal/kit';

export default function PartnerContactEditForm({
  partnerId,
  initialContactName,
  initialContactPhone,
}: {
  partnerId: string;
  initialContactName: string | null;
  initialContactPhone: string | null;
}) {
  const [contactName, setContactName] = useState(initialContactName ?? '');
  const [contactPhone, setContactPhone] = useState(initialContactPhone ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const res = await fetch('/api/partner/settings/contact', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactName: contactName.trim() || null,
          contactPhone: contactPhone.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : 'Failed to save.');
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="wa-flex wa-flex-col wa-gap-3">
      <FormField
        label="Contact name"
        type="text"
        value={contactName}
        onChange={(e) => setContactName(e.target.value)}
        maxLength={200}
        disabled={saving}
      />
      <FormField
        label="Contact phone"
        type="tel"
        value={contactPhone}
        onChange={(e) => setContactPhone(e.target.value)}
        maxLength={50}
        disabled={saving}
      />
      {error && (
        <div
          role="alert"
          style={{
            padding: '8px 10px',
            background: 'color-mix(in srgb, var(--wa-accent) 10%, transparent)',
            borderRadius: 'var(--wa-radius-sm)',
            color: 'var(--wa-accent)',
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}
      {saved && (
        <div
          role="status"
          style={{
            padding: '8px 10px',
            background: 'color-mix(in srgb, var(--wa-success) 12%, transparent)',
            borderRadius: 'var(--wa-radius-sm)',
            color: 'var(--wa-success-dark)',
            fontSize: 13,
          }}
        >
          Saved successfully.
        </div>
      )}
      <button
        type="submit"
        disabled={saving}
        className="wa-kit-focus"
        style={{
          alignSelf: 'flex-start',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '8px 16px',
          borderRadius: 'var(--wa-radius-sm)',
          background: 'var(--wa-accent)',
          color: 'var(--wa-on-accent-control)',
          fontWeight: 700,
          fontSize: 13,
          border: 'none',
          cursor: saving ? 'default' : 'pointer',
          opacity: saving ? 0.7 : 1,
        }}
      >
        {saving ? 'Saving…' : 'Save changes'}
      </button>
    </form>
  );
}
