'use client';

import { useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { Sparkles, Mail, Video, CheckCircle2, Ban, GripVertical, Briefcase } from 'lucide-react';
import { matchScoreAsPercent } from '@/lib/employer/matchScoreDisplay';
import { Avatar, DesignSurface, colorVar, type KitColor } from '@/components/portal/kit';
import EmployerEmptyState from '@/components/employer/EmployerEmptyState';

/**
 * Employer candidate pipeline (Kanban) — Command Center visual language.
 * Reskin only: drag/drop wiring, the optimistic-update + revert-on-error
 * flow, and every API call below are unchanged from the legacy version —
 * only the column/card chrome now uses kit tokens instead of ad hoc CSS vars.
 */

type MatchRow = {
  id: string;
  jobId: string;
  jobTitle: string;
  matchScore: number;
  matchReasons: string[];
  status: string;
  student: { id: string; fullName: string; email: string; enrolledProgram: string | null };
};

const COLUMNS: { id: string; label: string; statuses: string[]; color: KitColor; icon: typeof Sparkles }[] = [
  { id: 'new', label: 'New Matches', statuses: ['suggested', 'employer_notified', 'student_notified'], color: 'info', icon: Sparkles },
  { id: 'contacted', label: 'Contacted', statuses: ['contacted'], color: 'gold', icon: Mail },
  { id: 'interviewing', label: 'Interviewing', statuses: ['interviewing'], color: 'accent', icon: Video },
  { id: 'hired', label: 'Hired', statuses: ['hired'], color: 'success', icon: CheckCircle2 },
  { id: 'declined', label: 'Declined', statuses: ['rejected'], color: 'muted', icon: Ban },
];

const STATUS_FOR_COLUMN: Record<string, string> = {
  new: 'contacted',
  contacted: 'interviewing',
  interviewing: 'hired',
  hired: 'hired',
  declined: 'rejected',
};

/** Text tokens, not the fill hues: --wa-success / --wa-gold are 3.45:1 / 3.7:1 for 13px text on white. */
function scoreColor(score: number): string {
  if (score >= 80) return 'var(--wa-success-dark)';
  if (score >= 60) return 'var(--wa-gold-dark)';
  return 'var(--wa-muted)';
}

function getInitials(name: string): string {
  const parts = (name || '?').split(' ').filter(Boolean);
  return parts.map((n) => n[0]).slice(0, 2).join('').toUpperCase() || '?';
}

function matchColumnId(status: string): string {
  for (const col of COLUMNS) {
    if (col.statuses.includes(status)) return col.id;
  }
  return 'new';
}

export default function EmployerKanban({ initialMatches }: { initialMatches: MatchRow[] }) {
  const [matches, setMatches] = useState(initialMatches);
  const [busy, setBusy] = useState<string | null>(null);
  const [revertError, setRevertError] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const dragMatch = useRef<MatchRow | null>(null);

  const patchStatus = useCallback(async (match: MatchRow, targetColumnId: string) => {
    const newStatus = targetColumnId === 'declined' ? 'rejected' : STATUS_FOR_COLUMN[targetColumnId] ?? 'contacted';
    if (matchColumnId(match.status) === targetColumnId) return;

    // Optimistic update: move the card immediately in the UI
    setRevertError(null);
    setMatches(prev => prev.map(m => m.id === match.id ? { ...m, status: newStatus } : m));
    setBusy(match.id);
    try {
      const r = await fetch(`/api/employer/jobs/${match.jobId}/matches/${match.student.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
        credentials: 'include',
      });
      if (r.ok) {
        const data = await r.json().catch(() => ({}));
        setMatches(prev => prev.map(m => m.id === match.id ? { ...m, status: data.status ?? newStatus } : m));
      } else {
        // Revert on HTTP error
        setMatches(prev => prev.map(m => m.id === match.id ? { ...m, status: match.status } : m));
        setRevertError(match.id);
      }
    } catch {
      // Revert on network error
      setMatches(prev => prev.map(m => m.id === match.id ? { ...m, status: match.status } : m));
      setRevertError(match.id);
    } finally {
      setBusy(null);
    }
  }, []);

  const handleDragStart = (match: MatchRow) => {
    setDragId(match.id);
    dragMatch.current = match;
  };

  const handleDrop = async (columnId: string) => {
    setDragOver(null);
    setDragId(null);
    if (dragMatch.current) {
      await patchStatus(dragMatch.current, columnId);
      dragMatch.current = null;
    }
  };

  if (matches.length === 0) {
    return (
      <DesignSurface surface="dense">
        <div className="wa-kit-card">
          <EmployerEmptyState variant="pipelineNoMatches" headingAs="h2" />
        </div>
      </DesignSurface>
    );
  }

  return (
    <DesignSurface surface="dense">
      <p style={{ fontSize: 13, color: 'var(--wa-muted)', marginBottom: 16 }}>
        Drag cards between columns to move candidates through your pipeline.
      </p>
      <div className="wa-overflow-x-auto">
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${COLUMNS.length}, minmax(240px, 1fr))`, gap: 12, paddingBottom: 8 }}>
          {COLUMNS.map(col => {
            const colMatches = matches.filter(m => matchColumnId(m.status) === col.id);
            const isOver = dragOver === col.id;
            const c = colorVar(col.color);
            const Icon = col.icon;
            return (
              <div
                key={col.id}
                onDragOver={e => { e.preventDefault(); setDragOver(col.id); }}
                onDragLeave={() => setDragOver(null)}
                onDrop={() => void handleDrop(col.id)}
                className="wa-kit-card wa-kit-card--sm"
                style={{
                  background: isOver ? `color-mix(in srgb, ${c} 10%, var(--wa-surface))` : 'var(--wa-surface)',
                  border: isOver ? `2px solid ${c}` : '1px solid var(--wa-border)',
                  transition: 'background 0.15s, border 0.15s',
                  minHeight: 220,
                  display: 'flex',
                  flexDirection: 'column',
                  padding: 0,
                  overflow: 'hidden',
                }}
              >
                {/* Column header */}
                <div
                  className="wa-flex wa-items-center wa-gap-2"
                  style={{ padding: '12px 14px', borderBottom: '1px solid var(--wa-border)', background: 'var(--wa-bg)' }}
                >
                  <Icon size={14} aria-hidden style={{ color: c, flexShrink: 0 }} />
                  <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--wa-text)' }}>{col.label}</span>
                  <span
                    style={{
                      marginLeft: 'auto',
                      fontSize: 13,
                      fontWeight: 800,
                      color: c,
                      background: `color-mix(in srgb, ${c} 14%, transparent)`,
                      padding: '2px 8px',
                      borderRadius: 999,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {colMatches.length}
                  </span>
                </div>

                {/* Cards */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 10, flex: 1 }}>
                  {colMatches.map(m => {
                    const score = matchScoreAsPercent(m.matchScore);
                    const isBusy = busy === m.id;
                    const isDragging = dragId === m.id;
                    return (
                      <div
                        key={m.id}
                        draggable={!isBusy}
                        onDragStart={() => handleDragStart(m)}
                        onDragEnd={() => { setDragId(null); setDragOver(null); dragMatch.current = null; }}
                        className="wa-kit-card wa-kit-card--sm"
                        style={{
                          background: isDragging ? 'var(--wa-surface-2)' : 'var(--wa-bg)',
                          cursor: isBusy ? 'default' : 'grab',
                          opacity: isDragging ? 0.5 : isBusy ? 0.7 : 1,
                          transition: 'opacity 0.15s',
                          userSelect: 'none',
                        }}
                      >
                        <div className="wa-flex wa-items-start wa-gap-2">
                          <Avatar initials={getInitials(m.student.fullName ?? '?')} size={30} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p
                              style={{
                                fontWeight: 700,
                                fontSize: 13,
                                color: 'var(--wa-text)',
                                margin: 0,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {m.student.fullName}
                            </p>
                            <p
                              style={{
                                fontSize: 13,
                                color: 'var(--wa-muted)',
                                margin: '1px 0 0',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {m.jobTitle}
                            </p>
                          </div>
                          <span style={{ fontSize: 13, fontWeight: 800, color: scoreColor(score), flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                            {score}%
                          </span>
                        </div>
                        {m.matchReasons.length > 0 && (
                          <p style={{ fontSize: 13, color: 'var(--wa-muted)', margin: '8px 0 0', lineHeight: 1.4 }}>
                            {m.matchReasons[0]}
                          </p>
                        )}
                        <div className="wa-flex wa-items-center wa-gap-2" style={{ marginTop: 8 }}>
                          <Link href={`/employer/candidates/${m.student.id}?jobId=${m.jobId}`} style={{ fontSize: 13, fontWeight: 700, color: 'var(--wa-accent)', textDecoration: 'none' }}>
                            View →
                          </Link>
                          {isBusy && <span style={{ fontSize: 13, color: 'var(--wa-muted)' }}>Moving…</span>}
                        </div>
                        {revertError === m.id && (
                          <p role="alert" style={{ fontSize: 13, fontWeight: 700, color: 'var(--wa-danger)', margin: '6px 0 0' }}>
                            Couldn&apos;t update status — try again
                          </p>
                        )}
                      </div>
                    );
                  })}
                  {colMatches.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '24px 8px', opacity: 0.5 }}>
                      <GripVertical size={20} aria-hidden style={{ color: 'var(--wa-muted)' }} />
                      <p style={{ fontSize: 13, color: 'var(--wa-muted)', margin: '4px 0 0' }}>Drop here</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </DesignSurface>
  );
}
