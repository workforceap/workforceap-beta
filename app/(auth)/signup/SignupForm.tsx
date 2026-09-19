'use client';

import { Eye, EyeOff, Landmark, MailCheck } from 'lucide-react';

import { fetchAuth } from '@/lib/fetchWithTimeout';
import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import LocalizedLink from '@/components/LocalizedLink';
import {
  memberSignupSchema,
  type MemberSignupInput,
  PROGRAM_INTEREST_OPTIONS,
} from '@/lib/validation/member';
import { trackFunnelEvent } from '@/lib/analytics/events';
import { clearPersistedPartnerRef, readPersistedPartnerRef } from '@/lib/apply/applyReferralCapture';
import { readMarketingAttribution, clearMarketingAttribution } from '@/lib/marketing/utmCapture';
import { sanitizeRedirectPath } from '@/lib/auth/safeRedirectPath';
import { splitLocalePrefix } from '@/lib/i18n/config';

const Turnstile = dynamic(() => import('@marsidev/react-turnstile').then((m) => m.Turnstile), { ssr: false });

const CAPTCHA_ENABLED = process.env.NEXT_PUBLIC_CAPTCHA_ENABLED === 'true';
const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? '';

/* ─── constants (preserved from MemberSignupForm) ───
   Values are the canonical strings stored via the API — unchanged. Only the
   displayed label is localized (see EMPLOYMENT_OPTION_KEYS / VETERAN_OPTION_KEYS
   below), so translating the label can't drift from what's persisted. */
const EMPLOYMENT_OPTIONS = [
  'Employed full-time',
  'Employed part-time',
  'Unemployed',
  'Member',
  'Self-employed',
  'Other',
];
const EMPLOYMENT_OPTION_KEYS: Record<string, string> = {
  'Employed full-time': 'employedFullTime',
  'Employed part-time': 'employedPartTime',
  'Unemployed': 'unemployed',
  'Member': 'member',
  'Self-employed': 'selfEmployed',
  'Other': 'other',
};
const VETERAN_OPTIONS = ['Yes', 'No', 'Prefer not to say'];
const VETERAN_OPTION_KEYS: Record<string, string> = {
  'Yes': 'yes',
  'No': 'no',
  'Prefer not to say': 'preferNotToSay',
};

type SignupFormProps = {
  initialRedirectTo?: string;
};

/* ─── styles ─── */
const s = {
  wrapper: {
    display: 'flex',
    minHeight: '100vh',
    fontFamily: 'var(--font-family)',
  } as React.CSSProperties,

  /* Left branding panel */
  brandPanel: {
    flex: '3 1 60%',
    position: 'relative' as const,
    display: 'flex',
    flexDirection: 'column' as const,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 'var(--space-16) var(--space-8)',
    background: 'linear-gradient(160deg, #6d1437 0%, var(--color-accent-dark) 55%, var(--color-accent) 100%)',
    overflow: 'hidden',
    color: 'var(--color-white)',
  } as React.CSSProperties,

  brandShapes: {
    position: 'absolute' as const,
    inset: 0,
    pointerEvents: 'none' as const,
    overflow: 'hidden',
  } as React.CSSProperties,

  brandContent: {
    position: 'relative' as const,
    zIndex: 1,
    textAlign: 'center' as const,
    maxWidth: 480,
  } as React.CSSProperties,

  testimonialCard: {
    position: 'relative' as const,
    zIndex: 1,
    marginTop: 'var(--space-12)',
    padding: 'var(--space-6)',
    background: 'rgba(255,255,255,0.08)',
    backdropFilter: 'blur(16px)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 'var(--radius-lg)',
    maxWidth: 420,
    textAlign: 'left' as const,
  } as React.CSSProperties,

  /* Right form panel */
  formPanel: {
    flex: '2 1 40%',
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
    maxWidth: 440,
  } as React.CSSProperties,

  heading: {
    fontSize: 'var(--font-size-h2)',
    fontWeight: 800,
    color: 'var(--color-on-surface)',
    marginBottom: 'var(--space-6)',
  } as React.CSSProperties,

  label: {
    display: 'block',
    fontSize: 'var(--font-size-sm)',
    fontWeight: 600,
    color: 'var(--color-on-surface-variant)',
    marginBottom: 'var(--space-1)',
  } as React.CSSProperties,

  input: {
    width: '100%',
    padding: 'var(--space-3) var(--space-4)',
    fontSize: 'var(--font-size-base)',
    background: 'var(--surface-container)',
    border: '1px solid var(--outline-variant)',
    borderRadius: 'var(--radius-md)',
    color: 'var(--color-on-surface)',
    outline: 'none',
    transition: 'border-color 0.2s',
  } as React.CSSProperties,

  passwordWrap: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
  } as React.CSSProperties,

  passwordToggle: {
    position: 'absolute',
    right: 'var(--space-3)',
    background: 'none',
    border: 'none',
    color: 'var(--color-on-surface-variant)',
    cursor: 'pointer',
    padding: 'var(--space-1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 44,
    minHeight: 44,
  } as React.CSSProperties,

  select: {
    width: '100%',
    padding: 'var(--space-3) var(--space-4)',
    fontSize: 'var(--font-size-base)',
    background: 'var(--surface-container)',
    border: '1px solid var(--outline-variant)',
    borderRadius: 'var(--radius-md)',
    color: 'var(--color-on-surface)',
    outline: 'none',
  } as React.CSSProperties,

  fieldGroup: {
    marginBottom: 'var(--space-4)',
  } as React.CSSProperties,

  primaryBtn: {
    width: '100%',
    padding: 'var(--space-4)',
    fontSize: 'var(--font-size-base)',
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase' as const,
    color: 'var(--color-white)',
    /* Crimson primary CTA — the kit's primary-action treatment (.btn-primary / .mdx-btn--primary).
       --ad-grad is the auth-depth crimson gradient; white on its lightest stop is 6.5:1. */
    background: 'var(--ad-grad, var(--color-accent))',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
    transition: 'opacity 0.2s, box-shadow 0.2s',
    boxShadow: '0 12px 30px -12px rgba(173, 44, 77, 0.5)',
  } as React.CSSProperties,

  errorBanner: {
    background: 'rgba(173,44,77,0.1)',
    borderLeft: '4px solid var(--color-accent)',
    padding: 'var(--space-3) var(--space-4)',
    marginBottom: 'var(--space-4)',
    borderRadius: '0 var(--radius-md) var(--radius-md) 0',
    color: 'var(--color-on-surface)',
    fontSize: 'var(--font-size-sm)',
  } as React.CSSProperties,

  fieldError: {
    fontSize: '0.8rem',
    color: 'var(--color-accent)',
    marginTop: 'var(--space-1)',
  } as React.CSSProperties,

  hint: {
    fontSize: '0.8rem',
    color: 'var(--color-on-surface-variant)',
    marginTop: 'var(--space-1)',
  } as React.CSSProperties,

  strengthRow: {
    display: 'flex',
    gap: 4,
    marginTop: 'var(--space-2)',
  } as React.CSSProperties,
} as const;

/* ─── password strength helper ─── */
function getPasswordStrength(pw: string): number {
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[a-z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return score; // 0-5
}

function strengthColor(score: number, index: number): string {
  if (index >= score) return 'var(--outline-variant)';
  if (score <= 2) return 'var(--color-accent)';
  if (score <= 3) return 'var(--color-gold)';
  return 'var(--color-green)';
}

export default function SignupForm({ initialRedirectTo = '/dashboard' }: SignupFormProps) {
  const tAuth = useTranslations('auth');
  /* ─── all business logic preserved from MemberSignupForm ─── */
  const redirectTo = sanitizeRedirectPath(initialRedirectTo, '/dashboard');
  const canonicalRedirectTo = splitLocalePrefix(redirectTo).pathnameWithoutLocale;
  const loginHref = `/login?redirectTo=${encodeURIComponent(redirectTo)}`;
  const isMemberSignup = canonicalRedirectTo === '/dashboard';

  const [submitStatus, setSubmitStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [passwordVal, setPasswordVal] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<MemberSignupInput>({
    resolver: zodResolver(memberSignupSchema),
    defaultValues: {
      consentCommunications: false,
    },
  });

  const onSubmit = async (data: MemberSignupInput) => {
    if (CAPTCHA_ENABLED && TURNSTILE_SITE_KEY && !turnstileToken?.trim()) {
      setSubmitStatus('error');
      setErrorMessage(tAuth('signup.captchaRequired'));
      return;
    }

    setSubmitStatus('loading');
    setErrorMessage(null);
    trackFunnelEvent('member_signup', 'signup_started', {
      program_interest: data.programInterest,
      employment_status: data.employmentStatus,
    });

    try {
      const referralRef = readPersistedPartnerRef() ?? undefined;
      const attribution = readMarketingAttribution();

      const res = await fetchAuth('/api/member/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          referralRef,
          utmSource: attribution.utmSource,
          utmMedium: attribution.utmMedium,
          utmCampaign: attribution.utmCampaign,
          utmContent: attribution.utmContent,
          utmTerm: attribution.utmTerm,
          referrer: attribution.referrer,
          ...(CAPTCHA_ENABLED && turnstileToken ? { turnstileToken } : {}),
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        trackFunnelEvent('member_signup', 'signup_failed', { program_interest: data.programInterest });
        setSubmitStatus('error');
        setErrorMessage(json.error ?? tAuth('signup.genericError'));
        return;
      }

      trackFunnelEvent('member_signup', 'signup_completed', { program_interest: data.programInterest });
      try {
        clearPersistedPartnerRef();
        clearMarketingAttribution();
      } catch {
        /* ignore */
      }
      setSubmitStatus('success');
    } catch {
      trackFunnelEvent('member_signup', 'signup_network_error', { program_interest: data.programInterest });
      setSubmitStatus('error');
      setErrorMessage(tAuth('signup.networkError'));
    }
  };

  /* ─── success state ─── */
  if (submitStatus === 'success') {
    return (
      <div style={{ ...s.wrapper, justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ textAlign: 'center', maxWidth: 440, padding: 'var(--space-8)' }}>
          <MailCheck size={56} aria-hidden="true" style={{ color: 'var(--color-green)', marginBottom: 'var(--space-4)', display: 'block', marginInline: 'auto' }} />
          <h2 style={{ ...s.heading, marginBottom: 'var(--space-4)' }}>{tAuth('signup.successTitle')}</h2>
          <p style={{ color: 'var(--color-on-surface-variant)', marginBottom: 'var(--space-6)', lineHeight: 'var(--line-height-normal)' }}>
            {tAuth('signup.successBody')}
          </p>
          <LocalizedLink
            href={loginHref}
            style={{ ...s.primaryBtn, display: 'inline-block', textDecoration: 'none', textAlign: 'center', maxWidth: 280 }}
          >
            {tAuth('signup.goToLogin')}
          </LocalizedLink>
        </div>
      </div>
    );
  }

  const pwStrength = getPasswordStrength(passwordVal);

  /* ─── UI ─── */
  return (
    <div style={s.wrapper}>
      {/* ── Left branding panel (hidden on mobile) ── */}
      <div className="signup-brand-panel" style={s.brandPanel}>
        {/* Abstract background shapes */}
        <div style={s.brandShapes}>
          <div style={{ position: 'absolute', width: 500, height: 500, borderRadius: '50%', background: 'rgba(173,44,77,0.15)', top: '-15%', left: '-10%' }} />
          <div style={{ position: 'absolute', width: 350, height: 350, borderRadius: '50%', background: 'rgba(164,127,56,0.12)', bottom: '-5%', right: '-5%' }} />
          <div style={{ position: 'absolute', width: 200, height: 200, borderRadius: '50%', background: 'rgba(75,155,255,0.06)', top: '40%', right: '20%' }} />
        </div>

        <div style={s.brandContent}>
          <Landmark size={48} aria-hidden="true" style={{ opacity: 0.9, marginBottom: 'var(--space-4)', display: 'block', marginInline: 'auto' }} />
          <h1 style={{ fontSize: 'clamp(1.75rem, 3vw, 2.5rem)', fontWeight: 800, lineHeight: 1.15, marginBottom: 'var(--space-4)', letterSpacing: '-0.02em' }}>
            {tAuth('signup.heroTitle')}
          </h1>
          <p style={{ fontSize: 'var(--font-size-base)', opacity: 0.75, lineHeight: 'var(--line-height-normal)' }}>
            {tAuth('signup.heroBody')}
          </p>
        </div>

        {/* Testimonial glass card */}
        <div style={s.testimonialCard}>
          <p style={{ fontSize: 'var(--font-size-base)', lineHeight: 'var(--line-height-normal)', fontStyle: 'italic', opacity: 0.9, margin: 0 }}>
            &ldquo;{tAuth('signup.testimonialQuote')}&rdquo;
          </p>
          <p style={{ marginTop: 'var(--space-3)', fontSize: 'var(--font-size-sm)', opacity: 0.6, margin: 'var(--space-3) 0 0' }}>
            {tAuth('signup.testimonialAttribution')}
          </p>
        </div>
      </div>

      {/* ── Right form panel ── */}
      <div style={s.formPanel}>
        <div style={s.formContainer}>
          <h2 style={s.heading}>{tAuth('signup.heading')}</h2>
          <p style={{ color: 'var(--color-on-surface-variant)', margin: '0 0 var(--space-6)', lineHeight: 'var(--line-height-normal)', fontSize: 'var(--font-size-sm)' }}>
            {isMemberSignup
              ? tAuth('signup.memberBody')
              : tAuth('signup.nonMemberBody')}
          </p>

          {/* Mobile-only trust bar — key signals lost when brand panel hides */}
          <div className="mobile-trust-bar" aria-label={tAuth('login.programCredentialsAria')}>
            {tAuth('signup.mobileTrustBar')}
          </div>

          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            {/* Full Name */}
            <div style={s.fieldGroup}>
              <label htmlFor="fullName" style={s.label}>{tAuth('signup.fullName')}</label>
              <input
                id="fullName"
                type="text"
                autoComplete="name"
                inputMode="text"
                placeholder={tAuth('signup.fullNamePlaceholder')}
                aria-required="true"
                aria-invalid={!!errors.fullName}
                aria-describedby={errors.fullName ? 'fullName-error' : undefined}
                style={s.input}
                {...register('fullName')}
              />
              {errors.fullName && <span id="fullName-error" role="alert" style={s.fieldError}>{errors.fullName.message}</span>}
            </div>

            {/* Email */}
            <div style={s.fieldGroup}>
              <label htmlFor="email" style={s.label}>{tAuth('signup.email')}</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                inputMode="email"
                placeholder={tAuth('signup.emailPlaceholder')}
                aria-required="true"
                aria-invalid={!!errors.email}
                aria-describedby={errors.email ? 'email-error' : undefined}
                style={s.input}
                {...register('email')}
              />
              {errors.email && <span id="email-error" role="alert" style={s.fieldError}>{errors.email.message}</span>}
            </div>

            {/* Password with strength indicator */}
            <div style={s.fieldGroup}>
              <label htmlFor="password" style={s.label}>{tAuth('signup.password')}</label>
              <div style={s.passwordWrap}>
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder={tAuth('signup.passwordPlaceholder')}
                  aria-required="true"
                  aria-invalid={!!errors.password}
                  aria-describedby={errors.password ? 'password-error' : undefined}
                  style={{ ...s.input, paddingRight: 'var(--space-8)' }}
                  {...register('password', {
                    onChange: (e) => setPasswordVal(e.target.value),
                  })}
                />
                <button
                  type="button"
                  style={s.passwordToggle}
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? tAuth('signup.hidePassword') : tAuth('signup.showPassword')}
                  aria-pressed={showPassword}
                >
                  {showPassword ? <EyeOff size={20} aria-hidden="true" /> : <Eye size={20} aria-hidden="true" />}
                </button>
              </div>
              {/* Strength bars */}
              <div style={s.strengthRow}>
                {[0, 1, 2, 3, 4].map((i) => (
                  <div key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: strengthColor(pwStrength, i), transition: 'background 0.3s' }} aria-hidden="true" />
                ))}
              </div>
              <p style={s.hint}>{tAuth('signup.passwordHint')}</p>
              {errors.password && <span id="password-error" role="alert" style={s.fieldError}>{errors.password.message}</span>}
            </div>

            {/* Phone */}
            <div style={s.fieldGroup}>
              <label htmlFor="phone" style={s.label}>
                {tAuth('signup.phone')} <span style={{ fontSize: '0.75rem', color: '#737373', fontWeight: 400 }}>({tAuth('signup.optional')})</span>
              </label>
              <input
                id="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder={tAuth('signup.phonePlaceholder')}
                aria-invalid={!!errors.phone}
                aria-describedby={errors.phone ? 'phone-error' : undefined}
                style={s.input}
                {...register('phone')}
              />
              {errors.phone && <span id="phone-error" role="alert" style={s.fieldError}>{errors.phone.message}</span>}
            </div>

            {/* ZIP */}
            <div style={s.fieldGroup}>
              <label htmlFor="zip" style={s.label}>
                {tAuth('signup.zipCode')} <span style={{ fontSize: '0.75rem', color: '#737373', fontWeight: 400 }}>({tAuth('signup.optional')})</span>
              </label>
              <input
                id="zip"
                type="text"
                inputMode="numeric"
                autoComplete="postal-code"
                placeholder={tAuth('signup.zipPlaceholder')}
                aria-invalid={!!errors.zip}
                aria-describedby={errors.zip ? 'zip-error' : undefined}
                style={s.input}
                {...register('zip')}
              />
              {errors.zip && <span id="zip-error" role="alert" style={s.fieldError}>{errors.zip.message}</span>}
            </div>

            {/* Program Interest */}
            <div style={s.fieldGroup}>
              <label htmlFor="programInterest" style={s.label}>{tAuth('signup.programOfInterest')}</label>
              <select
                id="programInterest"
                aria-required="true"
                aria-invalid={!!errors.programInterest}
                aria-describedby={errors.programInterest ? 'programInterest-error' : undefined}
                style={s.select}
                {...register('programInterest')}
              >
                <option value="">{tAuth('signup.selectProgram')}</option>
                {PROGRAM_INTEREST_OPTIONS.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
              {errors.programInterest && <span id="programInterest-error" role="alert" style={s.fieldError}>{errors.programInterest.message}</span>}
            </div>

            {/* Employment */}
            <div style={s.fieldGroup}>
              <label htmlFor="employmentStatus" style={s.label}>{tAuth('signup.employmentStatus')}</label>
              <select id="employmentStatus" style={s.select} {...register('employmentStatus')}>
                <option value="">{tAuth('signup.selectOption')}</option>
                {EMPLOYMENT_OPTIONS.map((o) => (
                  <option key={o} value={o}>{tAuth(`signup.employmentOptions.${EMPLOYMENT_OPTION_KEYS[o]}`)}</option>
                ))}
              </select>
            </div>

            {/* Veteran */}
            <div style={s.fieldGroup}>
              <label htmlFor="veteranStatus" style={s.label}>{tAuth('signup.veteranStatus')}</label>
              <select id="veteranStatus" style={s.select} {...register('veteranStatus')}>
                <option value="">{tAuth('signup.selectOption')}</option>
                {VETERAN_OPTIONS.map((o) => (
                  <option key={o} value={o}>{tAuth(`signup.veteranOptions.${VETERAN_OPTION_KEYS[o]}`)}</option>
                ))}
              </select>
            </div>

            {/* Consent checkboxes */}
            <div style={{ marginBottom: 'var(--space-4)' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', cursor: 'pointer', fontSize: 'var(--font-size-sm)', color: 'var(--color-on-surface-variant)', marginBottom: 'var(--space-3)', minHeight: 44 }}>
                <input
                  type="checkbox"
                  aria-required="true"
                  aria-invalid={!!errors.consentTerms}
                  aria-describedby={errors.consentTerms ? 'consentTerms-error' : undefined}
                  style={{ marginTop: 3, accentColor: 'var(--color-accent)' }}
                  {...register('consentTerms')}
                />
                <span>
                  {tAuth('signup.agreeToThe')}{' '}
                  <a href="/terms" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-accent)' }}>{tAuth('signup.termsOfService')}</a>{' '}
                  {tAuth('signup.and')}{' '}
                  <a href="/privacy" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-accent)' }}>{tAuth('signup.privacyPolicy')}</a> *
                </span>
              </label>
              {errors.consentTerms && <span id="consentTerms-error" role="alert" style={s.fieldError}>{errors.consentTerms.message}</span>}

              <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', cursor: 'pointer', fontSize: 'var(--font-size-sm)', color: 'var(--color-on-surface-variant)', minHeight: 44 }}>
                <input type="checkbox" style={{ marginTop: 3, accentColor: 'var(--color-accent)' }} {...register('consentCommunications')} />
                <span>{tAuth('signup.commsConsent')}</span>
              </label>
            </div>

            {/* Error banner */}
            {errorMessage && (
              <div role="alert" style={s.errorBanner}>{errorMessage}</div>
            )}

            {CAPTCHA_ENABLED && TURNSTILE_SITE_KEY ? (
              <div style={{ marginBottom: 'var(--space-4)' }}>
                <Turnstile
                  siteKey={TURNSTILE_SITE_KEY}
                  onSuccess={(t) => setTurnstileToken(t)}
                  onExpire={() => setTurnstileToken(null)}
                  onError={() => setTurnstileToken(null)}
                  options={{ theme: 'auto', size: 'normal' }}
                />
              </div>
            ) : null}

            {/* Submit */}
            <button
              type="submit"
              disabled={submitStatus === 'loading' || (CAPTCHA_ENABLED && !!TURNSTILE_SITE_KEY && !turnstileToken)}
              aria-busy={submitStatus === 'loading'}
              style={{ ...s.primaryBtn, opacity: submitStatus === 'loading' ? 0.7 : 1 }}
            >
              <span aria-live="polite">{submitStatus === 'loading' ? tAuth('signup.creatingAccount') : tAuth('signup.createAccount')}</span>
            </button>
          </form>

          <p style={{ textAlign: 'center', marginTop: 'var(--space-6)', fontSize: 'var(--font-size-sm)', color: 'var(--color-on-surface-variant)' }}>
            {tAuth('signup.alreadyHaveAccount')}{' '}
            <LocalizedLink href={loginHref} style={{ color: 'var(--color-accent)', fontWeight: 600, textDecoration: 'none' }}>{tAuth('signup.signIn')}</LocalizedLink>
          </p>
        </div>
      </div>

      {/* Responsive: hide brand panel on mobile */}
      <style>{`
        .mobile-trust-bar { display: none; }
        @media (max-width: 768px) {
          .signup-brand-panel { display: none !important; }
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
      `}</style>
    </div>
  );
}
