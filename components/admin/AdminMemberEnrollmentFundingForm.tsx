'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export type FundingSource = 'GRANT' | 'EMPLOYER' | 'PARTNER_ORG' | 'SELF' | 'OTHER';

export type EnrollmentFundingInitial = {
  fundingSource: FundingSource | null;
  fundingNotes: string | null;
  workspaceEmail: string | null;
  workspaceEmailProvisioned: boolean;
} | null;

const FUNDING_SOURCE_LABELS: Record<FundingSource, string> = {
  GRANT: 'Government Grant (WIOA)',
  EMPLOYER: 'Employer-Paid',
  PARTNER_ORG: 'Partner Organization Sponsored',
  SELF: 'Self-Pay',
  OTHER: 'Other',
};

export default function AdminMemberEnrollmentFundingForm({
  memberId,
  initial,
  hasPrimaryEnrollment,
}: {
  memberId: string;
  initial: EnrollmentFundingInitial;
  hasPrimaryEnrollment: boolean;
}) {
  const router = useRouter();
  const [fundingSource, setFundingSource] = useState<FundingSource | ''>(
    initial?.fundingSource ?? ''
  );
  const [fundingNotes, setFundingNotes] = useState(initial?.fundingNotes ?? '');
  const [workspaceEmail, setWorkspaceEmail] = useState(initial?.workspaceEmail ?? '');
  const [workspaceEmailProvisioned, setWorkspaceEmailProvisioned] = useState(
    initial?.workspaceEmailProvisioned ?? false
  );
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    try {
      const r = await fetch(`/api/admin/members/${memberId}/enrollment-funding`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fundingSource: fundingSource || null,
          fundingNotes: fundingNotes.trim() || null,
          workspaceEmail: workspaceEmail.trim() || null,
          workspaceEmailProvisioned,
        }),
      });
      const data = (await r.json().catch(() => ({}))) as {
        error?: string;
        enrollmentFundingSaved?: boolean;
        workspaceSaved?: boolean;
      };
      if (!r.ok) {
        setMsg({ type: 'err', text: typeof data.error === 'string' ? data.error : 'Save failed' });
        return;
      }
      setMsg({
        type: 'ok',
        text: data.enrollmentFundingSaved === true
          ? 'Enrollment funding and workspace info saved.'
          : 'Workspace info saved.',
      });
      router.refresh();
    } catch {
      setMsg({ type: 'err', text: 'Network error' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
      {msg && (
        <p
          style={{ fontSize: '0.9rem', color: msg.type === 'ok' ? '#166534' : '#b91c1c' }}
          role={msg.type === 'ok' ? 'status' : 'alert'}
        >
          {msg.text}
        </p>
      )}

      <div>
        <label htmlFor="adminmemberenrollmentfundingform-funding-source-field" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>
          Funding Source
        </label>
        <select id="adminmemberenrollmentfundingform-funding-source-field"
          value={fundingSource}
          onChange={(e) => setFundingSource(e.target.value as FundingSource | '')}
          disabled={!hasPrimaryEnrollment || saving}
          style={{
            width: '100%',
            padding: '0.4rem 0.6rem',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--outline-variant)',
            background: 'var(--wa-surface)',
            color: 'var(--color-on-surface)',
            fontSize: '0.9rem',
          }}
        >
          <option value="">— Not set —</option>
          {(Object.entries(FUNDING_SOURCE_LABELS) as [FundingSource, string][]).map(([val, label]) => (
            <option key={val} value={val}>{label}</option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="adminmemberenrollmentfundingform-funding-notes-field" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>
          Funding Notes
        </label>
        <textarea id="adminmemberenrollmentfundingform-funding-notes-field"
          value={fundingNotes}
          onChange={(e) => setFundingNotes(e.target.value)}
          disabled={!hasPrimaryEnrollment || saving}
          rows={3}
          placeholder="e.g. grant name, employer purchase order, partner org name…"
          style={{
            width: '100%',
            padding: '0.4rem 0.6rem',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--outline-variant)',
            background: 'var(--wa-surface)',
            color: 'var(--color-on-surface)',
            fontSize: '0.9rem',
            resize: 'vertical',
          }}
        />
      </div>

      <div>
        <label htmlFor="adminmemberenrollmentfundingform-workspace-email-field" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>
          Workspace Email
        </label>
        <input id="adminmemberenrollmentfundingform-workspace-email-field"
          type="email"
          value={workspaceEmail}
          onChange={(e) => setWorkspaceEmail(e.target.value)}
          placeholder="member@workforceap.org"
          style={{
            width: '100%',
            padding: '0.4rem 0.6rem',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--outline-variant)',
            background: 'var(--wa-surface)',
            color: 'var(--color-on-surface)',
            fontSize: '0.9rem',
          }}
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <input
          type="checkbox"
          id={`workspace-provisioned-${memberId}`}
          checked={workspaceEmailProvisioned}
          onChange={(e) => setWorkspaceEmailProvisioned(e.target.checked)}
        />
        <label htmlFor={`workspace-provisioned-${memberId}`} style={{ fontSize: '0.9rem' }}>
          Workspace email provisioned
        </label>
      </div>

      <button
        type="submit"
        disabled={saving}
        aria-busy={saving}
        className="btn btn-primary"
        style={{ alignSelf: 'flex-start' }}
      >
        <span aria-live="polite" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          {saving ? (
            <>
              <span className="material-symbols-outlined" style={{ fontSize: '1rem', animation: 'spin 1s linear infinite' }} aria-hidden="true">progress_activity</span>
              Saving…
            </>
          ) : (
            'Save'
          )}
        </span>
      </button>
    </form>
  );
}
