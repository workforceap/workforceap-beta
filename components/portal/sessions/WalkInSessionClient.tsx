'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { UserPlus } from 'lucide-react';
import { PortalInlineSpinner } from '@/components/portal/PortalInlineSpinner';
import { RequiredFieldsHint } from '@/components/portal/forms/RequiredFieldsHint';
import { missingRequiredLabels } from '@/lib/forms/requiredFields';

/**
 * Walk-in session intake form.
 *
 * Counselor sits with a brand new walk-in. Types their basics. Clicks
 * "Create account & start session." On success, redirects to the run page
 * with sessionId in the URL — no full-page reload, the run page picks up
 * a fresh session.
 *
 * Per /plan-ceo-review: this is the "A-to-Z in 30 min" demo flow.
 */
export default function WalkInSessionClient({
  counselorName,
  runRedirectBase = '/counselor/sessions'}: {
  counselorName: string;
  /** Base path for the run-page redirect after account creation. Defaults to counselor; admin passes '/admin/sessions'. */
  runRedirectBase?: string;
}) {
  const router = useRouter();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [targetRole, setTargetRole] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existingMemberId, setExistingMemberId] = useState<string | null>(null);

  const emailLooksValid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());
  const canSubmit = firstName.trim().length > 0 && emailLooksValid && !submitting;
  // Says which required field still blocks the button (audit 2026-09-20).
  const missingRequired = missingRequiredLabels([
    { label: 'First name', ok: firstName.trim().length > 0 },
    { label: email.trim().length > 0 ? 'A valid email' : 'Email', ok: emailLooksValid },
  ]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/counselor/sessions/walk-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim().toLowerCase(),
          phone: phone.trim(),
          targetRole: targetRole.trim()})});
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409 && data.existingMemberId) {
          setExistingMemberId(data.existingMemberId);
        }
        setError(data.error ?? 'Could not create account. Try again.');
        setSubmitting(false);
        return;
      }
      // Redirect to the run page with the fresh sessionId in the URL.
      router.push(`${runRedirectBase}/${data.memberId}/run?sid=${data.sessionId}&fresh=1`);
    } catch (err) {
      console.error('[walk-in] submit failed', err);
      setError('Network error. Check your connection and try again.');
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="portal-card portal-card--flat"
      style={{ padding: 'clamp(1.25rem, 4vw, 2rem)', maxWidth: '720px' }}
    >
      <p style={{ margin: '0 0 1.25rem', color: 'var(--color-on-surface-variant)', lineHeight: 1.55 }}>
        You&rsquo;re running this as <strong>{counselorName}</strong>. Once you submit, the platform creates
        their account, sends them a welcome email with a sign-in link, and opens the session
        run page so you can build their resume, cover letter, and interview prep together.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: '1rem', marginBottom: '1rem' }}>
        <div className="form-group">
          <label htmlFor="walk-in-first-name">
            First name <span style={{ color: 'var(--wa-accent-text)' }}>*</span>
          </label>
          <input
            id="walk-in-first-name"
            type="text"
            autoComplete="given-name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            disabled={submitting}
            required
            placeholder="Jordan"
          />
        </div>
        <div className="form-group">
          <label htmlFor="walk-in-last-name">Last name</label>
          <input
            id="walk-in-last-name"
            type="text"
            autoComplete="family-name"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            disabled={submitting}
            placeholder="Smith"
          />
        </div>
      </div>

      <div className="form-group">
        <label htmlFor="walk-in-email">
          Email <span style={{ color: 'var(--wa-accent-text)' }}>*</span>
        </label>
        <input
          id="walk-in-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={submitting}
          required
          placeholder="jordan@example.com"
        />
        <p style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', margin: '0.25rem 0 0' }}>
          We&rsquo;ll send the welcome email here when you end the session, including the resume + cover letter packet.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: '1rem', marginBottom: '1rem' }}>
        <div className="form-group">
          <label htmlFor="walk-in-phone">Phone</label>
          <input
            id="walk-in-phone"
            type="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={submitting}
            placeholder="(512) 555-0100"
          />
        </div>
        <div className="form-group">
          <label htmlFor="walk-in-target-role">Target role they&rsquo;re going for</label>
          <input
            id="walk-in-target-role"
            type="text"
            value={targetRole}
            onChange={(e) => setTargetRole(e.target.value)}
            disabled={submitting}
            placeholder="IT Support Specialist"
          />
        </div>
      </div>

      {error ? (
        <div role="alert" style={{ background: 'rgba(173,44,77,0.08)', borderLeft: '4px solid var(--color-accent)', padding: '0.75rem 1rem', borderRadius: '0 6px 6px 0', marginBottom: '1rem', color: 'var(--color-on-surface)' }}>
          <p style={{ margin: 0 }}>{error}</p>
          {existingMemberId ? (
            <button
              type="button"
              className="btn btn-primary"
              style={{ marginTop: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
              onClick={() => router.push(`${runRedirectBase}/${existingMemberId}/run`)}
            >
              Start session with existing member
            </button>
          ) : null}
        </div>
      ) : null}

      <RequiredFieldsHint id="walk-in-required" labels={missingRequired} leadIn="Before you can create the account" />
      <button
        type="submit"
        className="btn btn-primary"
        disabled={!canSubmit}
        aria-describedby={missingRequired.length > 0 ? 'walk-in-required' : undefined}
        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
      >
        {submitting ? <PortalInlineSpinner size={18} /> : <UserPlus size={18} aria-hidden />}
        {submitting ? 'Creating account…' : 'Create account & start session'}
      </button>
    </form>
  );
}
