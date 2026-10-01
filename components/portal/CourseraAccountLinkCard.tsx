'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { requestFailureMessage } from '@/lib/http/requestFailureCopy';

type Props = {
  portalEmail: string;
  initialCourseraEmail: string | null;
};

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export default function CourseraAccountLinkCard({ portalEmail, initialCourseraEmail }: Props) {
  const [email, setEmail] = useState(initialCourseraEmail ?? portalEmail);
  const [savedEmail, setSavedEmail] = useState(initialCourseraEmail);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tCommon = useTranslations('common');
  const [message, setMessage] = useState<string | null>(null);

  const normalizedEmail = normalizeEmail(email);
  const usingPortalEmail = normalizedEmail === normalizeEmail(portalEmail);
  const hasSavedDifferentEmail = savedEmail && normalizeEmail(savedEmail) !== normalizeEmail(portalEmail);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch('/api/member/coursera/identity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseraEmail: normalizedEmail }),
      });
      const payload = (await response.json()) as { courseraEmail?: string; error?: string };
      if (!response.ok) throw new Error(payload.error ?? 'Unable to save your Coursera email right now.');
      setSavedEmail(payload.courseraEmail ?? normalizedEmail);
      setMessage('Saved. We will use this email to match your Coursera progress.');
    } catch (err) {
      setError(
        requestFailureMessage(
          err,
          { connection: tCommon('connectionError'), fallback: 'Unable to save your Coursera email right now.' },
          'coursera-account-link',
        ),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="portal-card portal-card--flat" style={{ borderLeft: '4px solid var(--color-green)' }}>
      <div className="portal-card__body" style={{ display: 'grid', gap: '0.875rem' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
          <span className="material-symbols-outlined" style={{ color: 'var(--color-green)', '--ms-fill': 1, fontSize: '1.35rem' } as object}>
            account_circle
          </span>
          <div>
            <h2 className="portal-section-heading" style={{ margin: 0, fontSize: '1rem' }}>Connect your Coursera email</h2>
            <p style={{ margin: '0.25rem 0 0', color: 'var(--color-on-surface-variant)', lineHeight: 1.55, fontSize: '0.9rem' }}>
              Use the same email when you create or sign in to Coursera. If Coursera uses a different email, save it here so your progress still lands in WorkforceAP.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '0.625rem' }}>
          <label style={{ display: 'grid', gap: '0.35rem', fontWeight: 700, fontSize: '0.875rem' }}>
            Coursera account email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder={portalEmail}
              required
              autoComplete="email"
              style={{
                width: '100%',
                minHeight: '46px',
                border: '1px solid var(--outline-variant)',
                borderRadius: '0.75rem',
                padding: '0.7rem 0.85rem',
                background: 'var(--surface-container-lowest)',
                color: 'var(--color-on-surface)',
              }}
            />
          </label>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.625rem', alignItems: 'center' }}>
            <button type="submit" className="btn btn-outline btn-sm" disabled={saving || !normalizedEmail}>
              {saving ? 'Saving…' : savedEmail ? 'Update Coursera email' : 'Save Coursera email'}
            </button>
            <span style={{ color: 'var(--color-on-surface-variant)', fontSize: '0.825rem' }}>
              Portal email: {portalEmail}
            </span>
          </div>
        </form>

        {usingPortalEmail && !hasSavedDifferentEmail ? (
          <p className="coursera-footnote" style={{ margin: 0 }}>
            Best path: sign up for Coursera with your WorkforceAP portal email so matching is automatic.
          </p>
        ) : null}
        {hasSavedDifferentEmail ? (
          <p className="coursera-footnote" style={{ margin: 0 }}>
            Current Coursera match: <strong>{savedEmail}</strong>
          </p>
        ) : null}
        {message ? <p className="coursera-footnote" style={{ color: 'var(--color-green)', margin: 0 }}>{message}</p> : null}
        {error ? <p className="coursera-footnote" style={{ color: 'var(--wa-accent-text)', margin: 0 }}>{error}</p> : null}
      </div>
    </section>
  );
}
