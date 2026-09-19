'use client';

import { useState, useEffect, Suspense } from 'react';
import LocalizedLink from '@/components/LocalizedLink';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { isConnectionFailure } from '@/lib/http/requestFailureCopy';
import { safeParseResponseJson } from '@/lib/http/safeFetchJson';
import { sanitizeRedirectPath } from '@/lib/auth/safeRedirectPath';
import { invitationErrorKey, invitationRoleKey, type InvitationErrorKey } from '@/lib/invitations/inviteUiCopy';

type InviteData = {
  valid: boolean;
  email?: string;
  role?: string;
  roleLabel?: string;
  inviterName?: string;
  subgroup?: { id: string; name: string } | null;
  partner?: { id: string; name: string } | null;
  program?: { slug: string; title: string } | null;
  counselorAffiliation?: string | null;
  error?: string;
  displayError?: InvitationErrorKey;
};

function InviteContent() {
  const tCommon = useTranslations('common');
  const t = useTranslations('auth.invite');
  const searchParams = useSearchParams();
  const tokenParam = searchParams?.get('token');
  // The token either arrives in the link or is resolved from email + login code.
  const [token, setToken] = useState<string | null>(tokenParam ?? null);
  const [codeEmail, setCodeEmail] = useState('');
  const [codeInput, setCodeInput] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [codeSubmitting, setCodeSubmitting] = useState(false);

  const [data, setData] = useState<InviteData | null>(null);
  const [loading, setLoading] = useState(!!tokenParam);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [postAcceptRedirect, setPostAcceptRedirect] = useState('/login?redirectTo=/dashboard');

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    if (!token) {
      // No link token: show the login-code form instead of an error.
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    fetch(`/api/invite/validate?token=${encodeURIComponent(token)}`)
      .then((res) => safeParseResponseJson<InviteData>(res))
      .then(({ ok, data, parseError }) => {
        if (parseError || !data) {
          setData({ valid: false, displayError: 'loadFailed' });
          return;
        }
        setData({ ...data, valid: ok && data.valid });
        if (ok && data.valid && data.email) setFullName('');
      })
      .catch(() => setData({ valid: false, displayError: 'loadFailed' }))
      .finally(() => setLoading(false));
  }, [token]);

  const handleCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCodeSubmitting(true);
    setCodeError(null);
    try {
      const qs = new URLSearchParams({ code: codeInput.trim(), email: codeEmail.trim() });
      const res = await fetch(`/api/invite/validate?${qs.toString()}`);
      const parsed = await safeParseResponseJson<InviteData & { token?: string }>(res);
      if (parsed.parseError || !parsed.data) {
        setCodeError(t('errors.codeFailed'));
        return;
      }
      if (!res.ok || !parsed.data.valid || !parsed.data.token) {
        setCodeError(t(`errors.${invitationErrorKey(parsed.data.error, 'codeMismatch')}`));
        return;
      }
      setData(parsed.data);
      setToken(parsed.data.token);
    } catch (err) {
      console.error('[invite-code] Request failed', err);
      setCodeError(isConnectionFailure(err) ? tCommon('connectionError') : t('errors.generic'));
    } finally {
      setCodeSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !data?.valid || !data.email) return;
    setSubmitting(true);
    setError(null);
    try {
      const body: Record<string, string | undefined> = {
        token,
        fullName: fullName.trim(),
        phone: phone.trim() || undefined,
        password: password || undefined,
      };

      const res = await fetch('/api/invite/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const parsed = await safeParseResponseJson<{ error?: string; code?: string; redirectTo?: string }>(res);
      if (parsed.parseError || !parsed.data) {
        setError(t('errors.acceptFailed'));
        setSubmitting(false);
        return;
      }
      const result = parsed.data;

      if (!res.ok) {
        setError(t(`errors.${invitationErrorKey(result.error, 'acceptFailed', result.code)}`));
        setSubmitting(false);
        return;
      }
      const next = sanitizeRedirectPath(result.redirectTo, '/login?redirectTo=/dashboard');
      setPostAcceptRedirect(next);
      setSuccess(true);
      window.location.href = next;
    } catch (e) {
      setError(isConnectionFailure(e) ? tCommon('connectionError') : t('errors.generic'));
      setSubmitting(false);
    }
  };

  const inputStyle = {
    width: '100%',
    maxWidth: '360px',
    padding: '0.75rem 1rem',
    border: '1px solid var(--surface-container-highest)',
    borderRadius: '8px',
    fontSize: '1rem',
  } as const;
  const labelStyle = { display: 'block', marginBottom: '0.35rem', fontWeight: 500 } as const;

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem' }}>
        <p role="status">{t('loading')}</p>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="container" style={{ maxWidth: '560px', paddingTop: '3rem', paddingBottom: '3rem' }}>
        <div style={{ background: 'var(--surface-container-low)', borderRadius: '12px', padding: '2rem' }}>
          <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>{t('codeHeading')}</h1>
          <p style={{ color: 'var(--color-on-surface-variant)', marginBottom: '1.5rem' }}>
            {t('codeDescription')}
          </p>
          <form onSubmit={handleCodeSubmit}>
            {codeError && (
              <div
                role="alert"
                style={{
                  padding: '0.75rem',
                  marginBottom: '1rem',
                  background: 'var(--surface-container)',
                  borderRadius: '6px',
                  color: 'var(--color-accent)',
                  fontSize: '0.9rem',
                }}
              >
                {codeError}
              </div>
            )}
            <div style={{ marginBottom: '1rem' }}>
              <label htmlFor="code-email" style={labelStyle}>
                {t('email')}
              </label>
              <input
                id="code-email"
                type="email"
                required
                autoComplete="email"
                value={codeEmail}
                onChange={(e) => setCodeEmail(e.target.value)}
                placeholder={t('emailPlaceholder')}
                style={inputStyle}
              />
            </div>
            <div style={{ marginBottom: '1.5rem' }}>
              <label htmlFor="code-value" style={labelStyle}>
                {t('loginCode')}
              </label>
              <input
                id="code-value"
                type="text"
                required
                inputMode="text"
                autoComplete="one-time-code"
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                placeholder="XXXX-XXXX"
                maxLength={9}
                style={{ ...inputStyle, letterSpacing: '0.12em', fontFamily: 'ui-monospace, monospace' }}
              />
            </div>
            <button
              type="submit"
              disabled={codeSubmitting}
              className="btn btn-primary"
              style={{ width: '100%', padding: '0.75rem' }}
            >
              {codeSubmitting ? t('checking') : t('continue')}
            </button>
          </form>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-on-surface-variant)', marginTop: '1rem' }}>
            {t.rich('alreadySetUp', { link: (chunks) => <LocalizedLink href="/login">{chunks}</LocalizedLink> })}
          </p>
        </div>
      </div>
    );
  }

  if (!data?.valid) {
    return (
      <div className="container" style={{ maxWidth: '560px', paddingTop: '3rem', paddingBottom: '3rem' }}>
        <div
          style={{
            background: 'var(--surface-container-low)',
            padding: '2rem',
            borderRadius: '12px',
            textAlign: 'center',
          }}
        >
          <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>{t('invalidHeading')}</h1>
          <p style={{ color: 'var(--color-on-surface-variant)', marginBottom: '1.5rem' }}>
            {t(`errors.${data?.displayError ?? invitationErrorKey(data?.error, 'loadFailed')}`)}
          </p>
          <LocalizedLink href="/" className="btn btn-primary">
            {t('home')}
          </LocalizedLink>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="container" style={{ maxWidth: '560px', paddingTop: '3rem', paddingBottom: '3rem' }}>
        <div
          style={{
            background: 'var(--surface-container-low)',
            padding: '2rem',
            borderRadius: '12px',
            textAlign: 'center',
          }}
        >
          <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem', color: 'var(--color-green)' }}>
            {t('acceptedHeading')}
          </h1>
          <p style={{ color: 'var(--color-on-surface-variant)', marginBottom: '1.5rem' }}>
            {t('redirecting')}
          </p>
          <LocalizedLink href={postAcceptRedirect} className="btn btn-primary">
            {t('signIn')}
          </LocalizedLink>
        </div>
      </div>
    );
  }

  return (
    <div className="container" style={{ maxWidth: '560px', paddingTop: '3rem', paddingBottom: '3rem' }}>
      <div
        style={{
          background: 'var(--surface-container-low)',
          borderRadius: '12px',
          padding: '2rem',
        }}
      >
        <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>{t('invitedHeading')}</h1>
        <p style={{ color: 'var(--color-on-surface-variant)', marginBottom: '1.5rem' }}>
          {t.rich('invitedBy', {
            name: data.inviterName && data.inviterName !== 'A WorkforceAP team member' ? data.inviterName : t('teamMember'),
            role: t(`roles.${invitationRoleKey(data.role)}`),
            strong: (chunks) => <strong>{chunks}</strong>,
          })}
        </p>
        {data.subgroup && (
          <p style={{ fontSize: '0.95rem', marginBottom: '0.5rem' }}>
            {t('subgroup')} <strong>{data.subgroup.name}</strong>
          </p>
        )}
        {data.role === 'counselor' && (
          <p style={{ fontSize: '0.95rem', marginBottom: '0.5rem' }}>
            {t('affiliation')}{' '}
            <strong>
              {data.counselorAffiliation === 'community_ambassador'
                ? t('communityAmbassador')
                : data.counselorAffiliation === 'independent'
                  ? t('independentAdvisor')
                  : data.partner
                    ? data.partner.name
                    : t('organizationCounselor')}
            </strong>
          </p>
        )}
        {data.program && (
          <p style={{ fontSize: '0.95rem', marginBottom: '1rem' }}>
            {t('program')} <strong>{data.program.title}</strong>
          </p>
        )}
        <p style={{ fontSize: '0.9375rem', color: 'var(--color-on-surface-variant)', marginBottom: '1.5rem' }}>
          {t('formDescription')}
        </p>

        <form onSubmit={handleSubmit}>
          {error && (
            <div
              role="alert"
              style={{
                padding: '0.75rem',
                marginBottom: '1rem',
                background: 'var(--surface-container)',
                borderRadius: '6px',
                color: 'var(--color-accent)',
                fontSize: '0.9rem',
              }}
            >
              {error}
            </div>
          )}

          <div style={{ marginBottom: '1rem' }}>
            <label htmlFor="invite-email" style={labelStyle}>
              {t('email')}
            </label>
            <input
              id="invite-email"
              type="email"
              value={data.email ?? ''}
              readOnly
              style={{ ...inputStyle, background: 'var(--surface-container)', cursor: 'not-allowed' }}
            />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label htmlFor="invite-name" style={labelStyle}>
              {t('fullName')}
            </label>
            <input
              id="invite-name"
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder={t('fullNamePlaceholder')}
              style={inputStyle}
            />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label htmlFor="invite-phone" style={labelStyle}>
              {t('phone')}
            </label>
            <input
              id="invite-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(555) 123-4567"
              style={inputStyle}
            />
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label htmlFor="invite-password" style={labelStyle}>
              {t('password')}
            </label>
            <input
              id="invite-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('passwordPlaceholder')}
              minLength={8}
              style={inputStyle}
            />
            <p style={{ fontSize: '0.875rem', color: 'var(--color-on-surface-variant)', marginTop: '0.25rem' }}>
              {t('passwordHelp')}
            </p>
          </div>

          <button type="submit" disabled={submitting} className="btn btn-primary" style={{ width: '100%', padding: '0.75rem' }}>
            {submitting ? t('accepting') : t('accept')}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function InvitePage() {
  const t = useTranslations('auth.invite');
  return (
    <Suspense fallback={<div role="status" style={{ padding: '3rem', textAlign: 'center' }}>{t('loading')}</div>}>
      <InviteContent />
    </Suspense>
  );
}
