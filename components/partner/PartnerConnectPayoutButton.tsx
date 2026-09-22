'use client';

import { useState } from 'react';

export default function PartnerConnectPayoutButton({
  label,
  fullWidth = false,
}: {
  label: string;
  fullWidth?: boolean;
}) {
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    setConnecting(true);
    setError(null);
    try {
      const res = await fetch('/api/partner/connect', { method: 'POST' });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      setError(typeof data.error === 'string' ? data.error : 'Something went wrong. Please try again.');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div>
      <button
        type="button"
        className="btn btn-primary"
        style={fullWidth ? { width: '100%' } : undefined}
        onClick={() => void handleClick()}
        disabled={connecting}
        aria-busy={connecting}
      >
        <span className="material-symbols-outlined" style={{ fontSize: '1rem', marginRight: '0.375rem' }} aria-hidden="true">
          account_balance
        </span>
        {connecting ? 'Connecting…' : label}
      </button>
      {error ? (
        <p role="alert" style={{ marginTop: '0.5rem', fontSize: '0.8125rem', color: 'var(--wa-accent-text)' }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
