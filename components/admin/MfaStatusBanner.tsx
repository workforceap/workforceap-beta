'use client';

import { useEffect, useState } from 'react';

export default function MfaStatusBanner() {
  const [mfaStatus, setMfaStatus] = useState<'checking' | 'enrolled' | 'missing' | 'audit-suppressed'>('checking');

  useEffect(() => {
    fetch('/api/auth/check-mfa-required')
      .then(async (r) => {
        if (!r.ok) return setMfaStatus('missing');
        const data = await r.json();
        if (data.auditSuppressed === true) {
          setMfaStatus('audit-suppressed');
          return;
        }
        if (data.mfaEnforcement === false) {
          setMfaStatus('enrolled');
          return;
        }
        // If no session or already aal2, MFA is enrolled
        if (!data.mfaRequired && data.currentAal === 'aal2') {
          setMfaStatus('enrolled');
        } else if (!data.mfaRequired && data.currentAal === 'aal1' && data.nextAal === 'aal1') {
          // aal1 with no next level = no factor enrolled
          setMfaStatus('missing');
        } else {
          setMfaStatus('missing');
        }
      })
      .catch(() => setMfaStatus('missing'));
  }, []);

  if (mfaStatus === 'audit-suppressed') {
    return <span hidden data-portal-audit-suppressed="staff-mfa-rate-limit-and-auth-cookie-refresh" />;
  }

  if (mfaStatus === 'checking' || mfaStatus === 'enrolled') return null;

  return (
    <div
      style={{
        background: 'color-mix(in srgb, var(--color-error) 8%, transparent)',
        border: '1px solid color-mix(in srgb, var(--color-error) 20%, transparent)',
        borderRadius: 'var(--radius-md)',
        padding: '0.875rem 1rem',
        marginBottom: '1rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
      }}
    >
      <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--color-error)', flexShrink: 0 }}>warning</span>
      <div style={{ flex: 1 }}>
        <p style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--color-on-surface)', margin: '0 0 0.15rem' }}>
          Two-Factor Authentication Required
        </p>
        <p style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', margin: 0 }}>
          Admin and counselor accounts must have 2FA enabled.{' '}
          <a href="/setup-mfa" style={{ color: 'var(--color-accent)', fontWeight: 600, textDecoration: 'none' }}>
            Set up now →
          </a>
        </p>
      </div>
    </div>
  );
}
