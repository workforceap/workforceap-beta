'use client';

import { CircleAlert, CircleCheck, QrCode } from 'lucide-react';

import actionStyles from '@/components/auth/AuthActions.module.css';
import { fetchAuth } from '@/lib/fetchWithTimeout';
import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import LocalizedLink from '@/components/LocalizedLink';
import { sanitizeRedirectPath } from '@/lib/auth/safeRedirectPath';
import { trackFunnelEvent } from '@/lib/analytics/events';
import { requestFailureMessage } from '@/lib/http/requestFailureCopy';

function getMfaSetupNextPath() {
  if (typeof window === 'undefined') return '/dashboard';
  return sanitizeRedirectPath(new URLSearchParams(window.location.search).get('next'), '/dashboard');
}

export default function SetupMfaPage() {
  const tAuth = useTranslations('auth');
  const tCommon = useTranslations('common');
  const [step, setStep] = useState<'loading' | 'qr' | 'confirm' | 'done' | 'error'>('loading');
  const [qrCode, setQrCode] = useState('');
  const [secret, setSecret] = useState('');
  const [factorId, setFactorId] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [nextPath, setNextPath] = useState('/dashboard');
  const codeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setNextPath(getMfaSetupNextPath());
    trackFunnelEvent('member_login_mfa', 'setup_started');

    fetchAuth('/api/auth/setup-mfa', { method: 'POST' })
      .then(async (r) => {
        if (!r.ok) {
          const data = await r.json().catch(() => ({}));
          throw new Error(data.error ?? tAuth('mfaSetup.setupInitFailed'));
        }
        return r.json();
      })
      .then((data) => {
        setQrCode(data.qr);
        setSecret(data.secret);
        setFactorId(data.factorId);
        setStep('qr');
      })
      .catch((e) => {
        // Raw fetch/JSON failures ("Failed to fetch", "Unexpected token '<'")
        // become plain translated copy; server-raised messages pass through.
        setError(
          requestFailureMessage(
            e,
            { connection: tCommon('connectionError'), fallback: tAuth('mfaSetup.setupInitFailed') },
            'setup-mfa',
          ),
        );
        setStep('error');
        trackFunnelEvent('member_login_mfa', 'setup_init_failed', {
          error_message: e?.message?.slice(0, 120) ?? 'unknown',
        });
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!code || code.length !== 6) {
      setError(tAuth('mfaSetup.codeRequired'));
      codeInputRef.current?.focus();
      return;
    }

    setLoading(true);

    try {
      const res = await fetchAuth('/api/auth/setup-mfa', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ factorId, code }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? tAuth('mfaSetup.codeInvalid'));
        trackFunnelEvent('member_login_mfa', 'setup_confirm_failed', {
          status_code: res.status,
        });
        setLoading(false);
        codeInputRef.current?.focus();
        return;
      }

      trackFunnelEvent('member_login_mfa', 'setup_completed');
      setStep('done');
    } catch {
      setError(tAuth('mfaSetup.genericError'));
      trackFunnelEvent('member_login_mfa', 'setup_network_error');
      setLoading(false);
      codeInputRef.current?.focus();
    }
  };

  if (step === 'loading') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <h1 className="sr-only">{tAuth('mfaSetup.heading')}</h1>
        <p>{tAuth('mfaSetup.settingUp')}</p>
      </div>
    );
  }

  if (step === 'error') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
        <div style={{ textAlign: 'center', maxWidth: 400 }}>
          <CircleAlert size={48} aria-hidden="true" style={{ color: 'var(--color-error)', marginBottom: '0.5rem' }} />
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700 }}>{tAuth('mfaSetup.setupFailedHeading')}</h1>
          <p role="alert" style={{ color: 'var(--color-on-surface-variant)', marginBottom: '1rem' }}>{error}</p>
          <LocalizedLink href={nextPath} style={{ color: 'var(--color-accent)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: 44 }}>{tAuth('mfaSetup.continueButton')}</LocalizedLink>
        </div>
      </div>
    );
  }

  if (step === 'done') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
        <div style={{ textAlign: 'center', maxWidth: 400 }}>
          <CircleCheck size={64} aria-hidden="true" style={{ color: 'var(--color-green)', marginBottom: '1rem' }} />
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>{tAuth('mfaSetup.doneHeading')}</h1>
          <p style={{ color: 'var(--color-on-surface-variant)', marginBottom: '1.5rem' }}>
            {tAuth('mfaSetup.doneMessage')}
          </p>
          <LocalizedLink
            href={nextPath}
            className={actionStyles.primary}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 44,
              padding: '0.75rem 1.5rem',
              borderRadius: 'var(--radius-md)',
              fontWeight: 700,
              textDecoration: 'none',
            }}
          >
            {tAuth('mfaSetup.continueButton')}
          </LocalizedLink>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface-container-lowest)', padding: '1rem' }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <QrCode size={48} aria-hidden="true" style={{ color: 'var(--color-accent)', marginBottom: '0.5rem' }} />
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>{tAuth('mfaSetup.heading')}</h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--color-on-surface-variant)', margin: '0.25rem 0 0' }}>
            {tAuth('mfaSetup.subheading')}
          </p>
        </div>

        {step === 'qr' && (
          <>
            {/* QR Code */}
            <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
              <div
                style={{
                  display: 'inline-block',
                  background: 'var(--color-white)',
                  padding: '1rem',
                  borderRadius: 'var(--radius-lg)',
                  border: '1px solid var(--outline-variant)',
                }}
              >
                {qrCode ? (
                  <Image src={qrCode} alt={tAuth('mfaSetup.qrAlt')} width={200} height={200} unoptimized style={{ display: 'block' }} />
                ) : (
                  <div style={{ width: 200, height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-on-surface-variant)' }}>
                    {tAuth('mfaSetup.qrLoading')}
                  </div>
                )}
              </div>
              <p style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', marginTop: '0.5rem' }}>
                {tAuth('mfaSetup.manualEntryHint')} <code style={{ background: 'var(--surface-container-high)', padding: '0.15rem 0.35rem', borderRadius: 4, fontFamily: 'monospace' }}>{secret}</code>
              </p>
            </div>

            <button type="button"
              onClick={() => setStep('confirm')}
              className={actionStyles.primary}
              style={{
                width: '100%',
                minHeight: 44,
                padding: '0.875rem',
                borderRadius: 'var(--radius-md)',
                fontWeight: 700,
                fontSize: '0.9rem',
                marginBottom: '0.75rem',
              }}
            >
              {tAuth('mfaSetup.scannedButton')}
            </button>
          </>
        )}

        {step === 'confirm' && (
          <form onSubmit={handleConfirm} noValidate>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-on-surface-variant)', marginBottom: '1rem', textAlign: 'center' }}>
              {tAuth('mfaSetup.confirmPrompt')}
            </p>

            <div style={{ marginBottom: '1rem' }}>
              <label
                htmlFor="mfa-setup-code"
                style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-on-surface-variant)', marginBottom: '0.35rem', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.05em' }}
              >
                {tAuth('mfaSetup.codeLabel')}
              </label>
              <input
                ref={codeInputRef}
                id="mfa-setup-code"
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
                aria-describedby={error ? 'mfa-setup-code-error' : undefined}
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
              <p id="mfa-setup-code-error" role="alert" style={{ color: 'var(--color-error)', fontSize: '0.85rem', marginBottom: '1rem', textAlign: 'center' }}>{error}</p>
            )}

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
              <span aria-live="polite">{loading ? tAuth('mfaSetup.verifying') : tAuth('mfaSetup.enableButton')}</span>
            </button>

            <button
              type="button"
              onClick={() => setStep('qr')}
              style={{
                width: '100%',
                minHeight: 44,
                padding: '0.75rem',
                background: 'transparent',
                color: 'var(--color-on-surface-variant)',
                border: 'none',
                fontSize: '0.8rem',
                cursor: 'pointer',
                marginTop: '0.5rem',
              }}
            >
              {tAuth('mfaSetup.backToQr')}
            </button>
          </form>
        )}

        <p style={{ textAlign: 'center', marginTop: '1rem', fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>
          {tAuth('mfaSetup.recommendedApps')}
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
