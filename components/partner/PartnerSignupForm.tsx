'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { trackLeadFormEvent } from '@/lib/analytics/events';
import HearAboutSelect from '@/components/apply/HearAboutSelect';
import { hearAboutNeedsOther } from '@/lib/apply/eligibilityExtendedFields';

const Turnstile = dynamic(() => import('@marsidev/react-turnstile').then((m) => m.Turnstile), { ssr: false });

const CAPTCHA_ENABLED = process.env.NEXT_PUBLIC_CAPTCHA_ENABLED === 'true';
const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? '';

const ORG_TYPES = [
  { value: '', label: 'Select…' },
  { value: 'nonprofit', label: 'Nonprofit' },
  { value: 'church', label: 'Church / faith organization' },
  { value: 'community_center', label: 'Community center' },
  { value: 'workforce_board', label: 'Workforce board' },
  { value: 'school', label: 'School / college' },
  { value: 'veterans', label: 'Veterans organization' },
  { value: 'other', label: 'Other' },
];

const MONTHLY = [
  { value: '', label: 'Select…' },
  { value: '1-5', label: '1–5' },
  { value: '6-15', label: '6–15' },
  { value: '16-30', label: '16–30' },
  { value: '30+', label: '30+' },
];

export default function PartnerSignupForm() {
  const router = useRouter();
  const [status, setStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [hearAbout, setHearAbout] = useState('');
  const [hearAboutOther, setHearAboutOther] = useState('');

  useEffect(() => {
    trackLeadFormEvent('partner_signup', 'viewed');
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (CAPTCHA_ENABLED && TURNSTILE_SITE_KEY && !turnstileToken?.trim()) {
      setStatus('error');
      setErrorMsg('Please complete the security check before continuing.');
      return;
    }
    const form = e.currentTarget;
    const fd = new FormData(form);

    const password = String(fd.get('password') || '');
    const confirmPassword = String(fd.get('confirm_password') || '');

    if (password.length < 8) {
      setStatus('error');
      setErrorMsg('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setStatus('error');
      setErrorMsg('Passwords do not match.');
      return;
    }

    const payload = {
      organizationName: String(fd.get('organization_name') || '').trim(),
      contactName: String(fd.get('contact_name') || '').trim(),
      contactEmail: String(fd.get('contact_email') || '').trim().toLowerCase(),
      contactPhone: String(fd.get('contact_phone') || '').trim() || null,
      orgType: String(fd.get('org_type') || '').trim(),
      serveArea: String(fd.get('serve_area') || '').trim(),
      expectedMonthly: String(fd.get('expected_monthly') || '').trim(),
      hearAbout: hearAboutNeedsOther(hearAbout)
        ? [hearAbout, hearAboutOther.trim()].filter(Boolean).join(': ').slice(0, 2000) || null
        : hearAbout.trim() || null,
      password,
      ...(CAPTCHA_ENABLED && turnstileToken ? { turnstileToken } : {}),
    };

    setStatus('sending');
    setErrorMsg(null);
    trackLeadFormEvent('partner_signup', 'submitted', { org_type: payload.orgType, expected_monthly: payload.expectedMonthly });

    try {
      const res = await fetch('/api/partner/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus('error');
        trackLeadFormEvent('partner_signup', 'errored', { reason: typeof data.error === 'string' ? data.error : 'request_failed' });
        setErrorMsg(typeof data.error === 'string' ? data.error : 'Something went wrong.');
        return;
      }
      setStatus('success');
      trackLeadFormEvent('partner_signup', 'succeeded', { org_type: payload.orgType, expected_monthly: payload.expectedMonthly });
      form.reset();
      setHearAbout('');
      setHearAboutOther('');
      router.push('/partners/thank-you');
    } catch {
      setStatus('error');
      trackLeadFormEvent('partner_signup', 'errored', { reason: 'network_error' });
      setErrorMsg('Network error. Please try again.');
    }
  }

  if (status === 'success') {
    return null;
  }

  return (
    <form className="contact-form partner-signup-form" onSubmit={handleSubmit}>
      {status === 'error' && errorMsg ? (
        <div
          style={{
            padding: '0.75rem',
            marginBottom: '1rem',
            background: 'color-mix(in srgb, var(--color-accent) 10%, transparent)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--color-accent)',
            fontSize: '0.9rem',
          }}
          role="alert"
        >
          {errorMsg}
        </div>
      ) : null}

      <div className="form-group">
        <label htmlFor="ps-org">Organization name *</label>
        <input id="ps-org" name="organization_name" required maxLength={200} disabled={status === 'sending'} />
      </div>
      <div className="form-group">
        <label htmlFor="ps-contact">Contact name *</label>
        <input id="ps-contact" name="contact_name" required maxLength={200} disabled={status === 'sending'} />
      </div>
      <div className="form-group">
        <label htmlFor="ps-email">Contact email *</label>
        <input id="ps-email" name="contact_email" type="email" required maxLength={320} disabled={status === 'sending'} />
      </div>
      <div className="form-group">
        <label htmlFor="ps-phone">Contact phone</label>
        <input id="ps-phone" name="contact_phone" type="tel" maxLength={50} disabled={status === 'sending'} />
      </div>
      <div className="form-group">
        <label htmlFor="ps-type">Organization type *</label>
        <select id="ps-type" name="org_type" className="form-control" required disabled={status === 'sending'}>
          {ORG_TYPES.map((o) => (
            <option key={o.value || 'x'} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div className="form-group">
        <label htmlFor="ps-area">City / county you serve *</label>
        <input id="ps-area" name="serve_area" required maxLength={200} disabled={status === 'sending'} />
      </div>
      <div className="form-group">
        <label htmlFor="ps-monthly">Estimated monthly referrals *</label>
        <select id="ps-monthly" name="expected_monthly" className="form-control" required disabled={status === 'sending'}>
          {MONTHLY.map((o) => (
            <option key={o.value || 'x'} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div className="form-group">
        <label htmlFor="ps-hear">How did you hear about WorkforceAP?</label>
        <HearAboutSelect
          id="ps-hear"
          name="hear_about"
          value={hearAbout}
          onChange={setHearAbout}
          disabled={status === 'sending'}
        />
      </div>
      {hearAboutNeedsOther(hearAbout) ? (
        <div className="form-group">
          <label htmlFor="ps-hear-other">Please tell us how you heard about us</label>
          <input
            id="ps-hear-other"
            name="hear_about_other"
            value={hearAboutOther}
            onChange={(e) => setHearAboutOther(e.target.value)}
            maxLength={200}
            disabled={status === 'sending'}
          />
        </div>
      ) : null}

      <div className="form-group">
        <label htmlFor="ps-password">Create password *</label>
        <input
          id="ps-password"
          name="password"
          type="password"
          required
          minLength={8}
          maxLength={128}
          disabled={status === 'sending'}
          autoComplete="new-password"
        />
        <small style={{ color: 'var(--color-on-surface-variant)', fontSize: '0.8125rem' }}>
          Must be at least 8 characters
        </small>
      </div>
      <div className="form-group">
        <label htmlFor="ps-confirm-password">Confirm password *</label>
        <input
          id="ps-confirm-password"
          name="confirm_password"
          type="password"
          required
          minLength={8}
          maxLength={128}
          disabled={status === 'sending'}
          autoComplete="new-password"
        />
      </div>

      {CAPTCHA_ENABLED && TURNSTILE_SITE_KEY ? (
        <div className="form-group partner-signup-turnstile">
          <Turnstile
            siteKey={TURNSTILE_SITE_KEY}
            onSuccess={(t) => setTurnstileToken(t)}
            onExpire={() => setTurnstileToken(null)}
            onError={() => setTurnstileToken(null)}
            options={{ theme: 'light', size: 'normal' }}
          />
        </div>
      ) : null}

      <p style={{ marginBottom: '0.75rem', fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', textAlign: 'center' }}>
        Payout eligibility depends on partner type and verification. Placements are verified before any payout, and full details are covered during onboarding.
      </p>

      <button
        type="submit"
        className="btn btn-primary"
        style={{ width: '100%', padding: '1rem' }}
        disabled={status === 'sending' || (CAPTCHA_ENABLED && !!TURNSTILE_SITE_KEY && !turnstileToken)}
      >
        {status === 'sending' ? 'Creating your account…' : 'Create partner account'}
      </button>

      <p style={{ marginTop: '0.75rem', fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', textAlign: 'center' }}>
        By signing up, you agree to our Terms of Service and Privacy Policy.
      </p>
    </form>
  );
}
