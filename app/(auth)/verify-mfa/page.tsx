'use client';

import { CircleCheck, ShieldCheck } from 'lucide-react';

import actionStyles from '@/components/auth/AuthActions.module.css';
import { fetchAuth } from '@/lib/fetchWithTimeout';
import { useState, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import LocalizedLink from '@/components/LocalizedLink';
import { sanitizeRedirectPath } from '@/lib/auth/safeRedirectPath';
import { trackFunnelEvent, trackMemberLoggedIn } from '@/lib/analytics/events';

function getMfaNextPath() {
  if (typeof window === 'undefined') return '/dashboard';
  return sanitizeRedirectPath(new URLSearchParams(window.location.search).get('next'), '/dashboard');
}

export default function VerifyMfaPage() {
  const tAuth = useTranslations('auth');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [trustDevice, setTrustDevice] = useState(true);
  const [nextPath, setNextPath] = useState('/dashboard');
  const codeInputRef = useRef<HTMLInputElement>(null);

  // Redirect to login if no active session (no aal1 session)
  useEffect(() => {
    const destination = getMfaNextPath();
    setNextPath(destination);
    trackFunnelEvent('member_login_mfa', 'verify_started');

    fetchAuth('/api/auth/check-mfa-required')
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) {
          window.location.href = '/login';
          return;
        }
        if (!data.mfaRequired) {
          window.location.href = destination;
        }
      })
      .catch(() => { window.location.href = '/login'; });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!code || code.length !== 6) {
      setError(tAuth('mfaVerify.codeRequired'));
      codeInputRef.current?.focus();
      return;
    }

    setLoading(true);

    try {
      const res = await fetchAuth('/api/auth/verify-mfa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, trustDevice }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? tAuth('mfaVerify.verifyFailed'));
        trackFunnelEvent('member_login_mfa', 'verify_failed', {
          status_code: res.status,
        });
        setLoading(false);
        codeInputRef.current?.focus();
        return;
      }

      trackFunnelEvent('member_login_mfa', 'verify_completed', {
        trust_device: trustDevice,
      });
      trackMemberLoggedIn({ destination: nextPath, mfa_verified: true, trust_device: trustDevice });
      setSuccess(true);
      // Redirect to the intended staff portal after brief delay
      setTimeout(() => {
        window.location.href = nextPath;
      }, 800);
    } catch {
      setError(tAuth('mfaVerify.genericError'));
      trackFunnelEvent('member_login_mfa', 'verify_network_error');
      setLoading(false);
      codeInputRef.current?.focus();
    }
  };

  if (success) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface-container-lowest)' }}>
        <div style={{ textAlign: 'center', padding: '2rem' }}>
          <CircleCheck size={64} aria-hidden="true" style={{ color: 'var(--color-green)', marginBottom: '1rem' }} />
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>{tAuth('mfaVerify.verifiedHeading')}</h1>
          <p role="status" style={{ color: 'var(--color-on-surface-variant)' }}>{tAuth('mfaVerify.redirecting')}</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface-container-lowest)', padding: '1rem' }}>
      <div style={{ width: '100%', maxWidth: 380 }}>
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <ShieldCheck size={48} aria-hidden="true" style={{ color: 'var(--color-accent)', marginBottom: '0.5rem' }} />
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>{tAuth('mfaVerify.heading')}</h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--color-on-surface-variant)', margin: '0.25rem 0 0' }}>
            {tAuth('mfaVerify.subheading')}
          </p>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div style={{ marginBottom: '1rem' }}>
            <label htmlFor="mfa-code" style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-on-surface-variant)', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {tAuth('mfaVerify.codeLabel')}
            </label>
            <input
              ref={codeInputRef}
              id="mfa-code"
              name="code"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => { setCode(e.target.value.replace(/\D/g, '')); if (error) setError(null); }}
              placeholder="000000"
              autoFocus
              aria-invalid={!!error}
              aria-describedby={error ? 'mfa-verify-error' : undefined}
              className="mfa-code-input"
              style={{
                width: '100%',
                padding: '0.75rem 1rem',
                fontSize: '1.25rem',
                fontWeight: 700,
                letterSpacing: '0.15em',
                textAlign: 'center',
                background: 'var(--surface-container)',
                border: '2px solid var(--outline-variant)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--color-on-surface)',
                outline: 'none',
              }}
            />
          </div>

          {error && (
            <p id="mfa-verify-error" role="alert" style={{ color: 'var(--color-error)', fontSize: '0.85rem', marginBottom: '1rem', textAlign: 'center' }}>{error}</p>
          )}

          <label
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.65rem',
              marginBottom: '1rem',
              minHeight: 44,
              fontSize: '0.85rem',
              color: 'var(--color-on-surface-variant)',
            }}
          >
            <input
              type="checkbox"
              checked={trustDevice}
              onChange={(e) => setTrustDevice(e.target.checked)}
              style={{ marginTop: '0.15rem', accentColor: '#ad2c4d' }}
            />
            <span>{tAuth('mfaVerify.trustDeviceLabel')}</span>
          </label>

          <button
            type="submit"
            disabled={loading || code.length !== 6}
            aria-busy={loading}
            className={actionStyles.primary}
            style={{
              width: '100%',
              minHeight: 44,
              padding: '0.875rem',
              borderRadius: 'var(--radius-md)',
              fontWeight: 700,
              fontSize: '0.9rem',
            }}
          >
            <span aria-live="polite">{loading ? tAuth('mfaVerify.verifying') : tAuth('mfaVerify.verifyButton')}</span>
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: '1rem', fontSize: '0.8rem', color: 'var(--color-on-surface-variant)' }}>
          {tAuth('mfaVerify.lostAuthenticator')} <LocalizedLink href="/login" style={{ color: 'var(--color-accent)', fontWeight: 600 }}>{tAuth('mfaVerify.signInAgain')}</LocalizedLink>
        </p>
      </div>

      <style>{`
        .mfa-code-input:focus-visible {
          outline: 2px solid var(--color-accent);
          outline-offset: 2px;
        }
      `}</style>
    </div>
  );
}
