'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export type PlacedOutcomeInitial = {
  employerName: string;
  jobTitle: string;
  startingSalary: number | null;
  placedAt: string;
  programSlug: string | null;
  notes: string | null;
  // WIOA fields
  wageAtFollowUp: number | null;
  retentionStatus: string | null;
  startDateVerified: boolean;
  fundingSource: string | null;
  grantReportingNotes: string | null;
  retentionDecision: string | null;
} | null;

const RETENTION_OPTIONS = [
  { value: '', label: 'Not set' },
  { value: 'retained_90d', label: 'Retained at 90 days' },
  { value: 'retained_180d', label: 'Retained at 180 days' },
  { value: 'separated', label: 'Separated' },
];

// Counselor-recorded outcome for the funder-payable 90/180-day milestone.
// Distinct from RETENTION_OPTIONS (a free-text-ish grant-reporting label) —
// this is the canonical decision that drives the retention queue in
// app/admin/placements/retention.
const RETENTION_DECISION_OPTIONS = [
  { value: '', label: 'Not decided' },
  { value: 'pending', label: 'Pending — awaiting more info' },
  { value: 'retained', label: 'Retained' },
  { value: 'not_retained', label: 'Not retained' },
];

const FUNDING_OPTIONS = [
  { value: '', label: 'Not set' },
  { value: 'WIOA_Adult', label: 'WIOA Adult' },
  { value: 'WIOA_Youth', label: 'WIOA Youth' },
  { value: 'WIOA_DW', label: 'WIOA Dislocated Worker' },
  { value: 'TAA', label: 'TAA' },
  { value: 'other', label: 'Other' },
];

export default function AdminMemberPlacedOutcomeForm({
  memberId,
  initial,
  pastOnboardingWindow = false,
}: {
  memberId: string;
  initial: PlacedOutcomeInitial;
  /**
   * When true, the placement is already past its onboarding window end
   * (i.e. a 90/180-day retention decision is due or overdue) — the WIOA
   * accordion starts expanded instead of collapsed so counselors don't
   * miss the decision behind a click.
   */
  pastOnboardingWindow?: boolean;
}) {
  const router = useRouter();

  // Core fields
  const [employerName, setEmployerName] = useState(initial?.employerName ?? '');
  const [jobTitle, setJobTitle] = useState(initial?.jobTitle ?? '');
  const [startingSalary, setStartingSalary] = useState(
    initial?.startingSalary != null ? String(initial.startingSalary) : ''
  );
  const [placedAt, setPlacedAt] = useState(
    initial?.placedAt ? initial.placedAt.slice(0, 10) : new Date().toISOString().slice(0, 10)
  );
  const [programSlug, setProgramSlug] = useState(initial?.programSlug ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');

  // WIOA / grant-reporting fields
  const [wageAtFollowUp, setWageAtFollowUp] = useState(
    initial?.wageAtFollowUp != null ? String(initial.wageAtFollowUp) : ''
  );
  const [retentionStatus, setRetentionStatus] = useState(initial?.retentionStatus ?? '');
  const [startDateVerified, setStartDateVerified] = useState(initial?.startDateVerified ?? false);
  const [fundingSource, setFundingSource] = useState(initial?.fundingSource ?? '');
  const [grantReportingNotes, setGrantReportingNotes] = useState(initial?.grantReportingNotes ?? '');
  const [retentionDecision, setRetentionDecision] = useState(initial?.retentionDecision ?? '');

  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);

    const salaryRaw = startingSalary.trim();
    const startingSalaryNum =
      salaryRaw === '' ? null : Number.parseInt(salaryRaw.replace(/,/g, ''), 10);
    if (salaryRaw !== '' && (Number.isNaN(startingSalaryNum) || startingSalaryNum! < 0)) {
      setMsg({ type: 'err', text: 'Starting salary must be a whole number (annual USD) or empty.' });
      setSaving(false);
      return;
    }

    const followUpRaw = wageAtFollowUp.trim();
    const wageAtFollowUpNum =
      followUpRaw === '' ? null : Number.parseInt(followUpRaw.replace(/,/g, ''), 10);
    if (followUpRaw !== '' && (Number.isNaN(wageAtFollowUpNum) || wageAtFollowUpNum! < 0)) {
      setMsg({ type: 'err', text: 'Follow-up wage must be a whole number (annual USD) or empty.' });
      setSaving(false);
      return;
    }

    const placedIso = new Date(placedAt + 'T12:00:00.000Z').toISOString();
    try {
      const r = await fetch(`/api/admin/members/${memberId}/placed-outcome`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employerName: employerName.trim(),
          jobTitle: jobTitle.trim(),
          startingSalary: startingSalaryNum,
          placedAt: placedIso,
          programSlug: programSlug.trim() || null,
          notes: notes.trim() || null,
          wageAtFollowUp: wageAtFollowUpNum,
          retentionStatus: retentionStatus || null,
          startDateVerified,
          fundingSource: fundingSource || null,
          grantReportingNotes: grantReportingNotes.trim() || null,
          retentionDecision: retentionDecision || null,
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setMsg({ type: 'err', text: typeof data.error === 'string' ? data.error : 'Save failed' });
        return;
      }
      setMsg({ type: 'ok', text: 'Placement saved.' });
      router.refresh();
    } catch {
      setMsg({ type: 'err', text: 'Network error' });
    } finally {
      setSaving(false);
    }
  }

  const inputStyle = { fontSize: '0.875rem' } as const;

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
      {msg ? (
        <p style={{ fontSize: '0.9rem', color: msg.type === 'ok' ? '#166534' : '#b91c1c' }} role="status">
          {msg.text}
        </p>
      ) : null}

      {/* Core placement fields */}
      <div className="form-group" style={{ marginBottom: 0 }}>
        <label htmlFor="po-employer">Employer name *</label>
        <input id="po-employer" className="form-control" style={inputStyle} value={employerName} onChange={(e) => setEmployerName(e.target.value)} required maxLength={300} disabled={saving} />
      </div>
      <div className="form-group" style={{ marginBottom: 0 }}>
        <label htmlFor="po-title">Job title *</label>
        <input id="po-title" className="form-control" style={inputStyle} value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} required maxLength={300} disabled={saving} />
      </div>
      <div className="form-group" style={{ marginBottom: 0 }}>
        <label htmlFor="po-salary">Wage at placement (annual USD, optional)</label>
        <input id="po-salary" className="form-control" style={inputStyle} type="text" inputMode="numeric" value={startingSalary} onChange={(e) => setStartingSalary(e.target.value)} placeholder="e.g. 55000" disabled={saving} />
      </div>
      <div className="form-group" style={{ marginBottom: 0 }}>
        <label htmlFor="po-date">Placement date *</label>
        <input id="po-date" className="form-control" style={inputStyle} type="date" value={placedAt} onChange={(e) => setPlacedAt(e.target.value)} required disabled={saving} />
      </div>
      <div className="form-group" style={{ marginBottom: 0 }}>
        <label htmlFor="po-program">Program slug (optional)</label>
        <input id="po-program" className="form-control" style={inputStyle} value={programSlug} onChange={(e) => setProgramSlug(e.target.value)} maxLength={120} disabled={saving} placeholder="e.g. google-it-support" />
      </div>
      <div className="form-group" style={{ marginBottom: 0 }}>
        <label htmlFor="po-notes">Notes (optional)</label>
        <textarea id="po-notes" className="form-control" style={inputStyle} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={8000} disabled={saving} />
      </div>

      {/* WIOA / grant-reporting fields — collapsible; auto-expanded once a
          retention decision is due (past onboardingWindowEnd) so it isn't
          missed behind a click. */}
      <details open={pastOnboardingWindow} style={{ marginTop: '0.5rem', borderTop: '1px solid var(--outline-variant)', paddingTop: '0.75rem' }}>
        <summary style={{ cursor: 'pointer', fontSize: '0.8125rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-on-surface-variant)', marginBottom: '0.75rem' }}>
          Grant reporting (WIOA){pastOnboardingWindow ? ' — retention decision due' : ''}
        </summary>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label htmlFor="po-followup-wage">Wage at follow-up (annual USD, optional)</label>
            <input id="po-followup-wage" className="form-control" style={inputStyle} type="text" inputMode="numeric" value={wageAtFollowUp} onChange={(e) => setWageAtFollowUp(e.target.value)} placeholder="90 or 180-day follow-up wage" disabled={saving} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label htmlFor="po-retention">Retention status</label>
            <select id="po-retention" className="form-control" style={inputStyle} value={retentionStatus} onChange={(e) => setRetentionStatus(e.target.value)} disabled={saving}>
              {RETENTION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label htmlFor="po-retention-decision">Retention decision (90/180-day funder milestone)</label>
            <select id="po-retention-decision" className="form-control" style={inputStyle} value={retentionDecision} onChange={(e) => setRetentionDecision(e.target.value)} disabled={saving}>
              {RETENTION_DECISION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label htmlFor="po-funding">Funding source</label>
            <select id="po-funding" className="form-control" style={inputStyle} value={fundingSource} onChange={(e) => setFundingSource(e.target.value)} disabled={saving}>
              {FUNDING_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input type="checkbox" checked={startDateVerified} onChange={(e) => setStartDateVerified(e.target.checked)} disabled={saving} style={{ width: 18, height: 18, accentColor: 'var(--color-accent)' }} />
              <span style={{ fontSize: '0.875rem' }}>Start date verified</span>
            </label>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label htmlFor="po-grant-notes">Grant reporting notes (optional)</label>
            <textarea id="po-grant-notes" className="form-control" style={inputStyle} rows={2} value={grantReportingNotes} onChange={(e) => setGrantReportingNotes(e.target.value)} maxLength={8000} disabled={saving} placeholder="Compliance notes, follow-up dates, etc." />
          </div>
        </div>
      </details>

      <button type="submit" className="btn btn-primary btn-sm" disabled={saving} aria-busy={saving} style={{ marginTop: '0.5rem' }}>
        <span aria-live="polite" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          {saving ? (
            <>
              <span className="material-symbols-outlined" style={{ fontSize: '1rem', animation: 'spin 1s linear infinite' }} aria-hidden="true">progress_activity</span>
              Saving…
            </>
          ) : initial ? (
            'Update placement record'
          ) : (
            'Save placement'
          )}
        </span>
      </button>
    </form>
  );
}
