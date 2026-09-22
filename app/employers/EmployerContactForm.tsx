'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { trackLeadFormEvent } from '@/lib/analytics/events';
import { marketingButtonPresets } from '@/lib/marketing/buttonClasses';

const Turnstile = dynamic(() => import('@marsidev/react-turnstile').then((m) => m.Turnstile), { ssr: false });

const CAPTCHA_ENABLED = process.env.NEXT_PUBLIC_CAPTCHA_ENABLED === 'true';
const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? '';

const HIRE_VOLUME = [
  { value: '', label: 'Select…' },
  { value: '1', label: '1' },
  { value: '2-3', label: '2–3' },
  { value: '4-5', label: '4–5' },
  { value: '6-10', label: '6–10' },
  { value: '10+', label: '10+' },
];

const HIRING_TIMELINE = [
  { value: '', label: 'Select…' },
  { value: 'immediately', label: 'Immediately' },
  { value: '30-60_days', label: '30–60 days' },
  { value: '60-90_days', label: '60–90 days' },
  { value: '3-6_months', label: '3–6 months' },
  { value: 'planning', label: 'Planning ahead' },
];

const INTEREST_USE_CASE = [
  { value: '', label: 'Select…' },
  { value: 'direct_hiring', label: 'Direct hiring' },
  { value: 'pipeline_building', label: 'Pipeline building' },
  { value: 'internship_apprenticeship', label: 'Internship / apprenticeship' },
  { value: 'upskilling', label: 'Upskilling current staff' },
  { value: 'partnership', label: 'Long-term talent partnership' },
];

export default function EmployerContactForm() {
  const router = useRouter();
  const [status, setStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');

  useEffect(() => {
    trackLeadFormEvent('employer_intake', 'viewed');
  }, []);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (CAPTCHA_ENABLED && TURNSTILE_SITE_KEY) {
      if (!turnstileToken?.trim()) {
        setErrorMsg('Please complete the security check before sending.');
        return;
      }
    }
    const form = e.currentTarget;
    const formData = new FormData(form);
    const contactName = String(formData.get('contact_name') || '').trim();
    const nameParts = contactName.split(/\s+/).filter(Boolean);
    const first_name = nameParts[0] || contactName;
    const last_name = nameParts.slice(1).join(' ') || '(Contact)';
    const company = String(formData.get('company') || '').trim();
    const roleTitle = String(formData.get('role_title') || '').trim();
    const rolesHiring = String(formData.get('roles_hiring') || '').trim();
    const openRoles = String(formData.get('open_roles') || '').trim();
    const hiringTimeline = String(formData.get('hiring_timeline') || '').trim();
    const interestUseCase = String(formData.get('interest_use_case') || '').trim();

    const message = [
      company ? `Company: ${company}` : '',
      roleTitle ? `Role / title: ${roleTitle}` : '',
      openRoles ? `Open roles in next 6 months: ${openRoles}` : '',
      hiringTimeline ? `Hiring timeline: ${hiringTimeline}` : '',
      interestUseCase ? `Interest / use case: ${interestUseCase}` : '',
      '',
      'What roles are you hiring for?',
      rolesHiring || '(Not specified)',
    ]
      .filter(Boolean)
      .join('\n');

    const data: Record<string, unknown> = {
      first_name,
      last_name,
      email: formData.get('email'),
      phone: formData.get('phone') || '',
      topic: 'Employer Partnership Intake',
      message,
      sms_preferred: false,
    };
    if (CAPTCHA_ENABLED && turnstileToken) {
      data.cf_turnstile_response = turnstileToken;
    }

    setStatus('sending');
    setErrorMsg(null);
    trackLeadFormEvent('employer_intake', 'submitted', {
      hiring_timeline: hiringTimeline || undefined,
      interest_use_case: interestUseCase || undefined,
      open_roles: openRoles || undefined,
    });

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json();

      if (!res.ok) {
        setStatus('error');
        trackLeadFormEvent('employer_intake', 'errored', { reason: json.error ?? 'request_failed' });
        setErrorMsg(json.error ?? 'Something went wrong. Please try again.');
        return;
      }

      setStatus('success');
      trackLeadFormEvent('employer_intake', 'succeeded', {
        hiring_timeline: hiringTimeline || undefined,
        interest_use_case: interestUseCase || undefined,
        open_roles: openRoles || undefined,
      });
      form.reset();
      router.push('/employer/thank-you');
    } catch {
      setStatus('error');
      trackLeadFormEvent('employer_intake', 'errored', { reason: 'network_error' });
      setErrorMsg('Network error. Please try again.');
    }
  }

  if (status === 'success') {
    return null;
  }

  return (
    <div
      style={{
        background: 'var(--surface-container)',
        borderRadius: 'var(--radius-xl)',
        padding: '2rem',
      }}
    >
    <form className="contact-form employer-contact-form" onSubmit={handleSubmit} id="employer-contact-form">
      <div
        style={{
          marginBottom: '1.25rem',
          padding: '1rem 1.1rem',
          borderRadius: 'var(--radius-md)',
          background: 'var(--surface-container-high)',
          border: '1px solid var(--outline-variant)',
        }}
      >
        <p style={{ margin: 0, color: 'var(--color-on-surface)', fontSize: '0.95rem', fontWeight: 700, lineHeight: 1.5 }}>
          Employer intake for hiring managers, talent leaders, and program owners.
        </p>
        <p style={{ margin: '0.5rem 0 0', color: 'var(--color-on-surface-variant)', fontSize: '0.85rem', lineHeight: 1.5 }}>
          Share your hiring intent, role needs, expected volume, and timeline. Our team reviews every submission and emails you with the right partnership path.
        </p>
      </div>
      {status === 'error' && errorMsg && (
        <div
          role="alert"
          style={{
            padding: '0.75rem',
            marginBottom: '1rem',
            background: 'color-mix(in srgb, var(--color-accent) 10%, transparent)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--color-accent)',
            fontSize: '0.9rem',
          }}
        >
          {errorMsg}
        </div>
      )}
      <div className="form-group">
        <label htmlFor="employer-company">Company name *</label>
        <input id="employer-company" type="text" name="company" required disabled={status === 'sending'} aria-required="true" />
      </div>
      <div className="form-group">
        <label htmlFor="employer-contact-name">Contact name *</label>
        <input id="employer-contact-name" type="text" name="contact_name" required disabled={status === 'sending'} aria-required="true" />
      </div>
      <div className="form-group">
        <label htmlFor="employer-role-title">Role / title</label>
        <input id="employer-role-title" type="text" name="role_title" disabled={status === 'sending'} placeholder="e.g. Director of Talent" />
      </div>
      <div className="form-group">
        <label htmlFor="employer-email">Email *</label>
        <input id="employer-email" type="email" name="email" required disabled={status === 'sending'} aria-required="true" />
      </div>
      <div className="form-group">
        <label htmlFor="employer-phone">Phone</label>
        <input id="employer-phone" type="tel" name="phone" disabled={status === 'sending'} />
      </div>
      <div className="form-group">
        <label htmlFor="employer-open-roles">How many roles do you expect to hire in the next 6 months? *</label>
        <select id="employer-open-roles" name="open_roles" className="form-control" required disabled={status === 'sending'} aria-required="true">
          {HIRE_VOLUME.map((o) => (
            <option key={o.value || 'empty'} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div className="form-group">
        <label htmlFor="employer-hiring-timeline">When do you expect to hire? *</label>
        <select id="employer-hiring-timeline" name="hiring_timeline" className="form-control" required disabled={status === 'sending'} aria-required="true">
          {HIRING_TIMELINE.map((o) => (
            <option key={o.value || 'empty'} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div className="form-group">
        <label htmlFor="employer-interest-use-case">What best describes your hiring use case? *</label>
        <select id="employer-interest-use-case" name="interest_use_case" className="form-control" required disabled={status === 'sending'} aria-required="true">
          {INTEREST_USE_CASE.map((o) => (
            <option key={o.value || 'empty'} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div className="form-group">
        <label htmlFor="employer-roles-hiring">What roles are you hiring for? *</label>
        <textarea
          id="employer-roles-hiring"
          name="roles_hiring"
          rows={4}
          required
          disabled={status === 'sending'}
          aria-required="true"
          placeholder="Include titles, locations, full-time or contract, must-have skills, and timeline…"
        />
      </div>
      {CAPTCHA_ENABLED && TURNSTILE_SITE_KEY ? (
        <div className="form-group employer-contact-turnstile">
          <Turnstile
            siteKey={TURNSTILE_SITE_KEY}
            onSuccess={(t) => setTurnstileToken(t)}
            onExpire={() => setTurnstileToken(null)}
            onError={() => setTurnstileToken(null)}
            options={{ theme: 'light', size: 'normal' }}
          />
        </div>
      ) : null}
      <button
        type="submit"
        className={marketingButtonPresets.formSubmitPrimary('btn-full-width')}
        disabled={status === 'sending'}
      >
        {status === 'sending' ? 'Sending…' : 'Submit employer intake'}
      </button>
      <p style={{ textAlign: 'center', marginTop: '1rem', color: 'var(--color-on-surface-variant)', fontSize: '.85rem' }}>
        We review every submission and follow up by email.
      </p>
    </form>
    </div>
  );
}
