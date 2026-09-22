'use client';

import { useState } from 'react';

export type GuardianConsentPrefill = {
  studentFirstName: string;
  guardianName: string;
  guardianEmail: string;
  guardianPhone: string;
};

const fieldGroup: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '0.35rem' };
const labelStyle: React.CSSProperties = { fontWeight: 600, fontSize: '0.9rem' };
const inputStyle: React.CSSProperties = {
  padding: '0.6rem 0.7rem',
  borderRadius: '0.45rem',
  border: '1px solid var(--color-outline, #cbcbcb)',
  fontSize: '1rem',
};

export default function GuardianConsentForm({
  token,
  prefill,
}: {
  token: string;
  prefill: GuardianConsentPrefill;
}) {
  const [guardianName, setGuardianName] = useState(prefill.guardianName);
  const [guardianEmail, setGuardianEmail] = useState(prefill.guardianEmail);
  const [guardianPhone, setGuardianPhone] = useState(prefill.guardianPhone);
  const [attested, setAttested] = useState(false);
  const [status, setStatus] = useState<'idle' | 'submitting' | 'done' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const canSubmit =
    guardianName.trim().length > 0 &&
    guardianEmail.trim().includes('@') &&
    attested &&
    status !== 'submitting';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setStatus('submitting');
    setErrorMsg('');
    try {
      const res = await fetch(`/api/consent/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guardianName: guardianName.trim(),
          guardianEmail: guardianEmail.trim(),
          guardianPhone: guardianPhone.trim() || null,
          attested: true,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setStatus('error');
        setErrorMsg(data.error ?? 'We could not record this consent. Please try again or contact the school.');
        return;
      }
      setStatus('done');
    } catch {
      setStatus('error');
      setErrorMsg('We could not reach the server. Please try again.');
    }
  }

  if (status === 'done') {
    return (
      <div
        role="status"
        style={{
          border: '1px solid var(--color-outline, #e2e2e2)',
          borderRadius: '0.75rem',
          padding: '1.5rem',
          background: 'var(--surface-container-lowest)',
        }}
      >
        <h2 style={{ fontSize: '1.2rem', margin: '0 0 0.5rem' }}>Consent recorded</h2>
        <p style={{ margin: 0, lineHeight: 1.6, color: 'var(--color-on-surface-variant, #555)' }}>
          Thank you. WorkforceAP can now activate {prefill.studentFirstName || 'this student'}&apos;s
          training seat. You do not need to do anything else with this link.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={(e) => void submit(e)} style={{ display: 'grid', gap: '1rem' }}>
      <div style={fieldGroup}>
        <label htmlFor="guardian-name" style={labelStyle}>
          Parent / guardian name
        </label>
        <input
          id="guardian-name"
          name="guardianName"
          autoComplete="name"
          value={guardianName}
          onChange={(e) => setGuardianName(e.target.value)}
          required
          style={inputStyle}
        />
      </div>
      <div style={fieldGroup}>
        <label htmlFor="guardian-email" style={labelStyle}>
          Parent / guardian email
        </label>
        <input
          id="guardian-email"
          name="guardianEmail"
          type="email"
          autoComplete="email"
          value={guardianEmail}
          onChange={(e) => setGuardianEmail(e.target.value)}
          required
          style={inputStyle}
        />
      </div>
      <div style={fieldGroup}>
        <label htmlFor="guardian-phone" style={labelStyle}>
          Parent / guardian phone <span style={{ fontWeight: 400 }}>(optional)</span>
        </label>
        <input
          id="guardian-phone"
          name="guardianPhone"
          type="tel"
          autoComplete="tel"
          value={guardianPhone}
          onChange={(e) => setGuardianPhone(e.target.value)}
          style={inputStyle}
        />
      </div>
      <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem', lineHeight: 1.5 }}>
        <input
          type="checkbox"
          checked={attested}
          onChange={(e) => setAttested(e.target.checked)}
          required
          style={{ marginTop: 4 }}
        />
        <span>
          I am the parent or legal guardian of {prefill.studentFirstName || 'this student'}, and I
          consent to their participation in WorkforceAP career training. I understand this consent
          is required before a training seat is activated.
        </span>
      </label>
      {errorMsg ? (
        <p role="alert" style={{ margin: 0, color: 'var(--color-error, #c83232)' }}>
          {errorMsg}
        </p>
      ) : null}
      <button
        type="submit"
        className="btn btn-primary"
        disabled={!canSubmit}
        style={{ justifySelf: 'start' }}
      >
        {status === 'submitting' ? 'Recording…' : 'Record consent'}
      </button>
    </form>
  );
}
