'use client';

import { useId, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Plus, X } from 'lucide-react';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import {
  MEMBER_REQUEST_TIMEOUT_MS,
  describeMemberRequestException,
  readMemberRequestFailure,
} from '@/lib/portal/memberRequestFailure';

// Common certificate suggestions for quick-add
const CERT_SUGGESTIONS = [
  'CompTIA A+',
  'CompTIA Security+',
  'CompTIA Network+',
  'Google IT Support',
  'Google Data Analytics',
  'Google Project Management',
  'PMI Project Management Professional (PMP)',
  'PMI Certified Associate in Project Management (CAPM)',
  'IBM AI Professional Practitioner',
  'AWS Cloud Practitioner',
  'Microsoft Azure Fundamentals',
  'Salesforce Administrator',
  'Coursera Certificate',
  'LinkedIn Learning Certificate',
  'HIPAA Compliance',
  'CPR/First Aid',
  'OSHA 10',
  'Forklift Operator',
  'Other',
];

/** Review state the route reports for the saved row (`UserCertification.status`). */
type SavedStatus = 'pending' | 'approved' | 'rejected' | null;

interface AddResult {
  name: string;
  status: SavedStatus;
  /** Set when the certificate saved but its file did not attach. */
  fileError: string | null;
}

/**
 * What the member is told after a save. WAP-20: POST /api/member/certifications
 * creates a self-reported row as `pending` (staff review in /admin/certifications)
 * and re-adding an existing name only refreshes its date, leaving the review
 * state alone — so the confirmation follows the status the route returns
 * instead of calling every save "added".
 */
export function certificationAddedNotice(name: string, status: SavedStatus): string {
  if (status === 'approved') return `${name} is already on your list and verified.`;
  if (status === 'rejected') {
    return `${name} is already on your list. Staff could not verify it. Message your counselor if you have questions.`;
  }
  return `${name} added. It shows as pending until our staff check it.`;
}

const todayIso = () => new Date().toISOString().split('T')[0];

/**
 * Self-report form for a certificate earned outside WorkforceAP (My Certificates,
 * default kit view and `?ui=legacy`). Kit-native: `--wa-*` tokens, `.wa-kit-*`
 * controls, Lucide icons. Saving refreshes the server-rendered list in place
 * (`router.refresh()`), so the confirmation stays on screen next to the new
 * pending row instead of vanishing into a full page reload.
 */
export default function CertificationAddForm() {
  const router = useRouter();
  const idPrefix = useId();
  const certNameId = `${idPrefix}-certificate-name`;
  const certNameLabelId = `${certNameId}-label`;
  const earnedDateId = `${idPrefix}-date-earned`;
  const certificateFileId = `${idPrefix}-certificate-file`;
  const fileHintId = `${idPrefix}-certificate-file-hint`;
  const [open, setOpen] = useState(false);
  const [certName, setCertName] = useState('');
  const [customName, setCustomName] = useState('');
  const [earnedDate, setEarnedDate] = useState(todayIso);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AddResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const finalName = certName === 'Other' ? customName.trim() : certName.trim();

  const resetForm = () => {
    setCertName('');
    setCustomName('');
    setEarnedDate(todayIso());
    setError(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const openForm = () => {
    setResult(null);
    setOpen(true);
  };

  const closeForm = () => {
    resetForm();
    setOpen(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!finalName) { setError('Please enter a certificate name.'); return; }
    setSaving(true); setError(null);
    try {
      const res = await fetchWithTimeout(
        '/api/member/certifications',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ certName: finalName, earned: true, earnedAt: new Date(earnedDate).toISOString() }),
        },
        MEMBER_REQUEST_TIMEOUT_MS,
      );
      if (!res.ok) { setError(await readMemberRequestFailure(res)); return; }
      const data = (await res.json().catch(() => null)) as { status?: unknown } | null;
      let status: SavedStatus =
        data?.status === 'pending' || data?.status === 'approved' || data?.status === 'rejected' ? data.status : null;

      // Optional file. The certificate is already saved, so a failed upload is
      // reported next to the confirmation rather than as a failed save.
      let fileError: string | null = null;
      const file = fileRef.current?.files?.[0];
      if (file) {
        try {
          const fd = new FormData();
          fd.append('file', file);
          fd.append('certName', finalName);
          const uploadRes = await fetchWithTimeout(
            '/api/member/certifications/upload',
            { method: 'POST', body: fd, credentials: 'include' },
            MEMBER_REQUEST_TIMEOUT_MS,
          );
          if (uploadRes.ok) {
            // A file with the certificate sends it (back) to staff review.
            status = 'pending';
          } else {
            fileError = await readMemberRequestFailure(uploadRes);
          }
        } catch (uploadErr) {
          fileError = describeMemberRequestException(uploadErr);
        }
      }

      setResult({ name: finalName, status, fileError });
      resetForm();
      setOpen(false);
      // Re-render the server list so the new row appears with its review state.
      router.refresh();
    } catch (err) {
      setError(describeMemberRequestException(err));
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <div className="wa-space-y-3">
        {result ? (
          <div
            role="status"
            className="wa-flex wa-items-start wa-gap-2"
            style={{
              padding: '0.75rem 1rem',
              borderRadius: 'var(--wa-radius-sm)',
              background: 'var(--wa-success-soft)',
              color: 'var(--wa-text)',
            }}
          >
            <CheckCircle2 size={18} aria-hidden="true" style={{ color: 'var(--wa-success-dark)', flexShrink: 0, marginTop: 2 }} />
            <div>
              <p style={{ margin: 0, fontWeight: 600, fontSize: 'var(--wa-type-body)' }}>
                {certificationAddedNotice(result.name, result.status)}
              </p>
              {result.fileError ? (
                <p className="wa-kit-meta" style={{ margin: '0.25rem 0 0', color: 'var(--wa-danger-text)', fontWeight: 600 }}>
                  The file was not attached: {result.fileError}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}
        <button
          type="button"
          onClick={openForm}
          className="wa-kit-cta wa-kit-cta--ghost wa-kit-cta--block wa-kit-focus hover:wa-opacity-90 active:wa-scale-[0.98] motion-reduce:active:wa-scale-100 wa-transition-[opacity,transform] wa-duration-150 motion-reduce:wa-transition-none"
        >
          <Plus size={18} aria-hidden="true" />
          {result ? 'Add another certificate' : 'Add a certificate'}
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        padding: 'var(--wa-pad-sm)',
        background: 'var(--wa-surface)',
        border: '1px solid var(--wa-border)',
        borderRadius: 'var(--wa-radius-sm)',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.875rem',
        color: 'var(--wa-text)',
      }}
    >
      <div className="wa-flex wa-items-center wa-justify-between wa-gap-2">
        <h3 style={{ fontWeight: 700, fontSize: 'var(--wa-type-body)', margin: 0 }}>Add a certificate</h3>
        <button
          type="button"
          aria-label="Close"
          onClick={closeForm}
          className="wa-kit-focus"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--wa-muted)',
            minWidth: 44,
            minHeight: 44,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 'var(--wa-radius-sm)',
          }}
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>

      <p className="wa-kit-meta" style={{ margin: 0 }}>
        It shows as pending until our staff check it. It counts as earned only after they verify it.
      </p>

      {error && (
        <p
          role="alert"
          style={{
            fontSize: 'var(--wa-type-meta)',
            fontWeight: 600,
            color: 'var(--wa-danger-text)',
            margin: 0,
            padding: '0.5rem 0.75rem',
            background: 'var(--wa-danger-soft)',
            borderRadius: 'var(--wa-radius-sm)',
          }}
        >
          {error}
        </p>
      )}

      {/* Certificate name */}
      <div>
        <label id={certNameLabelId} htmlFor={certNameId} className="wa-kit-field-label">
          Certificate name
        </label>
        <select id={certNameId}
          value={certName}
          onChange={(e) => setCertName(e.target.value)}
          className="wa-kit-control wa-kit-focus"
          style={{ marginBottom: certName === 'Other' ? '0.5rem' : 0 }}
        >
          <option value="">Select a certificate…</option>
          {CERT_SUGGESTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        {certName === 'Other' && (
          <input
            type="text"
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            aria-labelledby={certNameLabelId}
            placeholder="Type the certificate name…"
            maxLength={200}
            className="wa-kit-control wa-kit-focus"
            style={{ boxSizing: 'border-box' }}
          />
        )}
      </div>

      {/* Date earned */}
      <div>
        <label htmlFor={earnedDateId} className="wa-kit-field-label">
          Date earned
        </label>
        <input id={earnedDateId}
          type="date"
          value={earnedDate}
          max={todayIso()}
          onChange={(e) => setEarnedDate(e.target.value)}
          className="wa-kit-control wa-kit-focus"
          style={{ boxSizing: 'border-box' }}
        />
      </div>

      {/* Optional file upload */}
      <div>
        <label htmlFor={certificateFileId} className="wa-kit-field-label">
          Certificate file <span style={{ fontWeight: 400 }}>(optional · PDF or image)</span>
        </label>
        <input id={certificateFileId}
          ref={fileRef}
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,.webp"
          aria-describedby={fileHintId}
          className="wa-kit-focus"
          style={{ width: '100%', padding: '0.375rem 0', fontSize: 'var(--wa-type-body)', color: 'var(--wa-text)' }}
        />
        <p id={fileHintId} className="wa-kit-meta" style={{ margin: '0.25rem 0 0' }}>
          A copy helps staff check the certificate. You can save it without one.
        </p>
      </div>

      <div className="wa-flex wa-flex-wrap wa-gap-2">
        <button
          type="submit"
          disabled={saving || !finalName}
          className="wa-kit-cta wa-kit-focus"
          style={{ flex: 1, cursor: saving || !finalName ? 'not-allowed' : 'pointer', opacity: saving || !finalName ? 0.7 : 1 }}
          aria-busy={saving}
        >
          <span aria-live="polite">
            {saving ? 'Saving…' : 'Save certificate'}
          </span>
        </button>
        <button type="button" onClick={closeForm} className="wa-kit-cta wa-kit-cta--ghost wa-kit-focus">
          Cancel
        </button>
      </div>
    </form>
  );
}
