'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import LocalizedLink from '@/components/LocalizedLink';
import { requestFailureMessage } from '@/lib/http/requestFailureCopy';
import styles from './mentor-apply.module.css';

const INDUSTRIES = [
  'Technology',
  'Healthcare',
  'Finance',
  'Manufacturing',
  'Retail',
  'Education',
  'Construction',
  'Logistics',
  'Hospitality',
  'Other',
];

const SUBMIT_FAILED = 'We could not send your application. Please try again.';

export default function MentorApplyForm() {
  const tCommon = useTranslations('common');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    fullName: '',
    title: '',
    company: '',
    industry: '',
    bio: '',
    linkedinUrl: '',
    availableHours: 2,
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/mentors/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setSubmitted(true);
        return;
      }
      // A server rejection is JSON `{ error }`; a non-JSON answer falls through
      // to the generic sentence.
      const data = (await res.json().catch(() => ({}))) as { error?: unknown };
      setError(typeof data.error === 'string' && data.error.trim() ? data.error : SUBMIT_FAILED);
    } catch (err) {
      setError(
        requestFailureMessage(err, { connection: tCommon('connectionError'), fallback: SUBMIT_FAILED }, 'mentor-apply'),
      );
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <div className={styles.successWrap}>
        <div className={`mdx-card ${styles.successCard}`}>
          <div className={styles.successIcon} aria-hidden="true">
            <CheckCircle2 width={32} height={32} />
          </div>
          <h2>Application Received!</h2>
          <p>
            Thanks for applying to mentor with WorkforceAP. We&rsquo;ll review your application
            and reach out by email.
          </p>
          <LocalizedLink href="/" className="btn btn-primary">
            Back to Home
          </LocalizedLink>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <LocalizedLink href="/mentor" className={styles.back}>
        <ArrowLeft width={16} height={16} aria-hidden="true" />
        Back
      </LocalizedLink>

      <p style={{ color: 'var(--mdx-muted, #6e6a66)', margin: '0.75rem 0 1.75rem', fontSize: '0.95rem' }}>
        Tell us about yourself so we can match you with the right members.
      </p>

      <form onSubmit={handleSubmit} className={`mdx-card ${styles.form}`}>
        {[
          { label: 'Full Name', key: 'fullName', type: 'text', required: true },
          { label: 'Job Title', key: 'title', type: 'text', required: true },
          { label: 'Company', key: 'company', type: 'text', required: true },
          { label: 'LinkedIn URL', key: 'linkedinUrl', type: 'url', required: false },
        ].map(({ label, key, type, required }) => (
          <div key={key} className={styles.field}>
            <label htmlFor={`mentor-${key}`}>
              {label}
              {required && <span className={styles.req}> *</span>}
            </label>
            <input
              id={`mentor-${key}`}
              type={type}
              required={required}
              value={(form as Record<string, unknown>)[key] as string}
              onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
              className={styles.input}
            />
          </div>
        ))}

        <div className={styles.field}>
          <label htmlFor="mentor-industry">
            Industry<span className={styles.req}> *</span>
          </label>
          <select
            id="mentor-industry"
            required
            value={form.industry}
            onChange={(e) => setForm((f) => ({ ...f, industry: e.target.value }))}
            className={styles.select}
          >
            <option value="">Select industry</option>
            {INDUSTRIES.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.field}>
          <label htmlFor="mentor-bio">
            Bio<span className={styles.req}> *</span>
          </label>
          <textarea
            id="mentor-bio"
            required
            rows={4}
            value={form.bio}
            onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
            placeholder="Tell members about your background, expertise, and what you can help with..."
            className={styles.textarea}
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="mentor-availableHours">
            Hours Available per Month<span className={styles.req}> *</span>
          </label>
          <input
            id="mentor-availableHours"
            type="number"
            min={1}
            max={40}
            required
            value={form.availableHours}
            onChange={(e) => setForm((f) => ({ ...f, availableHours: Number(e.target.value) }))}
            className={`${styles.input} ${styles.hours}`}
          />
        </div>

        {error && (
          <p role="alert" style={{ color: 'var(--wa-danger, #dc2626)', fontSize: '0.875rem', fontWeight: 600, margin: '0 0 0.75rem' }}>
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={loading}
          className={`btn btn-primary btn-full-width ${styles.submit}`}
        >
          {loading ? 'Submitting…' : 'Submit Application'}
        </button>
      </form>
    </div>
  );
}
