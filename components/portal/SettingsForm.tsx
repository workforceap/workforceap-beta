'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getErrorMessageFromResponse } from '@/lib/fetchWithTimeout';

type SettingsFormProps = {
  defaultUpdates: boolean;
  defaultReminders: boolean;
};

export default function SettingsForm({ defaultUpdates, defaultReminders }: SettingsFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [updates, setUpdates] = useState(defaultUpdates);
  const [reminders, setReminders] = useState(defaultReminders);
  const [error, setError] = useState<string | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  const handleChange = async (field: 'updates' | 'reminders', value: boolean) => {
    setError(null);
    if (field === 'updates') setUpdates(value);
    else setReminders(value);
    setLoading(true);
    // On failure, put the checkbox back so the UI never shows a state the server rejected.
    const revert = () => {
      if (field === 'updates') setUpdates(!value);
      else setReminders(!value);
    };
    try {
      const res = await fetch('/api/member/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notificationsUpdates: field === 'updates' ? value : updates,
          notificationsReminders: field === 'reminders' ? value : reminders,
        }),
      });
      if (!res.ok) {
        const msg = await getErrorMessageFromResponse(res);
        revert();
        setError(msg);
        return;
      }
      router.refresh();
    } catch {
      revert();
      setError('Could not save settings. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {error && (
        <div
          ref={errorRef}
          role="alert"
          aria-live="polite"
          tabIndex={-1}
          style={{
            padding: '0.75rem 1rem',
            borderRadius: '0.75rem',
            background: 'rgba(173,44,77,0.08)',
            border: '1px solid rgba(173,44,77,0.2)',
            color: 'var(--wa-accent-text)',
            fontSize: '0.875rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '1.1rem' }}>error</span>
          <p style={{ margin: 0, fontWeight: 600 }}>{error}</p>
        </div>
      )}
      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minHeight: '44px', cursor: loading ? 'not-allowed' : 'pointer' }}>
        <input
          type="checkbox"
          checked={updates}
          onChange={(e) => handleChange('updates', e.target.checked)}
          disabled={loading}
        />
        <span>Updates from WorkforceAP</span>
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minHeight: '44px', cursor: loading ? 'not-allowed' : 'pointer' }}>
        <input
          type="checkbox"
          checked={reminders}
          onChange={(e) => handleChange('reminders', e.target.checked)}
          disabled={loading}
        />
        <span>Training reminders</span>
      </label>
    </div>
  );
}
