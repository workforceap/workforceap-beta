'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { CheckCircle2, ExternalLink } from 'lucide-react';
import { PortalInlineSpinner } from '@/components/portal/PortalInlineSpinner';
import ApplicationAiFeedbackPrompt from '@/components/portal/ApplicationAiFeedbackPrompt';
import type { RecentToolOption } from '@/components/portal/ApplicationAiFeedbackPrompt';
import { FormField } from '@/components/portal/kit';

/**
 * "Log an outside application" CTA + modal form.
 *
 * Per /plan-ceo-review (2026-04-26): closes the placement-tracking gap.
 * Member finds a job on Indeed/LinkedIn, applies there, comes back to
 * WorkforceAP and logs the apply without leaving the Job Board page.
 * Counselor gets notified automatically.
 */
type Source = 'INDEED' | 'LINKEDIN' | 'GLASSDOOR' | 'ZIPRECRUITER' | 'WORKINTEXAS' | 'AUSTINJOBS' | 'DIRECT' | 'OTHER';

const SOURCE_OPTIONS: Array<{ value: Source; label: string }> = [
  { value: 'OTHER', label: 'Somewhere else' },
  { value: 'INDEED', label: 'Indeed' },
  { value: 'LINKEDIN', label: 'LinkedIn' },
  { value: 'GLASSDOOR', label: 'Glassdoor' },
  { value: 'ZIPRECRUITER', label: 'ZipRecruiter' },
  { value: 'WORKINTEXAS', label: 'WorkInTexas' },
  { value: 'AUSTINJOBS', label: 'AustinJobs.com' },
  { value: 'DIRECT', label: 'Company site' },
];

const KIT_BTN =
  'wa-kit-cta wa-kit-focus hover:wa-opacity-90 active:wa-scale-[0.98] motion-reduce:active:wa-scale-100 wa-transition-[opacity,transform] wa-duration-150 motion-reduce:wa-transition-none';

const kitBtnSolid: CSSProperties = {
  gap: 8,
  whiteSpace: 'nowrap',
};

const FIELD_CONTROL: CSSProperties = {
  marginTop: 4,
  width: '100%',
  fontSize: 'var(--wa-type-body)',
  border: '1px solid var(--wa-border)',
  borderRadius: 'var(--wa-radius-sm)',
  padding: '10px 12px',
  outline: 'none',
  background: 'var(--wa-surface)',
  color: 'var(--wa-text)',
  fontFamily: 'inherit',
  minHeight: 44,
};

export default function LogExternalApplicationButton({
  variant = 'secondary',
  preview = false,
}: {
  variant?: 'primary' | 'secondary';
  /** Skip the log POST — /dev/member proofs. */
  preview?: boolean;
} = {}) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedbackAppId, setFeedbackAppId] = useState<string | null>(null);
  const [feedbackTools, setFeedbackTools] = useState<RecentToolOption[]>([]);

  const [company, setCompany] = useState('');
  const [role, setRole] = useState('');
  const [url, setUrl] = useState('');
  const [source, setSource] = useState<Source>('OTHER');
  const [notes, setNotes] = useState('');

  const dialogRef = useRef<HTMLDialogElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (open && !dlg.open) {
      dlg.showModal();
      setTimeout(() => firstFieldRef.current?.focus(), 50);
    } else if (!open && dlg.open) {
      dlg.close();
    }
  }, [open]);

  const reset = () => {
    setCompany('');
    setRole('');
    setUrl('');
    setSource('OTHER');
    setNotes('');
    setSavedAt(null);
    setError(null);
    setFeedbackAppId(null);
    setFeedbackTools([]);
  };

  const close = () => {
    setOpen(false);
    setTimeout(reset, 200);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    if (preview) {
      setSavedAt(new Date());
      setFeedbackAppId(null);
      setFeedbackTools([]);
      setSubmitting(false);
      return;
    }
    try {
      const res = await fetch('/api/member/job-applications/log-external', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company: company.trim(),
          role: role.trim(),
          url: url.trim() || undefined,
          source,
          notes: notes.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Could not log this application. Try again.');
        setSubmitting(false);
        return;
      }
      setSavedAt(data.appliedAt ? new Date(data.appliedAt) : new Date());
      if (data.promptAiFeedback && data.applicationId && Array.isArray(data.recentTools) && data.recentTools.length) {
        setFeedbackAppId(data.applicationId as string);
        setFeedbackTools(data.recentTools as RecentToolOption[]);
      } else {
        setFeedbackAppId(null);
        setFeedbackTools([]);
      }
      setSubmitting(false);
    } catch (err) {
      console.error('[log-external]', err);
      setError('Could not reach the server. Try again.');
      setSubmitting(false);
    }
  };

  const canSubmit = company.trim().length > 0 && role.trim().length > 0 && !submitting;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`${KIT_BTN}${variant === 'primary' ? '' : ' wa-kit-cta--ghost'}`}
        style={kitBtnSolid}
      >
        <ExternalLink size={16} aria-hidden />
        Log an outside application
      </button>

      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        onClick={(e) => {
          if (e.target === dialogRef.current) close();
        }}
        className="wa-log-ext-dialog"
        style={{
          padding: 0,
          border: '1px solid var(--wa-border)',
          borderRadius: 'var(--wa-radius)',
          maxWidth: 520,
          width: '92vw',
          background: 'var(--wa-surface)',
          color: 'var(--wa-text)',
          boxShadow: 'var(--wa-shadow-lg)',
        }}
      >
        <div style={{ padding: 'var(--wa-pad)' }}>
          {savedAt ? (
            <div style={{ textAlign: 'center', padding: '8px 0' }}>
              <CheckCircle2
                size={32}
                style={{ color: 'var(--wa-success)', margin: '0 auto 12px', display: 'block' }}
                aria-hidden
              />
              <h2 style={{ margin: '0 0 8px', fontSize: 17, fontWeight: 800, letterSpacing: '-0.02em' }}>
                {preview ? 'Application log preview complete' : 'Application logged'}
              </h2>
              <p className="wa-kit-lede" style={{ margin: '0 0 20px' }}>
                {preview ? `Sample entry for ${role} at ${company}. Nothing was saved and no counselor was notified.` : <>Noted {role} at {company} on {savedAt.toLocaleDateString()}. Your counselor was notified.</>}
              </p>
              {feedbackAppId && feedbackTools.length > 0 ? (
                <ApplicationAiFeedbackPrompt
                  jobApplicationId={feedbackAppId}
                  recentTools={feedbackTools}
                  onDone={() => {
                    setFeedbackAppId(null);
                    setFeedbackTools([]);
                  }}
                  onSkip={() => {
                    setFeedbackAppId(null);
                    setFeedbackTools([]);
                  }}
                />
              ) : null}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                <button type="button" className={`${KIT_BTN} wa-kit-cta--ghost`} style={kitBtnSolid} onClick={close}>
                  Done
                </button>
                <button type="button" className={KIT_BTN} style={kitBtnSolid} onClick={reset}>
                  Log another
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} noValidate>
              <header style={{ marginBottom: 16 }}>
                <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, letterSpacing: '-0.02em' }}>
                  Log an outside application
                </h2>
                <p className="wa-kit-lede" style={{ margin: '6px 0 0' }}>
                  Applied on Indeed, LinkedIn, or a company site? Add it to your tracker so your counselor can follow up.
                </p>
              </header>

              <div style={{ display: 'grid', gap: 12, marginBottom: 12 }}>
                <FormField
                  id="log-ext-company"
                  label="Company"
                  ref={firstFieldRef}
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder="Acme Corp"
                  required
                  disabled={submitting}
                />
                <FormField
                  id="log-ext-role"
                  label="Role"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  placeholder="IT Support Specialist"
                  required
                  disabled={submitting}
                />
              </div>

              <div className="wa-grid wa-grid-cols-1 sm:wa-grid-cols-2" style={{ gap: 12, marginBottom: 12 }}>
                <FormField label="Where">
                  <select
                    id="log-ext-source"
                    value={source}
                    onChange={(e) => setSource(e.target.value as Source)}
                    disabled={submitting}
                    style={FIELD_CONTROL}
                  >
                    {SOURCE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </FormField>
                <FormField
                  id="log-ext-url"
                  label="Job URL (optional)"
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://"
                  disabled={submitting}
                />
              </div>

              <FormField label="Notes (optional)">
                <textarea
                  id="log-ext-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Recruiter, salary range, anything your counselor should know."
                  disabled={submitting}
                  style={{ ...FIELD_CONTROL, resize: 'vertical' }}
                />
              </FormField>

              {error ? (
                <div
                  role="alert"
                  style={{
                    background: 'var(--wa-danger-soft)',
                    color: 'var(--wa-danger)',
                    padding: '12px 14px',
                    borderRadius: 'var(--wa-radius-sm)',
                    margin: '12px 0 0',
                    fontSize: 'var(--wa-type-body)',
                  }}
                >
                  {error}
                </div>
              ) : null}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
                <button type="button" className={`${KIT_BTN} wa-kit-cta--ghost`} style={kitBtnSolid} onClick={close} disabled={submitting}>
                  Cancel
                </button>
                <button type="submit" className={KIT_BTN} style={kitBtnSolid} disabled={!canSubmit}>
                  {submitting ? <PortalInlineSpinner size={16} /> : null}
                  {submitting ? 'Logging…' : 'Log application'}
                </button>
              </div>
            </form>
          )}
        </div>
      </dialog>
      <style>{`
        .wa-log-ext-dialog::backdrop {
          background: color-mix(in srgb, var(--wa-text) 48%, transparent);
        }
      `}</style>
    </>
  );
}
