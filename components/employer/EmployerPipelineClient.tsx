'use client';

import { useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { requestFailureMessage } from '@/lib/http/requestFailureCopy';
import { matchScoreAsPercent } from '@/lib/employer/matchScoreDisplay';
import { employerAiMatchStatusBadgeVariant, employerMatchPipelineLabel } from '@/lib/employer/aiMatchPipelineLabels';
import { Avatar, DesignSurface, StatusTag, type KitTone } from '@/components/portal/kit';

type MatchRow = {
  id: string;
  matchScore: number;
  matchReasons: string[];
  status: string;
  student: { id: string; fullName: string; email: string; enrolledProgram: string | null };
};

/** Bridges the shared BadgeVariant vocabulary (employerAiMatchStatusBadgeVariant) to a KitTone. */
const BADGE_VARIANT_TONE: Record<string, KitTone> = {
  success: 'ok',
  warning: 'warn',
  error: 'alert',
  info: 'info',
  neutral: 'muted',
  accent: 'muted',
};

function statusTone(status: string): KitTone {
  return BADGE_VARIANT_TONE[employerAiMatchStatusBadgeVariant(status)] ?? 'muted';
}

function scoreColor(score: number): string {
  if (score >= 80) return 'var(--wa-success)';
  if (score >= 60) return 'var(--wa-gold)';
  return 'var(--wa-muted)';
}

const UPDATE_FAILED = 'Could not update this match. Please try again.';

function getInitials(name: string): string {
  const parts = (name || '?').split(' ').filter(Boolean);
  return parts.map((n) => n[0]).slice(0, 2).join('').toUpperCase() || '?';
}

export default function EmployerPipelineClient({
  jobId,
  jobTitle,
  initialMatches,
}: {
  jobId: string;
  jobTitle: string;
  initialMatches: MatchRow[];
}) {
  const tCommon = useTranslations('common');
  const [matches, setMatches] = useState(initialMatches);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setStatus = useCallback(
    async (studentId: string, status: string) => {
      setBusy(studentId);
      setError(null);
      try {
        const r = await fetch(`/api/employer/jobs/${jobId}/matches/${studentId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status }),
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) {
          // The select already snapped back to the server value on re-render;
          // say why so the change does not look like it silently took.
          setError(typeof data.error === 'string' && data.error.trim() ? data.error : UPDATE_FAILED);
          return;
        }
        setMatches((prev) =>
          prev.map((m) => (m.student.id === studentId ? { ...m, status: data.status ?? status } : m))
        );
      } catch (err) {
        setError(
          requestFailureMessage(err, { connection: tCommon('connectionError'), fallback: UPDATE_FAILED }, 'employer-pipeline-status'),
        );
      } finally {
        setBusy(null);
      }
    },
    [jobId, tCommon]
  );

  if (matches.length === 0) {
    return (
      <p style={{ color: 'var(--wa-muted)' }}>
        No AI-suggested matches for <strong>{jobTitle}</strong> yet. Matches appear after admin review runs.
      </p>
    );
  }

  return (
    <DesignSurface surface="dense" className="wa-kit-card">
      <h3 style={{ fontWeight: 800, fontSize: 15, letterSpacing: '-0.01em', margin: '0 0 12px' }}>{jobTitle}</h3>
      {error ? (
        <p role="alert" style={{ fontSize: 13, fontWeight: 700, color: 'var(--wa-danger)', margin: '0 0 12px' }}>
          {error}
        </p>
      ) : null}
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {matches.map((m) => {
          const score = matchScoreAsPercent(m.matchScore);
          return (
            <li
              key={m.id}
              className="wa-flex wa-flex-wrap wa-items-center wa-justify-between wa-gap-3"
              style={{ padding: 12, borderRadius: 'var(--wa-radius-sm)', border: '1px solid var(--wa-border)', background: 'var(--wa-bg)' }}
            >
              <div className="wa-flex wa-items-center wa-gap-3" style={{ minWidth: 0 }}>
                <Avatar initials={getInitials(m.student.fullName)} size={32} />
                <div style={{ minWidth: 0 }}>
                  <strong style={{ fontSize: 13, color: 'var(--wa-text)' }}>{m.student.fullName}</strong>
                  <div style={{ fontSize: 13, color: 'var(--wa-muted)' }}>{m.student.email}</div>
                  <div className="wa-flex wa-items-center wa-gap-1" style={{ fontSize: 13, marginTop: 3 }}>
                    <span style={{ fontWeight: 800, color: scoreColor(score), fontVariantNumeric: 'tabular-nums' }}>{score}%</span>
                    {m.matchReasons?.length ? (
                      <span style={{ color: 'var(--wa-muted)' }}> · {m.matchReasons.slice(0, 2).join(' · ')}</span>
                    ) : null}
                  </div>
                </div>
              </div>
              <div className="wa-flex wa-items-center wa-gap-2" style={{ flexShrink: 0 }}>
                <StatusTag tone={statusTone(m.status)}>{employerMatchPipelineLabel(m.status)}</StatusTag>
                <select
                  value={m.status}
                  disabled={busy === m.student.id}
                  onChange={(e) => void setStatus(m.student.id, e.target.value)}
                  aria-label={`Match status for ${m.student.fullName}`}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 'var(--wa-radius-sm)',
                    border: '1px solid var(--wa-border)',
                    background: 'var(--wa-surface)',
                    color: 'var(--wa-text)',
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  <option value="suggested">Suggested</option>
                  <option value="employer_notified">Employer notified</option>
                  <option value="student_notified">Student notified</option>
                  <option value="rejected">Not a fit</option>
                </select>
              </div>
            </li>
          );
        })}
      </ul>
    </DesignSurface>
  );
}
