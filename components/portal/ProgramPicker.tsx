'use client';

import { useMemo, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import LocalizedLink from '@/components/LocalizedLink';
import type { Program } from '@/lib/content/programs';
import { ProgramIcon } from '@/components/ProgramIcon';

type WioaErrorCode = 'WIOA_NOT_STARTED' | 'WIOA_PENDING' | 'WIOA_NOT_ELIGIBLE';

type EnrollError =
  | { type: 'wioa'; code: WioaErrorCode; message: string }
  | { type: 'generic'; message: string };

type ProgramPickerProps = {
  programs: Program[];
  /** When available cheaply from the parent page, shown on the WIOA_PENDING notice. Optional — no extra fetch is done here. */
  wioaScreeningSubmittedAt?: Date | string | null;
  /** Proofs: select/confirm stay local — no POST to `/api/member/enroll`. */
  preview?: boolean;
};

const kitPrimaryBtn: CSSProperties = {
  minHeight: 44,
  padding: '10px 16px',
  background: 'var(--wa-accent)',
  color: 'var(--wa-on-accent-control)',
  fontWeight: 600,
  fontSize: 14,
  borderRadius: 999,
  border: 'none',
  cursor: 'pointer',
};

const kitGhostBtn: CSSProperties = {
  minHeight: 44,
  padding: '10px 16px',
  background: 'transparent',
  color: 'var(--wa-accent)',
  fontWeight: 600,
  fontSize: 14,
  borderRadius: 999,
  border: '1px solid var(--wa-border)',
  cursor: 'pointer',
};

const CURRICULUM_ACTIVATION_NOTICE =
  'Applications are open, but fresh training assignment is paused while the updated Coursera curriculum is activated.';

function formatSubmittedDate(value: Date | string): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function WioaErrorMessage({
  error,
  wioaScreeningSubmittedAt,
}: {
  error: EnrollError;
  wioaScreeningSubmittedAt?: Date | string | null;
}) {
  if (error.type === 'generic') {
    return (
      <p role="alert" style={{ marginTop: 12, color: 'var(--wa-danger)', fontSize: 14, fontWeight: 600 }}>
        {error.message}
      </p>
    );
  }

  const isBlocked = error.code === 'WIOA_NOT_ELIGIBLE';
  const submittedLabel = wioaScreeningSubmittedAt ? formatSubmittedDate(wioaScreeningSubmittedAt) : '';

  return (
    <div
      role="alert"
      style={{
        marginTop: 12,
        padding: 12,
        borderRadius: 'var(--wa-radius-sm)',
        background: isBlocked ? 'var(--wa-danger-soft)' : 'var(--wa-info-soft)',
        border: isBlocked
          ? '1px solid color-mix(in srgb, var(--wa-danger) 28%, transparent)'
          : '1px solid color-mix(in srgb, var(--wa-info) 28%, transparent)',
        color: isBlocked ? 'var(--wa-danger)' : 'var(--wa-info)',
      }}
    >
      <p
        style={{
          margin: 0,
          fontWeight: 600,
          color: isBlocked ? 'var(--wa-danger)' : 'var(--wa-info)',
          marginBottom: 8,
          fontSize: 14,
        }}
      >
        {error.message}
      </p>
      {error.code === 'WIOA_PENDING' ? (
        <>
          <p style={{ margin: '0 0 8px', fontSize: 14, lineHeight: 1.5, color: 'var(--wa-text)' }}>
            {submittedLabel ? `Submitted ${submittedLabel}. ` : ''}Your counselor will review this screening. There is no set wait time — message them if you have questions.
          </p>
          <Link
            href="/dashboard/messages"
            className="wa-kit-focus"
            style={{ color: 'var(--wa-info)', fontWeight: 700, textDecoration: 'none', fontSize: 14 }}
          >
            Message your counselor →
          </Link>
        </>
      ) : null}
      {error.code === 'WIOA_NOT_STARTED' ? (
        <Link
          href="/dashboard/learning/wioa-qualification"
          className="wa-kit-focus"
          style={{ color: 'var(--wa-info)', fontWeight: 700, textDecoration: 'none', fontSize: 14 }}
        >
          Start WIOA screening →
        </Link>
      ) : null}
      {error.code === 'WIOA_NOT_ELIGIBLE' ? (
        <Link
          href="/contact"
          className="wa-kit-focus"
          style={{ color: 'var(--wa-accent)', fontWeight: 700, textDecoration: 'none', fontSize: 14 }}
        >
          Contact WorkforceAP →
        </Link>
      ) : null}
    </div>
  );
}

export default function ProgramPicker({ programs, wioaScreeningSubmittedAt, preview = false }: ProgramPickerProps) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [enrollError, setEnrollError] = useState<EnrollError | null>(null);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [previewDone, setPreviewDone] = useState(false);

  const selectedProgram = useMemo(
    () => programs.find((program) => program.slug === selectedSlug) ?? null,
    [programs, selectedSlug]
  );

  const handleConfirm = async () => {
    if (!selectedProgram) return;
    setEnrollError(null);
    if (selectedProgram.curriculumMigrationPending) {
      setEnrollError({ type: 'generic', message: CURRICULUM_ACTIVATION_NOTICE });
      return;
    }
    if (preview) {
      setPreviewDone(true);
      return;
    }
    setLoading(selectedProgram.slug);
    try {
      const res = await fetch('/api/member/enroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ programSlug: selectedProgram.slug }),
      });
      const data = await res.json();
      if (!res.ok) {
        const wioaCodes: WioaErrorCode[] = ['WIOA_NOT_STARTED', 'WIOA_PENDING', 'WIOA_NOT_ELIGIBLE'];
        if (wioaCodes.includes(data.code)) {
          setEnrollError({ type: 'wioa', code: data.code as WioaErrorCode, message: data.error ?? '' });
        } else {
          setEnrollError({ type: 'generic', message: data.error ?? 'Failed to enroll' });
        }
        setLoading(null);
        return;
      }
      router.push('/dashboard');
      router.refresh();
    } catch {
      setEnrollError({ type: 'generic', message: 'Failed to enroll. Please try again.' });
      setLoading(null);
    }
  };

  return (
    <div>
      {selectedProgram && (
        <div className="wa-kit-card" style={{ marginBottom: 16 }}>
          {previewDone ? (
            <p role="status" aria-live="polite" style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--wa-text)' }}>
              Preview only — enrollment stays on the live program page.
            </p>
          ) : (
            <>
              <p style={{ margin: '0 0 6px', fontWeight: 800, fontSize: 15, letterSpacing: '-0.02em' }}>Review your selection</p>
              <p style={{ margin: '0 0 6px', fontSize: 14 }}>
                <strong>{selectedProgram.title}</strong> · {selectedProgram.duration}
              </p>
              <p style={{ margin: '0 0 12px', color: 'var(--wa-muted)', fontSize: 14, lineHeight: 1.5 }}>
                Funding is tied to one program. After you confirm, changes require WorkforceAP admin help.
              </p>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="wa-kit-focus hover:wa-opacity-90"
                  onClick={() => void handleConfirm()}
                  disabled={!!loading}
                  aria-busy={loading === selectedProgram.slug}
                  style={kitPrimaryBtn}
                >
                  <span aria-live="polite">
                    {loading === selectedProgram.slug ? 'Confirming…' : 'Confirm program'}
                  </span>
                </button>
                <button
                  type="button"
                  className="wa-kit-focus hover:wa-opacity-90"
                  onClick={() => {
                    setSelectedSlug(null);
                    setEnrollError(null);
                    setPreviewDone(false);
                  }}
                  disabled={!!loading}
                  style={kitGhostBtn}
                >
                  Keep comparing
                </button>
              </div>
              {enrollError ? (
                <WioaErrorMessage error={enrollError} wioaScreeningSubmittedAt={wioaScreeningSubmittedAt} />
              ) : null}
            </>
          )}
        </div>
      )}

      <p>
        <LocalizedLink href="/salary-guide" className="wa-kit-focus">Research career pay</LocalizedLink>
      </p>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 16,
        }}
      >
        {programs.map((p) => {
          const isSelected = selectedSlug === p.slug;
          const assignmentPaused = p.curriculumMigrationPending === true;
          const activationNoticeId = `program-${p.slug}-activation-notice`;
          return (
            <div
              key={p.slug}
              className="wa-kit-card"
              style={{
                outline: isSelected ? '2px solid var(--wa-accent)' : undefined,
                outlineOffset: isSelected ? -2 : undefined,
                borderTop: `3px solid ${p.borderColor}`,
              }}
            >
              <div className="wa-flex wa-items-start wa-justify-between" style={{ marginBottom: 8, gap: 8 }}>
                <span
                  style={{
                    background: p.categoryColor,
                    color: 'var(--wa-on-accent)',
                    padding: '4px 10px',
                    borderRadius: 999,
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  {p.categoryLabel}
                </span>
                <span style={{ display: 'flex', alignItems: 'center' }}>
                  <ProgramIcon program={p} size={24} />
                </span>
              </div>
              <h3 style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 8px' }}>{p.title}</h3>
              <div style={{ fontSize: 13, color: 'var(--wa-muted)', marginBottom: 12, lineHeight: 1.45 }}>
                <div className="wa-flex wa-items-center" style={{ gap: 6 }}>
                  <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 16 }}>
                    schedule
                  </span>
                  {p.duration}
                </div>
                {p.externalCourseUrl ? (
                  <a
                    href={p.externalCourseUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="wa-kit-focus"
                    style={{ display: 'inline-block', marginTop: 8, fontWeight: 700, color: 'var(--wa-accent)' }}
                  >
                    Open the free course directly →
                  </a>
                ) : null}
              </div>
              {assignmentPaused ? (
                <p
                  id={activationNoticeId}
                  role="status"
                  style={{
                    margin: '0 0 12px',
                    padding: '8px 10px',
                    borderRadius: 'var(--wa-radius-sm)',
                    background: 'var(--wa-info-soft)',
                    color: 'var(--wa-info-dark)',
                    fontSize: 13,
                    fontWeight: 600,
                    lineHeight: 1.45,
                  }}
                >
                  Training activation pending. Applications remain open.
                </p>
              ) : null}
              <button
                type="button"
                className="wa-kit-focus hover:wa-opacity-90"
                style={{
                  ...kitPrimaryBtn,
                  width: '100%',
                  cursor: assignmentPaused ? 'not-allowed' : kitPrimaryBtn.cursor,
                  opacity: assignmentPaused ? 0.65 : 1,
                }}
                onClick={() => {
                  if (assignmentPaused) return;
                  setSelectedSlug(p.slug);
                  setPreviewDone(false);
                  setEnrollError(null);
                }}
                disabled={!!loading || assignmentPaused}
                aria-busy={loading === p.slug}
                aria-describedby={assignmentPaused ? activationNoticeId : undefined}
              >
                <span aria-live="polite">
                  {assignmentPaused
                    ? 'Training activation pending'
                    : isSelected
                      ? 'Ready to confirm above'
                      : 'Review selection'}
                </span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
