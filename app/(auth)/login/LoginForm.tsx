'use client';

import { LockKeyhole, ShieldCheck } from 'lucide-react';
import PasswordToggle from '@/components/forms/PasswordToggle';

import { fetchAuth } from '@/lib/fetchWithTimeout';
import Image from 'next/image';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import LocalizedLink from '@/components/LocalizedLink';
import { sanitizeRedirectPath } from '@/lib/auth/safeRedirectPath';
import { splitLocalePrefix } from '@/lib/i18n/config';
import { trackFunnelEvent, trackMemberLoggedIn } from '@/lib/analytics/events';
import { heroPhotoForKey } from '@/lib/marketing/heroPhotos';

/* Paths identify destinations; copy comes from the active auth catalog. */
const PORTAL_DESTINATIONS = [
  { redirectTo: '/admin', audience: 'admin' },
  { redirectTo: '/counselor', audience: 'counselor' },
  { redirectTo: '/partner', audience: 'partner' },
  { redirectTo: '/employer', audience: 'employer' },
  { redirectTo: '/dashboard', audience: 'member' },
] as const;

function canonicalPortalPath(path: string): string {
  return splitLocalePrefix(new URL(path, 'https://internal.invalid').pathname).pathnameWithoutLocale;
}

function portalAudienceForPath(path: string) {
  const canonicalPath = canonicalPortalPath(path);
  return PORTAL_DESTINATIONS.find((destination) =>
    canonicalPath === destination.redirectTo || canonicalPath.startsWith(`${destination.redirectTo}/`)
  )?.audience ?? 'member';
}

const s = {
  wrapper: {
    display: 'flex',
    minHeight: '100vh',
    fontFamily: 'var(--font-family)',
  } as React.CSSProperties,

  /* Left branding panel */
  brandPanel: {
    flex: '1 1 50%',
    position: 'relative' as const,
    display: 'flex',
    flexDirection: 'column' as const,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 'var(--space-16) var(--space-8)',
    background: 'linear-gradient(135deg, var(--color-accent) 0%, var(--color-accent-dark) 52%, #6d1437 100%)',
    overflow: 'hidden',
    color: 'var(--color-white)',
  } as React.CSSProperties,

  brandContent: {
    position: 'relative' as const,
    zIndex: 1,
    textAlign: 'center' as const,
    maxWidth: 440,
  } as React.CSSProperties,

  brandHeading: {
    fontSize: 'clamp(1.75rem, 3vw, 2.5rem)',
    fontWeight: 800,
    lineHeight: 1.15,
    marginBottom: 'var(--space-6)',
    letterSpacing: '-0.02em',
  } as React.CSSProperties,

  brandBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-2) var(--space-4)',
    borderRadius: 'var(--radius-xl)',
    background: 'rgba(255,255,255,0.1)',
    backdropFilter: 'blur(8px)',
    border: '1px solid rgba(255,255,255,0.15)',
    fontSize: 'var(--font-size-sm)',
    fontWeight: 600,
    letterSpacing: '0.04em',
    textTransform: 'uppercase' as const,
  } as React.CSSProperties,

  /* Right form panel */
  formPanel: {
    flex: '1 1 50%',
    display: 'flex',
    flexDirection: 'column' as const,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 'var(--space-8)',
    background: 'var(--surface-container)',
    overflowY: 'auto' as const,
  } as React.CSSProperties,

  formContainer: {
    width: '100%',
    maxWidth: 420,
  } as React.CSSProperties,

  heading: {
    fontSize: 'var(--font-size-h2)',
    fontWeight: 800,
    color: 'var(--color-on-surface)',
    marginBottom: 'var(--space-1)',
  } as React.CSSProperties,

  subheading: {
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-on-surface-variant)',
    marginBottom: 'var(--space-8)',
    lineHeight: 'var(--line-height-normal)',
  } as React.CSSProperties,

  label: {
    display: 'block',
    fontSize: 'var(--font-size-sm)',
    fontWeight: 600,
    color: 'var(--color-on-surface-variant)',
    marginBottom: 'var(--space-1)',
    letterSpacing: '0.03em',
    textTransform: 'uppercase' as const,
  } as React.CSSProperties,

  input: {
    width: '100%',
    padding: 'var(--space-3) var(--space-4)',
    fontSize: 'var(--font-size-base)',
    background: 'var(--surface-container)',
    border: '2px solid var(--outline-variant)',
    borderRadius: 'var(--radius-md)',
    color: 'var(--color-on-surface)',
    transition: 'border-color 0.2s, box-shadow 0.2s',
    outline: 'none',
  } as React.CSSProperties,

  passwordRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 'var(--space-1)',
  } as React.CSSProperties,

  passwordWrap: {
    position: 'relative' as const,
  } as React.CSSProperties,

  recoverLink: {
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-accent)',
    textDecoration: 'none',
    fontWeight: 500,
  } as React.CSSProperties,

  checkboxRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    margin: 'var(--space-6) 0',
  } as React.CSSProperties,

  footer: {
    marginTop: 'var(--space-8)',
    textAlign: 'center' as const,
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-on-surface-variant)',
  } as React.CSSProperties,

  statusDot: {
    display: 'inline-block',
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: 'var(--color-green)',
    marginRight: 'var(--space-2)',
  } as React.CSSProperties,

  errorBanner: {
    background: 'color-mix(in srgb, var(--color-accent) 10%, transparent)',
    borderLeft: '4px solid var(--color-accent)',
    padding: 'var(--space-3) var(--space-4)',
    marginBottom: 'var(--space-4)',
    borderRadius: '0 var(--radius-md) var(--radius-md) 0',
    color: 'var(--color-on-surface)',
    fontSize: 'var(--font-size-sm)',
  } as React.CSSProperties,

  fieldGroup: {
    marginBottom: 'var(--space-4)',
  } as React.CSSProperties,

  trustBar: {
    marginTop: 'var(--space-3)',
    textAlign: 'center' as const,
    fontSize: '0.75rem',
    color: 'var(--color-on-surface-variant)',
    opacity: 0.65,
    letterSpacing: '0.01em',
  } as React.CSSProperties,

  trustDot: {
    margin: '0 var(--space-2)',
    opacity: 0.5,
  } as React.CSSProperties,
} as const;

type LoginFormProps = {
  initialRedirectTo?: string;
  accountDeleted?: boolean;
  emailVerified?: boolean;
};

export default function LoginForm({ initialRedirectTo = '/dashboard', accountDeleted = false, emailVerified = false }: LoginFormProps) {
  const tAuth = useTranslations('auth');
  /* Keep the requested page through sign-in and recovery. */
  const redirectTo = sanitizeRedirectPath(initialRedirectTo, '/dashboard');
  const canonicalRedirectTo = canonicalPortalPath(redirectTo);
  const audience = portalAudienceForPath(redirectTo);
  const isMemberLogin = canonicalRedirectTo === '/dashboard' || canonicalRedirectTo.startsWith('/dashboard/');

  const destinationActive = (target: string) => {
    return canonicalRedirectTo === target || canonicalRedirectTo.startsWith(`${target}/`);
  };

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const signupHref = `/signup?redirectTo=${encodeURIComponent(isMemberLogin ? redirectTo : '/dashboard')}`;
  const forgotPasswordHref = `/forgot-password?redirectTo=${encodeURIComponent(redirectTo)}`;
  const partnerSignupHref = '/partners#partner-signup';
  const isPartnerLogin = canonicalRedirectTo === '/partner' || canonicalRedirectTo.startsWith('/partner/');
  const isStaffLikeLogin =
    canonicalRedirectTo === '/admin' ||
    canonicalRedirectTo.startsWith('/admin/') ||
    canonicalRedirectTo === '/counselor' ||
    canonicalRedirectTo.startsWith('/counselor/') ||
    canonicalRedirectTo === '/employer' ||
    canonicalRedirectTo.startsWith('/employer/');

  const [showPassword, setShowPassword] = useState(false);
  /* Default unchecked — members may sign in on shared/library/lab
     devices. Opt-in is the safer default for a workforce-development
     portal where not every user has a personal laptop (audit #57). */
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showStaffPortals, setShowStaffPortals] = useState(
    () => !isMemberLogin,
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Inline field validation — calm, member-friendly messages
    let hasFieldError = false;
    if (!email.trim()) {
      setEmailError(tAuth('login.emailRequired'));
      hasFieldError = true;
    }
    if (!password) {
      setPasswordError(tAuth('login.passwordRequired'));
      hasFieldError = true;
    }
    if (hasFieldError) {
      trackFunnelEvent('member_login', 'validation_failed');
      return;
    }

    setLoading(true);
    trackFunnelEvent('member_login', 'started', {
      destination: canonicalRedirectTo,
      remember_me: rememberMe,
    });

    try {
      const res = await fetchAuth('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-wap-login-flow': 'client',
        },
        body: JSON.stringify({ email, password, redirectTo, rememberMe }),
        credentials: 'include',
        redirect: 'manual',
      });

      const data = await res.json().catch(() => ({}));

      // MFA required — redirect to verification page
      if (data.mfaRequired && data.redirectTo) {
        trackFunnelEvent('member_login', 'mfa_required');
        window.location.href = new URL(data.redirectTo, window.location.origin).href;
        return;
      }

      // MFA setup required for staff — redirect to setup page
      if (data.mfaSetupRequired && data.redirectTo) {
        trackFunnelEvent('member_login', 'mfa_setup_required');
        window.location.href = new URL(data.redirectTo, window.location.origin).href;
        return;
      }

      if (res.type === 'opaqueredirect' || (res.status >= 300 && res.status < 400)) {
        const location = res.headers.get('Location') ?? data?.redirectTo;
        if (location) {
          try {
            const next = new URL(location, window.location.origin);
            if (next.origin === window.location.origin) {
              window.location.href = next.href;
              return;
            }
          } catch {
            /* ignore malformed Location */
          }
        }
        window.location.href = new URL(redirectTo, window.location.origin).href;
        return;
      }

      if (!res.ok) {
        setError(data.error ?? tAuth('login.genericError'));
        trackFunnelEvent('member_login', 'failed', {
          status_code: res.status,
          error_message: typeof data?.error === 'string' ? data.error.slice(0, 120) : 'unknown',
        });
        setLoading(false);
        return;
      }

      trackFunnelEvent('member_login', 'completed', { destination: canonicalRedirectTo });
      trackMemberLoggedIn({ destination: canonicalRedirectTo, remember_me: rememberMe });
      const nextLocation = typeof data?.redirectTo === 'string' ? data.redirectTo : redirectTo;
      window.location.href = new URL(nextLocation, window.location.origin).href;
    } catch {
      setError(tAuth('login.networkError'));
      trackFunnelEvent('member_login', 'network_error');
      setLoading(false);
    }
  };

  /* ─── UI ─── */
  return (
    <div style={s.wrapper}>
      {/* ── Left branding panel (hidden on mobile via CSS media query below) ── */}
      <div className="login-brand-panel" style={s.brandPanel}>
        <Image
          src={heroPhotoForKey('/login')}
          alt=""
          fill
          priority
          fetchPriority="high"
          sizes="50vw"
          style={{ objectFit: 'cover', objectPosition: 'center', opacity: 0.12 }}
          aria-hidden="true"
        />
        <div style={s.brandContent}>
          <div style={s.brandBadge}>
            <ShieldCheck size={18} aria-hidden="true" />
            {tAuth('login.trustedSecure')}
          </div>
          <p style={{ ...s.brandHeading, marginTop: 'var(--space-6)' }}>
            {tAuth(`login.destinations.${audience}.headline`)}
          </p>
          <p style={{ fontSize: 'var(--font-size-base)', opacity: 0.8, lineHeight: 'var(--line-height-normal)' }}>
            {tAuth(`login.destinations.${audience}.subtitle`)}
          </p>
        </div>
      </div>

      {/* ── Right form panel ── */}
      <div style={s.formPanel}>
        <div style={s.formContainer}>
          <h1 style={s.heading}>{tAuth('login.heading')}</h1>
          <p style={s.subheading}>
            {tAuth('login.signingInto')}{' '}<strong style={{ color: 'var(--color-accent)' }}>{tAuth(`login.destinations.${audience}.title`)}</strong>
          </p>

          {/* First-time CTA — prominent for members who land here by accident */}
          {!isPartnerLogin && !isStaffLikeLogin && (
            <div style={{
              background: 'var(--surface-container-high)',
              borderRadius: 'var(--radius-lg)',
              padding: '1rem 1.25rem',
              marginBottom: 'var(--space-6)',
              border: '1px solid var(--outline-variant)',
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '0.75rem',
            }}>
              <div>
                <p style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--color-on-surface)', margin: '0 0 0.25rem' }}>
                  {tAuth('login.newHereTitle')}
                </p>
                <p style={{ fontSize: '0.85rem', color: 'var(--color-on-surface-variant)', margin: 0, lineHeight: 1.4 }}>
                  {tAuth('login.newHereBody')}
                </p>
              </div>
              <LocalizedLink href={signupHref} style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '0.6rem 1rem',
                borderRadius: 'var(--radius-md)',
                border: '2px solid var(--color-accent)',
                color: 'var(--color-accent)',
                fontWeight: 700,
                fontSize: '0.875rem',
                textDecoration: 'none',
                whiteSpace: 'nowrap',
                minHeight: 44,
              }}>
                {tAuth('login.getStarted')}
              </LocalizedLink>
            </div>
          )}

          {/* Portal routing — staff portals hidden behind toggle */}
          <nav aria-label={tAuth('login.portalDestinationAria')} style={{ marginBottom: 'var(--space-6)' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: '6px', alignItems: 'center' }}>
              {PORTAL_DESTINATIONS.filter((o) =>
                o.redirectTo === '/dashboard' || showStaffPortals
              ).map((o) => {
                const active = destinationActive(o.redirectTo);
                const href = `/login?redirectTo=${encodeURIComponent(active ? redirectTo : o.redirectTo)}`;
                return (
                  <LocalizedLink
                    key={o.redirectTo}
                    href={href}
                    aria-current={active || undefined}
                    title={tAuth(`login.destinations.${o.audience}.description`)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      minHeight: 44,
                      padding: '6px 12px',
                      fontSize: 'var(--font-size-sm)',
                      fontWeight: 600,
                      borderRadius: 'var(--radius-sm)',
                      border: active ? '1px solid var(--color-accent)' : '1px solid var(--outline-variant)',
                      background: active ? 'color-mix(in srgb, var(--color-accent) 12%, transparent)' : 'transparent',
                      color: active ? 'var(--color-accent)' : 'var(--color-on-surface-variant)',
                      textDecoration: 'none',
                      transition: 'all 0.2s',
                    }}
                  >
                    {tAuth(`login.destinations.${o.audience}.label`)}
                  </LocalizedLink>
                );
              })}
              {!showStaffPortals && (
                <button
                  type="button"
                  onClick={() => setShowStaffPortals(true)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    minHeight: 44,
                    padding: '6px 12px',
                    fontSize: 'var(--font-size-sm)',
                    fontWeight: 500,
                    borderRadius: 'var(--radius-sm)',
                    border: '1px dashed var(--outline-variant)',
                    background: 'transparent',
                    color: 'var(--color-on-surface-variant)',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                >
                  {tAuth('login.staffLogin')}
                </button>
              )}
            </div>
          </nav>

          {/* Mobile-only trust bar — key signals lost when brand panel hides */}
          <div className="mobile-trust-bar" aria-label={tAuth('login.programCredentialsAria')}>
            {tAuth('login.mobileTrustBar')}
          </div>

          {accountDeleted && (
            <div role="status" style={s.errorBanner}>
              {tAuth('accountDeletedNotice')}
            </div>
          )}
          {emailVerified && !accountDeleted && (
            <div role="status" style={{ ...s.errorBanner, borderLeft: '4px solid #16a34a', background: 'color-mix(in srgb, #16a34a 10%, transparent)' }}>
              {tAuth('emailVerifiedNotice')}
            </div>
          )}
          <form onSubmit={handleSubmit} noValidate>
            {/* Email */}
            <div style={s.fieldGroup}>
              <label htmlFor="email" style={s.label}>{tAuth('login.email')}</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                inputMode="email"
                autoFocus
                placeholder={tAuth('login.emailPlaceholder')}
                value={email}
                onChange={(e) => { setEmail(e.target.value); if (emailError) setEmailError(null); }}
                required
                aria-invalid={!!emailError || !!error}
                aria-describedby={emailError ? 'email-error' : error ? 'login-error' : undefined}
                className="login-field"
                style={{ ...s.input, ...(emailError ? { borderColor: 'var(--color-accent)' } : {}) }}
              />
              {emailError && (
                <p id="email-error" role="alert" style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-on-surface-variant)', marginTop: 'var(--space-1)', margin: 'var(--space-1) 0 0' }}>
                  {emailError}
                </p>
              )}
            </div>

            {/* Password */}
            <div style={s.fieldGroup}>
              <div style={s.passwordRow}>
                <label htmlFor="password" style={{ ...s.label, marginBottom: 0 }}>{tAuth('login.password')}</label>
                <LocalizedLink href={forgotPasswordHref} style={s.recoverLink}>{tAuth('login.forgotPassword')}</LocalizedLink>
              </div>
              <div style={s.passwordWrap}>
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder={tAuth('login.passwordPlaceholder')}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); if (passwordError) setPasswordError(null); }}
                  required
                  aria-invalid={!!passwordError || !!error}
                  aria-describedby={passwordError ? 'password-error' : error ? 'login-error' : undefined}
                  className="login-field"
                  style={{ ...s.input, ...(passwordError ? { borderColor: 'var(--color-accent)' } : {}) }}
                />
                <PasswordToggle
                  visible={showPassword}
                  onToggle={() => setShowPassword((v) => !v)}
                  showLabel={tAuth('login.showPassword')}
                  hideLabel={tAuth('login.hidePassword')}
                  controls="password"
                />
              </div>
              {passwordError && (
                <p id="password-error" role="alert" style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-on-surface-variant)', marginTop: 'var(--space-1)', margin: 'var(--space-1) 0 0' }}>
                  {passwordError}
                </p>
              )}
            </div>

            {/* Maintain session checkbox */}
            <div style={{ ...s.checkboxRow, minHeight: 44 }}>
              <input
                id="remember"
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                style={{ accentColor: 'var(--color-accent)', width: 20, height: 20 }}
              />
              <label htmlFor="remember" style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-on-surface-variant)', cursor: 'pointer' }}>
                {tAuth('login.staySignedIn')}
              </label>
            </div>

            {/* Error banner */}
            {error && (
              <div id="login-error" role="alert" style={s.errorBanner}>
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              aria-busy={loading}
              className="btn btn-primary btn-full-width"
            >
              <span aria-live="polite">{loading ? tAuth('login.signingIn') : tAuth('login.signIn')}</span>
            </button>
          </form>

          {/* Trust bar — reassurance at the moment of login friction */}
          <div style={{ ...s.trustBar, display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '0.2rem 0.75rem', alignItems: 'center', fontSize: '0.8125rem', opacity: 0.85 }} aria-label={tAuth('login.programCredentialsAria')}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', whiteSpace: 'nowrap' }}>
              <LockKeyhole size={14} aria-hidden="true" />
              {tAuth('login.secureLogin')}
            </span>
            <span style={s.trustDot} aria-hidden="true">·</span>
            <span style={{ whiteSpace: 'nowrap' }}>{tAuth('login.noCostMembers')}</span>
            <span style={s.trustDot} aria-hidden="true">·</span>
            <span style={{ whiteSpace: 'nowrap' }}>{tAuth('login.grantsPartnerFunded')}</span>
          </div>

          {/* Bottom links */}
          <p style={{ textAlign: 'center', marginTop: 'var(--space-6)', fontSize: 'var(--font-size-sm)', color: 'var(--color-on-surface-variant)', lineHeight: 'var(--line-height-normal)' }}>
            {isPartnerLogin ? (
              <>
                {tAuth('login.needPartnerAccess')}{' '}
                <LocalizedLink href={partnerSignupHref} style={{ color: 'var(--color-accent)', fontWeight: 600, textDecoration: 'none' }}>
                  {tAuth('login.registerOrganization')}
                </LocalizedLink>
              </>
            ) : isStaffLikeLogin ? (
              <>
                {tAuth('login.staffAccountNotWorking')}{' '}
                <LocalizedLink href="/contact" style={{ color: 'var(--color-accent)', fontWeight: 600, textDecoration: 'none' }}>
                  {tAuth('login.contactSupport')}
                </LocalizedLink>
              </>
            ) : null}
          </p>

          {/* Footer — minimal; status dot removed (meaningless to members) */}
        </div>
      </div>

      {/* Responsive: hide brand panel on mobile; accessible focus rings */}
      <style>{`
        .mobile-trust-bar { display: none; }
        @media (max-width: 768px) {
          .login-brand-panel { display: none !important; }
          .mobile-trust-bar {
            display: block !important;
            margin-bottom: var(--space-4);
            padding: var(--space-2) var(--space-3);
            background: var(--surface-container-high);
            border-radius: var(--radius-md);
            border: 1px solid var(--outline-variant);
            text-align: center;
            font-size: 0.8125rem;
            color: var(--color-on-surface-variant);
            line-height: 1.4;
          }
        }
        .login-field:focus {
          outline: 2px solid var(--color-accent);
          outline-offset: 2px;
          border-color: var(--color-accent);
        }
      `}</style>
    </div>
  );
}
