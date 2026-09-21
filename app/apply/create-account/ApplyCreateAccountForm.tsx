'use client';

import { useState, useEffect, useRef, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import LocalizedLink from '@/components/LocalizedLink';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { WEAK_PASSWORD_REASON } from '@/lib/auth/authProviderError';
import { trackApplyFunnel } from '@/lib/analytics/events';
import { isValidPostalCode } from '@/lib/validation/postalCode';
import { trackConversionWithValue } from '@/lib/analytics/conversionValue';
import { clearPersistedPartnerRef, readPersistedPartnerRef } from '@/lib/apply/applyReferralCapture';
import { isPaidUtmSource } from '@/lib/apply/paidApplyUtm';
import { US_STATES, toStateAbbr } from '@/lib/apply/usStates';
import { readMarketingAttribution, clearMarketingAttribution } from '@/lib/marketing/utmCapture';
import {
  getCareerQuizPayloadFromStorage,
} from '@/lib/apply/applyProgramStorage';
import { readAccountDraft, writeAccountDraft, readSavedEligibility, readApplyDraft, readSelectedPrograms, clearApplyBrowserState, sameEligibility, type SavedEligibility, type AccountDraft, type ApplyDraft } from '@/lib/apply/applyBrowserState';
import { applyRecoveryHref, type ApplyRecoveryContext } from '@/lib/apply/applyRecoveryHref';
import { ApplyReadyContent, ApplyResumeGate } from '@/components/apply/ApplyReadiness';
import PasswordToggle from '@/components/forms/PasswordToggle';
import { MailOpen } from 'lucide-react';
import { getProgramBySlug, getProgramDisplayTitle } from '@/lib/content/programs';
import { marketingButtonPresets } from '@/lib/marketing/buttonClasses';
import { scrollBehavior } from '@/lib/a11y/scrollBehavior';
import { isSchoolCollectionSignup, schoolPrimaryBarriers } from '@/lib/apply/schoolCollection';
import type { TurnstileInstance } from '@marsidev/react-turnstile';

const Turnstile = dynamic(() => import('@marsidev/react-turnstile').then((m) => m.Turnstile), { ssr: false });

const CAPTCHA_ENABLED = process.env.NEXT_PUBLIC_CAPTCHA_ENABLED === 'true';
const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? '';

// Persists in-progress account form fields so back-button / refresh / accidental
// navigation does not wipe what the user already typed. Cleared on successful
// signup or when the user resets the flow. Password fields are intentionally
// excluded for security.
function getPasswordStrengthScore(password: string): number {
  let score = 0;
  if (password.length >= 8) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  return score; // 0-4
}

function formatPhoneInput(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 10);
  if (digits.length === 0) return '';
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export default function ApplyCreateAccountForm({ readyHeader, readyIntro, recoveryContext }: { readyHeader?: ReactNode; readyIntro?: ReactNode; recoveryContext?: ApplyRecoveryContext }) {
  const t = useTranslations('apply');
  const tForm = useTranslations('form');
  const searchParams = useSearchParams();
  const initialEligibilityRef = useRef<SavedEligibility | null>(null);
  const [hasEligibility, setHasEligibility] = useState(false);
  const [savedDraft, setSavedDraft] = useState<ApplyDraft | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [init, setInit] = useState<'loading' | 'missing' | 'ready'>('loading');
  const [programRankedSlugs, setProgramRankedSlugs] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [verifyEmailMode, setVerifyEmailMode] = useState(false);
  const [verifyEmail, setVerifyEmail] = useState('');
  const [optionalAddressOpen, setOptionalAddressOpen] = useState(false);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [addressLine2, setAddressLine2] = useState('');
  const [city, setCity] = useState('');
  const [stateVal, setStateVal] = useState('');
  const [zip, setZip] = useState('');
  const [smsOptIn, setSmsOptIn] = useState(false);
  const [contactConsent, setContactConsent] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileNotice, setTurnstileNotice] = useState<'none' | 'expired' | 'error'>('none');
  const turnstileRef = useRef<TurnstileInstance | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    addressLine1?: string;
    city?: string;
    state?: string;
    zip?: string;
    password?: string;
    confirmPassword?: string;
    contactConsent?: string;
  }>({});
  const errorSummaryRef = useRef<HTMLDivElement | null>(null);
  const completedRef = useRef(false);
  const dropoffRef = useRef({ startedFields: 0, smsOptIn: false, program_slugs: null as string[] | null });
  const passwordStrengthScore = getPasswordStrengthScore(password);
  const passwordStrengthTone =
    passwordStrengthScore <= 1
      ? t('accountPasswordStrengthWeak')
      : passwordStrengthScore === 2
        ? t('accountPasswordStrengthFair')
        : passwordStrengthScore === 3
          ? t('accountPasswordStrengthGood')
          : t('accountPasswordStrengthStrong');

  useEffect(() => {
    trackApplyFunnel(3, 'account_create_view');
  }, []);

  useEffect(() => {
    const qEmail = searchParams?.get('email')?.trim();
    if (qEmail) setEmail(qEmail);
  }, [searchParams]);

  // Hydrate previously-typed values so back-button / refresh / tab restore
  // does not erase what the user already entered.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const elig = readSavedEligibility();
      const draft = readAccountDraft(elig);

      if (draft) {
        if (draft.firstName) {
          setFirstName(draft.firstName);
        } else if (elig?.firstName) {
          setFirstName(elig.firstName);
        }
        if (draft.lastName) {
          setLastName(draft.lastName);
        } else if (elig?.lastName) {
          setLastName(elig.lastName);
        }
        if (draft.email) {
          setEmail(draft.email);
        } else if (elig?.email) {
          setEmail(elig.email);
        }
        if (draft.phone) {
          setPhone(draft.phone);
        } else if (elig?.phone) {
          setPhone(elig.phone.replace(/(\d{3})(\d{3})(\d{4})/, '($1) $2-$3') || elig.phone);
        }
        if (draft.addressLine1) {
          setAddressLine1(draft.addressLine1);
          setOptionalAddressOpen(true);
        }
        if (draft.addressLine2) setAddressLine2(draft.addressLine2);
        if (draft.city) {
          setCity(draft.city);
          setOptionalAddressOpen(true);
        } else if (elig?.city) {
          setCity(elig.city);
          setOptionalAddressOpen(true);
        }
        if (draft.state) {
          setStateVal(toStateAbbr(draft.state));
          setOptionalAddressOpen(true);
        } else if (elig?.state) {
          setStateVal(toStateAbbr(elig.state));
          setOptionalAddressOpen(true);
        }
        if (draft.zip) {
          setZip(draft.zip);
        } else if (elig?.zip) {
          setZip(elig.zip);
        }
        if (typeof draft.smsOptIn === 'boolean') setSmsOptIn(draft.smsOptIn);
        if (typeof draft.contactConsent === 'boolean') setContactConsent(draft.contactConsent);
        return;
      }

      if (elig) {
        if (elig.firstName) setFirstName(elig.firstName);
        if (elig.lastName) setLastName(elig.lastName);
        if (elig.email) setEmail(elig.email);
        if (elig.phone) {
          const d = elig.phone.replace(/\D/g, '');
          if (d.length === 10) {
            setPhone(`(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`);
          } else {
            setPhone(elig.phone);
          }
        }
        if (elig.city) {
          setCity(elig.city);
          setOptionalAddressOpen(true);
        }
        if (elig.state) {
          setStateVal(toStateAbbr(elig.state));
          setOptionalAddressOpen(true);
        }
        if (elig.zip) setZip(elig.zip);
      }
    } catch {
      /* ignore corrupt draft */
    } finally {
      setHydrated(true);
    }
  }, []);

  // Persist non-sensitive draft on every change. Passwords are intentionally
  // excluded.
  useEffect(() => {
    if (!hydrated || init !== 'ready' || completedRef.current || typeof window === 'undefined') return;
    const draft: AccountDraft = {
      firstName,
      lastName,
      email,
      phone,
      addressLine1,
      addressLine2,
      city,
      state: stateVal,
      zip,
      smsOptIn,
      contactConsent,
    };
    writeAccountDraft(draft, initialEligibilityRef.current);
  }, [hydrated, init, firstName, lastName, email, phone, addressLine1, addressLine2, city, stateVal, zip, smsOptIn, contactConsent]);

  useEffect(() => {
    const eligibility = readSavedEligibility();
    const programs = readSelectedPrograms(eligibility);
    setHasEligibility(Boolean(eligibility));
    setSavedDraft(readApplyDraft());
    if (!eligibility || !programs) {
      trackApplyFunnel(3, 'account_missing_program');
      setInit('missing');
      return;
    }
    initialEligibilityRef.current = eligibility;
    setProgramRankedSlugs(programs);
    setInit('ready');
  }, []);

  useEffect(() => {
    dropoffRef.current = {
      startedFields: [firstName, lastName, email, phone, addressLine1, city, stateVal, zip, password, confirmPassword].filter(Boolean)
        .length,
      smsOptIn,
      program_slugs: programRankedSlugs,
    };
  }, [addressLine1, city, confirmPassword, email, firstName, lastName, password, phone, programRankedSlugs, smsOptIn, stateVal, zip]);

  useEffect(() => {
    return () => {
      if (init === 'ready' && !completedRef.current) {
        trackApplyFunnel(3, 'account_create_dropoff', {
          started_fields: dropoffRef.current.startedFields,
          sms_opt_in: dropoffRef.current.smsOptIn,
          program_slugs: dropoffRef.current.program_slugs,
        });
      }
    };
  }, [init]);

  const rankedProgramLabels = (programRankedSlugs ?? []).map((slug) => getProgramDisplayTitle(getProgramBySlug(slug) ?? slug));

  const emailLooksValid = (value: string) => {
    const v = value.trim();
    if (!v.includes('@')) return false;
    const [local, domain] = v.split('@');
    if (!local || !domain || !domain.includes('.')) return false;
    const tld = domain.split('.').pop() ?? '';
    return tld.length >= 2;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setFieldErrors({});

    const nextFieldErrors: typeof fieldErrors = {};
    if (!firstName.trim()) {
      nextFieldErrors.firstName = t('errFirstName');
    }
    if (!lastName.trim()) {
      nextFieldErrors.lastName = t('errLastName');
    }
    if (!email.trim()) {
      nextFieldErrors.email = t('errEmailRequired');
    } else if (!emailLooksValid(email)) {
      nextFieldErrors.email = t('errEmailInvalid');
    }
    const phoneDigits = phone.replace(/\D/g, '');
    if (!phone.trim()) {
      nextFieldErrors.phone = t('errPhoneRequired');
    } else if (phoneDigits.length < 10) {
      nextFieldErrors.phone = t('errPhoneDigits');
    }
    if (phoneError) {
      nextFieldErrors.phone = phoneError;
    }
    if (zip.trim() && !isValidPostalCode(zip)) {
      nextFieldErrors.zip = t('errZipFormat');
    }
    if (password.length < 8) {
      nextFieldErrors.password = t('errPasswordShort');
    }
    if (password.length >= 8 && confirmPassword !== password) {
      nextFieldErrors.confirmPassword = t('errPasswordMismatch');
    }
    if (!contactConsent) {
      nextFieldErrors.contactConsent = t('errContactConsent');
    }

    if (Object.keys(nextFieldErrors).length > 0) {
      setFieldErrors(nextFieldErrors);
      const needsContact = nextFieldErrors.phone;
      setError(needsContact ? t('errSummaryPhone') : t('errSummaryGeneric'));
      // Move focus to the error summary so screen readers announce the issue
      // and keyboard users can find it without scrolling.
      requestAnimationFrame(() => {
        errorSummaryRef.current?.focus();
        errorSummaryRef.current?.scrollIntoView({ block: 'center', behavior: scrollBehavior() });
      });
      return;
    }

    if (!programRankedSlugs?.length) {
      setError(t('errProgramsNotSaved'));
      return;
    }

    if (CAPTCHA_ENABLED && TURNSTILE_SITE_KEY && !turnstileToken?.trim()) {
      setError(t('accountCaptchaRequired'));
      requestAnimationFrame(() => {
        errorSummaryRef.current?.focus();
        errorSummaryRef.current?.scrollIntoView({ block: 'center', behavior: scrollBehavior() });
      });
      return;
    }

    setLoading(true);
    trackApplyFunnel(3, 'account_create_submit', { program_slugs: programRankedSlugs, sms_opt_in: smsOptIn });

    try {
      const referralRef = typeof window !== 'undefined' ? readPersistedPartnerRef() : null;

      const careerPayload = typeof window !== 'undefined' ? getCareerQuizPayloadFromStorage() : null;
      const attribution = readMarketingAttribution();
      const eligibilityPayload = readSavedEligibility();
      if (!eligibilityPayload || !sameEligibility(eligibilityPayload, initialEligibilityRef.current) ||
        JSON.stringify(readSelectedPrograms(eligibilityPayload)) !== JSON.stringify(programRankedSlugs)) {
        setHasEligibility(Boolean(eligibilityPayload));
        setSavedDraft(readApplyDraft());
        setInit('missing');
        setLoading(false);
        return;
      }

      const schoolSignup = isSchoolCollectionSignup({
        schoolApply: eligibilityPayload?.schoolApply,
        gradeLevel: eligibilityPayload?.gradeLevel,
        primaryBarriers: eligibilityPayload?.primaryBarriers,
      });
      const res = await fetch('/api/apply/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim().toLowerCase(),
          phone: phoneDigits,
          addressLine1: addressLine1.trim() || undefined,
          addressLine2: addressLine2.trim() || undefined,
          city: city.trim() || undefined,
          state: stateVal.trim() || undefined,
          zip: zip.trim() || undefined,
          smsOptIn,
          password,
          programRankedSlugs,
          referralRef: referralRef?.trim() || undefined,
          recommendedOnetCode: careerPayload?.recommendedOnetCode ?? undefined,
          recommendedCareerTitle: careerPayload?.recommendedCareerTitle ?? undefined,
          careerRecommendationJson: careerPayload?.careerRecommendationJson ?? undefined,
          needsComputerSupportFollowUp: careerPayload?.needsComputerSupportFollowUp ?? undefined,
          ageGroup: eligibilityPayload?.ageGroup,
          gradeLevel: eligibilityPayload?.gradeLevel,
          parentGuardianName: eligibilityPayload?.parentGuardianName,
          parentGuardianEmail: eligibilityPayload?.parentGuardianEmail,
          parentGuardianPhone: eligibilityPayload?.parentGuardianPhone,
          schoolName: eligibilityPayload?.schoolName,
          county: schoolSignup ? undefined : eligibilityPayload?.county,
          primaryBarrier: schoolSignup ? undefined : eligibilityPayload?.primaryBarrier,
          primaryBarriers: schoolSignup ? schoolPrimaryBarriers() : eligibilityPayload?.primaryBarriers,
          eligibilityQ1: schoolSignup ? undefined : eligibilityPayload?.q1,
          eligibilityQ2: schoolSignup ? undefined : eligibilityPayload?.q2,
          eligibilityQ3: schoolSignup ? undefined : eligibilityPayload?.q3,
          receivingUnemployment: schoolSignup ? undefined : eligibilityPayload?.receivingUnemployment,
          exhaustedUnemployment: schoolSignup ? undefined : eligibilityPayload?.exhaustedUnemployment,
          layoffCompany: schoolSignup ? undefined : eligibilityPayload?.layoffCompany,
          snapWic: schoolSignup ? undefined : eligibilityPayload?.snapWic,
          publicAssistancePrograms: schoolSignup ? undefined : eligibilityPayload?.publicAssistancePrograms,
          publicAssistanceHelpRequested: schoolSignup ? undefined : eligibilityPayload?.publicAssistanceHelpRequested,
          hearAbout: schoolSignup ? undefined : eligibilityPayload?.hearAbout,
          hearAboutOther: schoolSignup ? undefined : eligibilityPayload?.hearAboutOther,
          partnerAmbassadorReferral: schoolSignup
            ? undefined
            : eligibilityPayload?.partnerAmbassadorReferral,
          eligibilityQualifies: schoolSignup ? true : eligibilityPayload?.qualifies,
          eligibilityYesCount: schoolSignup ? 0 : eligibilityPayload?.yesCount,
          utmSource: attribution.utmSource,
          utmMedium: attribution.utmMedium,
          utmCampaign: attribution.utmCampaign,
          utmContent: attribution.utmContent,
          utmTerm: attribution.utmTerm,
          referrer: attribution.referrer,
          ...(CAPTCHA_ENABLED && turnstileToken ? { turnstileToken } : {}),
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        // Map common server-side errors to the specific field that produced
        // them so users can fix the issue inline instead of guessing.
        // WAP-26: a weak-password refusal is reported by reason so the copy
        // stays localised (the message text alone need not mention "password").
        const weakPassword = data?.reason === WEAK_PASSWORD_REASON;
        const serverMessage: string = weakPassword
          ? t('errPasswordWeak')
          : typeof data?.error === 'string' ? data.error : '';
        const lower = serverMessage.toLowerCase();
        const serverFieldErrors: typeof fieldErrors = {};
        if (weakPassword) {
          serverFieldErrors.password = serverMessage;
        } else if (lower.includes('already exists') || lower.includes('already registered')) {
          serverFieldErrors.email = serverMessage;
        } else if (lower.includes('password')) {
          serverFieldErrors.password = serverMessage;
        } else if (lower.includes('phone')) {
          serverFieldErrors.phone = serverMessage;
        } else if (lower.includes('email')) {
          serverFieldErrors.email = serverMessage;
        } else if (lower.includes('first name')) {
          serverFieldErrors.firstName = serverMessage;
        } else if (lower.includes('last name')) {
          serverFieldErrors.lastName = serverMessage;
        }
        if (Object.keys(serverFieldErrors).length > 0) {
          setFieldErrors((prev) => ({ ...prev, ...serverFieldErrors }));
        }
        // The Turnstile token is single-use and expires quickly — a failed
        // server-side check needs a fresh token, not just a re-submit.
        if (lower.includes('security check')) {
          setTurnstileToken(null);
          setTurnstileNotice('expired');
          turnstileRef.current?.reset();
        }
        setError(serverMessage || t('errAccountGeneric'));
        trackApplyFunnel(3, 'account_create_error', {
          program_slugs: programRankedSlugs,
          error_message: serverMessage || 'unknown_error',
        });
        setLoading(false);
        requestAnimationFrame(() => {
          errorSummaryRef.current?.focus();
          errorSummaryRef.current?.scrollIntoView({ block: 'center', behavior: scrollBehavior() });
        });
        return;
      }

      clearApplyBrowserState();
      try {
        clearPersistedPartnerRef();
        clearMarketingAttribution();
      } catch {
        /* ignore */
      }
      completedRef.current = true;
      const schoolMinor =
        schoolSignup &&
        eligibilityPayload?.ageGroup === 'under_18' &&
        eligibilityPayload?.parentGuardianEmail?.trim();
      const confirmationPath = schoolSignup
        ? `/apply/confirmation?school=1${schoolMinor ? '&minor=1' : ''}`
        : '/apply/confirmation';
      trackApplyFunnel(3, 'account_created', {
        program_slugs: programRankedSlugs,
        redirect_to: confirmationPath,
      });
      if (isPaidUtmSource(attribution.utmSource)) {
        trackConversionWithValue('apply_signup_completed', {
          program_slugs: programRankedSlugs,
          utm_source: attribution.utmSource,
          utm_medium: attribution.utmMedium,
          utm_campaign: attribution.utmCampaign,
          utm_content: attribution.utmContent,
          utm_term: attribution.utmTerm,
          referrer: attribution.referrer,
        });
      }

      if (data.message) {
        window.location.href = confirmationPath;
        return;
      }

      window.location.href = confirmationPath;
    } catch {
      setError(t('errNetwork'));
      trackApplyFunnel(3, 'account_create_error', { program_slugs: programRankedSlugs, error_message: 'network_or_unknown' });
      setLoading(false);
      requestAnimationFrame(() => {
        errorSummaryRef.current?.focus();
        errorSummaryRef.current?.scrollIntoView({ block: 'center', behavior: scrollBehavior() });
      });
    }
  };

  if (verifyEmailMode) {
    return (
      <div className="apply-form" style={{ textAlign: 'center', padding: '2rem 1rem' }}>
        <MailOpen size={56} aria-hidden="true" style={{ color: 'var(--color-accent)', display: 'block', margin: '0 auto 1rem' }} />
        <h2 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '0.75rem', color: 'var(--color-on-surface)' }}>{t('accountVerifyTitle')}</h2>
        <p style={{ fontSize: '1rem', color: 'var(--color-on-surface-variant)', lineHeight: 1.6, marginBottom: '0.5rem' }}>
          {t('accountVerifySentTo')}
        </p>
        <p style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--color-accent)', marginBottom: '1.25rem', wordBreak: 'break-all' }}>
          {verifyEmail}
        </p>
        <p style={{ fontSize: '0.9rem', color: 'var(--color-on-surface-variant)', lineHeight: 1.6, marginBottom: '1.5rem' }}>
          {t('accountVerifyInstructions')}
        </p>
        <LocalizedLink href="/login" className="btn btn-primary" style={{ display: 'inline-block', marginBottom: '1rem' }}>
          {t('accountVerifyLogin')}
        </LocalizedLink>
        <p style={{ fontSize: '0.85rem', color: 'var(--color-on-surface-variant)', marginTop: '1rem' }}>
          {t('accountVerifySpam')}{' '}
          <a href="tel:+15127771808" style={{ color: 'var(--color-accent)', fontWeight: 600 }}>
            (512) 777-1808
          </a>{' '}
          {t('accountVerifySpamSuffix')}
        </p>
      </div>
    );
  }

  if (init === 'loading') {
    return (
      <p role="status" aria-live="polite">
        {t('accountLoadingChoices')}
      </p>
    );
  }

  if (init === 'missing') return <ApplyResumeGate draft={savedDraft} hasEligibility={hasEligibility} recoveryContext={recoveryContext} />;

  return (
    <ApplyReadyContent header={readyHeader} intro={readyIntro} account>
    <form onSubmit={handleSubmit} className="apply-form" noValidate>
      <div className="apply-progress-bar" style={{ marginBottom: '1.25rem' }}>
        <div className="apply-progress-fill" style={{ width: '100%' }} />
        <p className="apply-progress-label">{t('accountProgressLabel')}</p>
      </div>

      <p className="apply-step-back-nav" style={{ marginBottom: '1rem' }}>
        <LocalizedLink href={applyRecoveryHref('/apply/results', recoveryContext)}>{t('accountBackResults')}</LocalizedLink>
      </p>

      <details className="apply-transition-details apply-transition-details--stacked">
        <summary className="apply-transition-details__summary">{t('accountTransitionSummary')}</summary>
        <div className="apply-transition-details__body">
          <div className="apply-transition-card" role="note" aria-label={t('accountAriaWhyNow')}>
            <strong>{t('accountWhyNowStrong')}</strong>
            <span>{t('accountWhyNowRest')}</span>
          </div>

          <div className="apply-transition-card" role="note" aria-label={t('accountAriaKeepLight')}>
            <strong>{t('accountKeepLightStrong')}</strong>
            <span>{t('accountKeepLightRest')}</span>
          </div>
        </div>
      </details>

      {rankedProgramLabels.length > 0 ? (
        <div className="apply-transition-card" role="note" aria-label={t('accountAriaSavedChoices')} style={{ marginTop: '0.75rem' }}>
          <strong>{t('accountSavedChoicesStrong')}</strong>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.5rem' }}>
            {rankedProgramLabels.map((label, index) => (
              <span
                key={`${label}-${index}`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  padding: '0.35rem 0.6rem',
                  borderRadius: '999px',
                  background: 'color-mix(in srgb, var(--color-accent) 8%, transparent)',
                  color: 'var(--color-on-surface)',
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                }}
              >
                <span style={{ color: 'var(--color-accent)', fontWeight: 800 }}>#{index + 1}</span>
                {label}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <p className="apply-step-desc" style={{ marginTop: '1rem' }}>
        {t('accountAfterCreateNote')}
      </p>

      <div className="apply-account-field-row" style={{ display: 'grid', gap: '0.75rem' }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label htmlFor="firstName">{tForm('firstNameRequired')}</label>
          <input
            id="firstName"
            type="text"
            value={firstName}
            onChange={(e) => {
              setFirstName(e.target.value);
              if (fieldErrors.firstName) setFieldErrors((f) => ({ ...f, firstName: undefined }));
            }}
            autoComplete="given-name"
            required
            aria-required="true"
            aria-invalid={!!fieldErrors.firstName}
          />
          {fieldErrors.firstName ? <p className="form-error" role="alert">{fieldErrors.firstName}</p> : null}
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label htmlFor="lastName">{tForm('lastNameRequired')}</label>
          <input
            id="lastName"
            type="text"
            value={lastName}
            onChange={(e) => {
              setLastName(e.target.value);
              if (fieldErrors.lastName) setFieldErrors((f) => ({ ...f, lastName: undefined }));
            }}
            autoComplete="family-name"
            required
            aria-required="true"
            aria-invalid={!!fieldErrors.lastName}
          />
          {fieldErrors.lastName ? <p className="form-error" role="alert">{fieldErrors.lastName}</p> : null}
        </div>
      </div>
      <div className="apply-account-field-row" style={{ display: 'grid', gap: '0.75rem' }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label htmlFor="email">{tForm('emailRequired')}</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (fieldErrors.email) setFieldErrors((f) => ({ ...f, email: undefined }));
            }}
            autoComplete="email"
            required
            aria-required="true"
            aria-invalid={!!fieldErrors.email}
            aria-describedby={fieldErrors.email ? 'email-error' : 'email-hint'}
          />
          <p id="email-hint" className="apply-field-hint">{t('accountEmailFieldHint')}</p>
          {fieldErrors.email ? <p id="email-error" className="form-error" role="alert">{fieldErrors.email}</p> : null}
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label htmlFor="phone">{tForm('phoneNumber')} *</label>
          <input
            id="phone"
            type="tel"
            inputMode="tel"
            placeholder="(512) 555-0100"
            value={phone}
            onChange={(e) => {
              const formatted = formatPhoneInput(e.target.value);
              setPhone(formatted);
              if (fieldErrors.phone) setFieldErrors((f) => ({ ...f, phone: undefined }));
              if (phoneError) {
                const digits = formatted.replace(/\D/g, '');
                if (digits.length >= 10) setPhoneError('');
              }
            }}
            onBlur={() => {
              const digits = phone.replace(/\D/g, '');
              if (digits.length > 0 && digits.length < 10) {
                setPhoneError(t('errPhoneDigits'));
              } else {
                setPhoneError('');
              }
            }}
            autoComplete="tel"
            required
            aria-required="true"
            aria-invalid={!!fieldErrors.phone || !!phoneError}
            aria-describedby={fieldErrors.phone ? 'phone-error' : phoneError ? 'phone-inline-error' : 'phone-hint'}
          />
          <p id="phone-hint" className="apply-field-hint">{t('accountPhoneFieldHint')}</p>
          {phoneError && (
            <p id="phone-inline-error" className="form-error" role="alert">
              {phoneError}
            </p>
          )}
          {fieldErrors.phone ? <p id="phone-error" className="form-error" role="alert">{fieldErrors.phone}</p> : null}
        </div>
      </div>
      <details
        open={optionalAddressOpen}
        onToggle={(e) => setOptionalAddressOpen((e.currentTarget as HTMLDetailsElement).open)}
        style={{
          marginBottom: '1rem',
          border: '1px solid color-mix(in srgb, var(--color-on-surface) 8%, transparent)',
          borderRadius: '0.875rem',
          padding: '0.9rem 1rem',
          background: 'var(--surface-container-low)',
        }}
      >
        <summary style={{ cursor: 'pointer', fontWeight: 700, color: 'var(--color-on-surface)' }}>
          {t('accountOptionalAddressSummary')}
        </summary>
        <p style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', margin: '0.5rem 0 0.9rem' }}>
          {t('accountOptionalAddressHint')}
        </p>
        <div className="form-group">
          <label htmlFor="addressLine1">{t('accountStreetOptional')}</label>
          <input
            id="addressLine1"
            type="text"
            value={addressLine1}
            onChange={(e) => {
              setAddressLine1(e.target.value);
              if (fieldErrors.addressLine1) setFieldErrors((f) => ({ ...f, addressLine1: undefined }));
            }}
            autoComplete="address-line1"
            inputMode="text"
            aria-invalid={!!fieldErrors.addressLine1}
          />
          {fieldErrors.addressLine1 ? <p className="form-error" role="alert">{fieldErrors.addressLine1}</p> : null}
        </div>
        <div className="form-group">
          <label htmlFor="addressLine2">{t('accountAptOptional')}</label>
          <input
            id="addressLine2"
            type="text"
            value={addressLine2}
            onChange={(e) => setAddressLine2(e.target.value)}
            autoComplete="address-line2"
            inputMode="text"
          />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label htmlFor="city">{t('accountCityOptional')}</label>
            <input
              id="city"
              type="text"
              value={city}
              onChange={(e) => {
                setCity(e.target.value);
                if (fieldErrors.city) setFieldErrors((f) => ({ ...f, city: undefined }));
              }}
              autoComplete="address-level2"
              inputMode="text"
              aria-invalid={!!fieldErrors.city}
            />
            {fieldErrors.city ? <p className="form-error" role="alert">{fieldErrors.city}</p> : null}
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label htmlFor="state">{t('accountStateOptional')}</label>
            <select
              id="state"
              value={stateVal}
              onChange={(e) => {
                setStateVal(e.target.value);
                if (fieldErrors.state) setFieldErrors((f) => ({ ...f, state: undefined }));
              }}
              autoComplete="address-level1"
              aria-invalid={!!fieldErrors.state}
            >
              <option value="">{t('accountStateSelect')}</option>
              {US_STATES.map((s) => (
                <option key={s.abbr} value={s.abbr}>{s.name}</option>
              ))}
            </select>
            {fieldErrors.state ? <p className="form-error" role="alert">{fieldErrors.state}</p> : null}
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label htmlFor="zip">{t('accountZipOptional')}</label>
            <input
              id="zip"
              type="text"
              inputMode="text"
              value={zip}
              onChange={(e) => {
                setZip(e.target.value);
                if (fieldErrors.zip) setFieldErrors((f) => ({ ...f, zip: undefined }));
              }}
              autoComplete="postal-code"
              aria-invalid={!!fieldErrors.zip}
            />
            {fieldErrors.zip ? <p className="form-error" role="alert">{fieldErrors.zip}</p> : null}
          </div>
        </div>
      </details>
      <div className="form-group">
        <label htmlFor="smsOptIn" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', minHeight: 44 }}>
          <input
            id="smsOptIn"
            type="checkbox"
            checked={smsOptIn}
            onChange={(e) => setSmsOptIn(e.target.checked)}
            aria-describedby="sms-opt-in-hint"
            style={{ width: 20, height: 20, flexShrink: 0 }}
          />
          <span style={{ fontSize: '0.9rem', lineHeight: 1.5 }}>
            <strong>{t('accountSmsLabel')}</strong> {t('accountSmsBody')}
          </span>
        </label>
        <p id="sms-opt-in-hint" style={{ fontSize: '13px', color: 'var(--color-on-surface-variant)', marginTop: '4px' }}>{t('accountSmsFinePrint')}</p>
      </div>
      <div className="form-group">
        <label htmlFor="password">{t('accountPasswordLabel')}</label>
        <div style={{ position: 'relative' }}>
          <input
            id="password"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (fieldErrors.password) setFieldErrors((f) => ({ ...f, password: undefined }));
            }}
            autoComplete="new-password"
            required
            aria-required="true"
            aria-invalid={!!fieldErrors.password}
            aria-describedby={fieldErrors.password ? 'password-error' : 'password-hint'}
            style={{ paddingRight: '2.5rem' }}
          />
          <PasswordToggle
            visible={showPassword}
            onToggle={() => setShowPassword((v) => !v)}
            showLabel={t('accountShowPassword')}
            hideLabel={t('accountHidePassword')}
            controls="password"
            style={{ right: '0.25rem' }}
          />
        </div>
        <p id="password-hint" className="apply-field-hint">{t('accountPasswordHint')}</p>
        {password.length > 0 ? (
          <div aria-live="polite" style={{ marginTop: '0.5rem' }}>
            <div
              aria-label={`${t('accountPasswordStrengthLabel')}: ${passwordStrengthTone}`}
              style={{ display: 'flex', gap: '0.35rem', marginBottom: '0.35rem' }}
            >
              {[0, 1, 2, 3].map((index) => {
                const active = index < passwordStrengthScore;
                const background =
                  !active
                    ? 'var(--outline-variant)'
                    : passwordStrengthScore <= 1
                      ? 'var(--color-accent)'
                      : passwordStrengthScore === 2
                        ? 'var(--color-gold)'
                        : 'var(--color-green)';
                return (
                  <span
                    key={index}
                    aria-hidden="true"
                    style={{
                      flex: 1,
                      height: '0.35rem',
                      borderRadius: '999px',
                      background,
                      transition: 'background 160ms ease',
                    }}
                  />
                );
              })}
            </div>
            <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>
              <strong>{t('accountPasswordStrengthLabel')}:</strong> {passwordStrengthTone}
            </p>
          </div>
        ) : null}
        {fieldErrors.password ? <p id="password-error" className="form-error" role="alert">{fieldErrors.password}</p> : null}
      </div>
      <div className="form-group">
        <label htmlFor="confirmPassword">{t('accountConfirmPasswordLabel')}</label>
        <div style={{ position: 'relative' }}>
          <input
            id="confirmPassword"
            type={showConfirmPassword ? 'text' : 'password'}
            value={confirmPassword}
            onChange={(e) => {
              setConfirmPassword(e.target.value);
              if (fieldErrors.confirmPassword) setFieldErrors((f) => ({ ...f, confirmPassword: undefined }));
            }}
            autoComplete="new-password"
            required
            aria-required="true"
            aria-invalid={!!fieldErrors.confirmPassword}
            aria-describedby={fieldErrors.confirmPassword ? 'confirm-password-error' : undefined}
            style={{ paddingRight: '2.5rem' }}
          />
          <PasswordToggle
            visible={showConfirmPassword}
            onToggle={() => setShowConfirmPassword((v) => !v)}
            showLabel={t('accountShowPassword')}
            hideLabel={t('accountHidePassword')}
            controls="confirmPassword"
            style={{ right: '0.25rem' }}
          />
        </div>
        {fieldErrors.confirmPassword ? <p id="confirm-password-error" className="form-error" role="alert">{fieldErrors.confirmPassword}</p> : null}
      </div>

      {/* Consent — each consent is its own checkbox with its own clear label.
          Required contact consent is unbundled from the optional SMS consent. */}
      <fieldset
        className="form-group"
        style={{ border: '1px solid var(--outline-variant)', borderRadius: '0.75rem', padding: '0.875rem 1rem' }}
      >
        <legend style={{ padding: '0 0.4rem', fontSize: '0.8125rem', fontWeight: 700, color: 'var(--color-on-surface-variant)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {t('accountConsentLegend')}
        </legend>
        <label htmlFor="contactConsent" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', marginBottom: '0.75rem', minHeight: 44 }}>
          <input
            id="contactConsent"
            type="checkbox"
            checked={contactConsent}
            onChange={(e) => {
              setContactConsent(e.target.checked);
              if (fieldErrors.contactConsent) setFieldErrors((f) => ({ ...f, contactConsent: undefined }));
            }}
            required
            aria-required="true"
            aria-invalid={!!fieldErrors.contactConsent}
            aria-describedby={fieldErrors.contactConsent ? 'contact-consent-error' : 'contact-consent-hint'}
            style={{ width: 20, height: 20, flexShrink: 0 }}
          />
          <span style={{ fontSize: '0.9rem', lineHeight: 1.5 }}>
            <strong>{t('accountContactConsent')}</strong> {t('accountContactConsentRest')}
          </span>
        </label>
        <p id="contact-consent-hint" className="apply-field-hint" style={{ margin: '0 0 0.5rem 0' }}>
          {t('accountConsentHint')}{' '}
          <LocalizedLink href="/privacy" style={{ color: 'var(--color-accent)', textDecoration: 'underline' }}>{t('privacyPolicy')}</LocalizedLink>.
        </p>
        {fieldErrors.contactConsent ? (
          <p id="contact-consent-error" className="form-error" role="alert" style={{ marginBottom: '0.5rem' }}>
            {fieldErrors.contactConsent}
          </p>
        ) : null}
      </fieldset>

      {error && (
        <div
          ref={errorSummaryRef}
          tabIndex={-1}
          role="alert"
          aria-live="assertive"
          className="form-error"
          style={{
            padding: '0.75rem 1rem',
            background: 'color-mix(in srgb, var(--color-accent) 8%, transparent)',
            border: '1px solid color-mix(in srgb, var(--color-accent) 25%, transparent)',
            borderRadius: '0.5rem',
            marginTop: '0.75rem',
          }}
        >
          {error}
        </div>
      )}

      {CAPTCHA_ENABLED && TURNSTILE_SITE_KEY ? (
        <div className="form-group">
          <Turnstile
            ref={turnstileRef}
            siteKey={TURNSTILE_SITE_KEY}
            onSuccess={(token) => {
              setTurnstileToken(token);
              setTurnstileNotice('none');
            }}
            onExpire={() => {
              setTurnstileToken(null);
              setTurnstileNotice('expired');
              turnstileRef.current?.reset();
            }}
            onError={() => {
              setTurnstileToken(null);
              setTurnstileNotice('error');
              turnstileRef.current?.reset();
            }}
            options={{ theme: 'auto', size: 'normal' }}
          />
          {turnstileNotice !== 'none' ? (
            <p className="apply-field-hint" role="status" aria-live="polite" style={{ marginTop: '0.5rem' }}>
              {turnstileNotice === 'expired' ? t('accountTurnstileExpiredHint') : t('accountTurnstileErrorHint')}
            </p>
          ) : null}
        </div>
      ) : null}

      <button
        type="submit"
        className={marketingButtonPresets.formSubmitPrimary('btn-submit-full')}
        disabled={loading || (CAPTCHA_ENABLED && !!TURNSTILE_SITE_KEY && !turnstileToken)}
        aria-busy={loading}
      >
        {loading ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
            <span
              aria-hidden="true"
              style={{
                width: '1rem',
                height: '1rem',
                border: '2px solid currentColor',
                borderRightColor: 'transparent',
                borderRadius: '50%',
                display: 'inline-block',
                animation: 'apply-spin 0.7s linear infinite',
              }}
            />
            {t('accountCreating')}
          </span>
        ) : (
          t('accountSubmitCta')
        )}
      </button>
      <style>{`@keyframes apply-spin { to { transform: rotate(360deg); } }`}</style>
      <p style={{ marginTop: '0.75rem', marginBottom: 0, fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', textAlign: 'center', lineHeight: 1.5 }}>
        {t('accountProfileLater')}
      </p>
    </form>
    <p className="afd-footnote">{t('createAccountAlready')}{' '}<LocalizedLink href="/login">{t('createAccountLogIn')}</LocalizedLink></p>
    </ApplyReadyContent>
  );
}
