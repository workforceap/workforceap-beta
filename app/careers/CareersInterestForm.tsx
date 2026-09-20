'use client';

import { useEffect, useId, useState } from 'react';
import dynamic from 'next/dynamic';
import { trackLeadFormEvent } from '@/lib/analytics/events';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { marketingButtonPresets } from '@/lib/marketing/buttonClasses';
import {
  type CareersLeadErrorCode,
  type CareersLeadFieldKey,
  validateCareersLeadPayload,
} from '@/lib/validation/careersLead';

const Turnstile = dynamic(() => import('@marsidev/react-turnstile').then((m) => m.Turnstile), { ssr: false });

const CAPTCHA_ENABLED = process.env.NEXT_PUBLIC_CAPTCHA_ENABLED === 'true';
const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? '';

const INTEREST_AREAS = [
  { value: '', labelKey: 'interestSelect' as const },
  { value: 'counselor', labelKey: 'interestCounselor' as const },
  { value: 'engineering', labelKey: 'interestEngineering' as const },
  { value: 'operations', labelKey: 'interestOperations' as const },
  { value: 'other', labelKey: 'interestOther' as const },
];

export default function CareersInterestForm() {
  const t = useTranslations('marketing.careers.form');
  const tForm = useTranslations('form');
  const tCommon = useTranslations('common');
  const searchParams = useSearchParams();
  const formId = useId();
  const errorId = `${formId}-error`;
  const roleTitle = searchParams?.get('role')?.trim() || '';

  const [status, setStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<CareersLeadFieldKey, CareersLeadErrorCode>>>({});
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

  useEffect(() => {
    trackLeadFormEvent('careers', 'viewed');
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus('sending');
    setErrorMsg(null);

    const form = e.currentTarget;
    const fd = new FormData(form);
    const payload = {
      first_name: fd.get('first_name'),
      last_name: fd.get('last_name'),
      email: fd.get('email'),
      interest_area: fd.get('interest_area'),
      message: fd.get('message'),
      role_title: roleTitle,
      cf_turnstile_response: turnstileToken,
    };

    const validation = validateCareersLeadPayload(payload);
    if (!validation.ok) {
      setFieldErrors(validation.fieldErrors);
      setStatus('error');
      setErrorMsg(t('validationSummary'));
      trackLeadFormEvent('careers', 'errored', { reason: 'validation' });
      return;
    }

    setFieldErrors({});
    trackLeadFormEvent('careers', 'submitted');

    try {
      const res = await fetch('/api/leads/careers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };

      if (!res.ok) {
        throw new Error(data.error || t('submitError'));
      }

      setStatus('success');
      form.reset();
      setTurnstileToken(null);
      trackLeadFormEvent('careers', 'succeeded');
    } catch (err) {
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : t('submitError'));
      trackLeadFormEvent('careers', 'errored', { reason: 'network' });
    }
  }

  if (status === 'success') {
    return (
      <div
        role="status"
        style={{
          padding: '1.5rem',
          borderRadius: '0.875rem',
          background: 'rgba(46, 125, 50, 0.12)',
          border: '1px solid rgba(46, 125, 50, 0.35)',
          color: 'var(--color-on-surface)',
        }}
      >
        <p style={{ margin: 0, fontWeight: 700 }}>{t('successTitle')}</p>
        <p style={{ margin: '0.5rem 0 0', color: 'var(--color-on-surface-variant)' }}>{t('successBody')}</p>
      </div>
    );
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '0.75rem 1rem',
    borderRadius: '0.5rem',
    border: '1px solid var(--outline-variant, #584144)',
    background: 'var(--surface-container-lowest, #fff)',
    color: 'var(--color-on-surface)',
    fontSize: '1rem',
  };

  function getFieldErrorMessage(field: CareersLeadFieldKey, code: CareersLeadErrorCode): string {
    switch (field) {
      case 'first_name':
        return t('errors.firstNameRequired');
      case 'last_name':
        return t('errors.lastNameRequired');
      case 'email':
        return t(code === 'required' ? 'errors.emailRequired' : 'errors.emailInvalid');
      case 'message':
        return t(code === 'required' ? 'errors.messageRequired' : 'errors.messageTooShort');
      default:
        return t('validationSummary');
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate aria-describedby={errorMsg ? errorId : undefined}>
      {roleTitle ? (
        <div
          role="status"
          style={{
            marginBottom: '1rem',
            padding: '0.75rem 1rem',
            borderRadius: '0.5rem',
            background: 'rgba(173, 44, 77, 0.08)',
            color: 'var(--color-on-surface)',
            fontSize: '0.9rem',
          }}
        >
          <strong>{t('applyingForLabel')}</strong> {roleTitle}
        </div>
      ) : null}

      {errorMsg && (
        <div
          id={errorId}
          role="alert"
          style={{
            marginBottom: '1rem',
            padding: '0.75rem 1rem',
            borderRadius: '0.5rem',
            background: 'rgba(173, 44, 77, 0.12)',
            color: 'var(--color-on-surface)',
            fontSize: '0.875rem',
          }}
        >
          {errorMsg}
        </div>
      )}

      <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <div>
          <label htmlFor={`${formId}-first`} style={{ display: 'block', marginBottom: '0.35rem', fontWeight: 600 }}>
            {tForm('firstName')} <span aria-hidden="true">*</span>
          </label>
          <input
            id={`${formId}-first`}
            name="first_name"
            type="text"
            autoComplete="given-name"
            required
            style={inputStyle}
            aria-invalid={fieldErrors.first_name ? 'true' : undefined}
          />
          {fieldErrors.first_name && (
            <p style={{ margin: '0.35rem 0 0', fontSize: '0.8125rem', color: 'var(--color-accent)' }}>
              {getFieldErrorMessage('first_name', fieldErrors.first_name)}
            </p>
          )}
        </div>
        <div>
          <label htmlFor={`${formId}-last`} style={{ display: 'block', marginBottom: '0.35rem', fontWeight: 600 }}>
            {tForm('lastName')} <span aria-hidden="true">*</span>
          </label>
          <input
            id={`${formId}-last`}
            name="last_name"
            type="text"
            autoComplete="family-name"
            required
            style={inputStyle}
            aria-invalid={fieldErrors.last_name ? 'true' : undefined}
          />
          {fieldErrors.last_name && (
            <p style={{ margin: '0.35rem 0 0', fontSize: '0.8125rem', color: 'var(--color-accent)' }}>
              {getFieldErrorMessage('last_name', fieldErrors.last_name)}
            </p>
          )}
        </div>
      </div>

      <div style={{ marginTop: '1rem' }}>
        <label htmlFor={`${formId}-email`} style={{ display: 'block', marginBottom: '0.35rem', fontWeight: 600 }}>
          {tForm('email')} <span aria-hidden="true">*</span>
        </label>
        <input
          id={`${formId}-email`}
          name="email"
          type="email"
          autoComplete="email"
          required
          style={inputStyle}
          aria-invalid={fieldErrors.email ? 'true' : undefined}
        />
        {fieldErrors.email && (
          <p style={{ margin: '0.35rem 0 0', fontSize: '0.8125rem', color: 'var(--color-accent)' }}>
            {getFieldErrorMessage('email', fieldErrors.email)}
          </p>
        )}
      </div>

      <div style={{ marginTop: '1rem' }}>
        <label htmlFor={`${formId}-interest`} style={{ display: 'block', marginBottom: '0.35rem', fontWeight: 600 }}>
          {t('interestLabel')}
        </label>
        <select id={`${formId}-interest`} name="interest_area" defaultValue="" style={inputStyle}>
          {INTEREST_AREAS.map(({ value, labelKey }) => (
            <option key={value || 'empty'} value={value}>
              {t(labelKey)}
            </option>
          ))}
        </select>
      </div>

      <div style={{ marginTop: '1rem' }}>
        <label htmlFor={`${formId}-message`} style={{ display: 'block', marginBottom: '0.35rem', fontWeight: 600 }}>
          {t('messageLabel')} <span aria-hidden="true">*</span>
        </label>
        <textarea
          id={`${formId}-message`}
          name="message"
          rows={5}
          required
          style={{ ...inputStyle, resize: 'vertical' }}
          aria-invalid={fieldErrors.message ? 'true' : undefined}
          placeholder={t('messagePlaceholder')}
        />
        {fieldErrors.message && (
          <p style={{ margin: '0.35rem 0 0', fontSize: '0.8125rem', color: 'var(--color-accent)' }}>
            {getFieldErrorMessage('message', fieldErrors.message)}
          </p>
        )}
      </div>

      {CAPTCHA_ENABLED && TURNSTILE_SITE_KEY && (
        <div style={{ marginTop: '1rem' }}>
          <Turnstile siteKey={TURNSTILE_SITE_KEY} onSuccess={setTurnstileToken} onExpire={() => setTurnstileToken(null)} />
        </div>
      )}

      <button
        type="submit"
        disabled={status === 'sending'}
        className={marketingButtonPresets.heroPrimary()}
        style={{ marginTop: '1.25rem', width: '100%' }}
      >
        {status === 'sending' ? tCommon('sending') : t('submit')}
      </button>
    </form>
  );
}
