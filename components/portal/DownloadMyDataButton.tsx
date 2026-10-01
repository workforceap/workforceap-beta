'use client';

import { useState } from 'react';

export default function DownloadMyDataButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleDownload = async () => {
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/member/export-data');
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? 'Failed to download data');
        setLoading(false);
        return;
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `workforceap-my-data-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      setError('Download failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <button
        type="button"
        onClick={handleDownload}
        disabled={loading}
        className="btn btn-outline"
        style={{ fontSize: '0.875rem' }}
      >
        {loading ? (
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span
              className="material-symbols-outlined"
              style={{ fontSize: '1rem', animation: 'spin 1s linear infinite' }}
            >
              progress_activity
            </span>
            Preparing download…
          </span>
        ) : (
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>
              download
            </span>
            Download My Data
          </span>
        )}
      </button>
      {error && (
        <p style={{ fontSize: '0.8125rem', color: 'var(--wa-accent-text)', margin: 0 }}>
          {error}
        </p>
      )}
      <p
        style={{
          fontSize: '0.8125rem',
          color: 'var(--color-on-surface-variant)',
          margin: 0,
          lineHeight: 1.5,
        }}
      >
        Download a complete copy of your personal data in JSON format.
        This may take a moment if you have a lot of activity.
      </p>
    </div>
  );
}
