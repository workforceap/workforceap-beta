'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import ConfirmDialog from '@/components/admin/ConfirmDialog';
import CourseraPipelineFlow from '@/components/admin/CourseraPipelineFlow';
import { DataLandingEmptyArt } from '@/components/graphics/DataLandingEmptyArt';
import DataTable from '@/components/portal/ui/DataTable';
import { scrollBehavior } from '@/lib/a11y/scrollBehavior';

type MemberOption = {
  id: string;
  fullName: string;
  email: string;
  programTitle: string | null;
  workspaceEmail?: string | null;
  workspaceEmailProvisioned?: boolean;
};

type MappingRow = {
  id: string;
  userId: string;
  courseraEmail: string | null;
  actorIdentifier: string | null;
  actorHomePage: string | null;
  source: string;
  notes: string | null;
  lastSeenAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  userEmail: string;
  userFullName: string;
};

type XapiStatementAttentionRow = {
  id: string;
  createdAt: Date | string;
  actorEmail: string | null;
  verb: string;
  courseId: string | null;
  courseName: string | null;
  statementId: string | null;
  processed: boolean;
  reason: 'unprocessed' | 'identity_unmatched';
};

type CourseraSyncStatus = {
  lastXapiReceivedAt: Date | string | null;
  distinctMembersWithCourseProgress: number;
  attentionStatementCount: number;
};

type CourseProgressAuditRow = {
  id: string;
  programSlug: string;
  courseSlug: string;
  courseId: string | null;
  status: string;
  percentComplete: number;
  lastUpdatedAt: Date | string;
};

type ProgramProgressAuditRollup = {
  programSlug: string;
  programTitle: string | null;
  catalogCourseCount: number;
  coursesCompleted: number;
  averagePercent: number;
  fromMemberProgramProgress: boolean;
};

type ProgressAuditPayload =
  | { found: false }
  | {
      found: true;
      userId: string;
      email: string;
      fullName: string;
      enrolledProgram: string | null;
      courseRows: CourseProgressAuditRow[];
      rollups: ProgramProgressAuditRollup[];
    };

const cardStyle: React.CSSProperties = {
  background: 'var(--surface-container-lowest)',
  border: '1px solid var(--outline-variant)',
  borderRadius: '1rem',
  padding: '1rem',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.8125rem',
  fontWeight: 700,
  color: 'var(--color-on-surface-variant)',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  marginBottom: '0.375rem',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.7rem 0.8rem',
  borderRadius: '0.65rem',
  border: '1px solid var(--outline-variant)',
  background: 'var(--surface-container)',
  color: 'var(--color-on-surface)',
  fontSize: '0.95rem',
  fontFamily: 'inherit',
};

function fmtDate(value: Date | string | null | undefined) {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString();
}

function formatMemberOptionLabel(member: MemberOption) {
  return `${member.fullName} · ${member.email}`;
}

function formatVerb(verb: string) {
  const v = verb.trim();
  if (!v) return '—';
  if (v.startsWith('http://') || v.startsWith('https://')) {
    try {
      const tail = new URL(v).pathname.split('/').filter(Boolean).pop();
      return tail ? `${tail} (${v})` : v;
    } catch {
      return v;
    }
  }
  return v;
}

function reasonLabel(reason: XapiStatementAttentionRow['reason']) {
  if (reason === 'unprocessed') return 'Unprocessed';
  return 'Identity / completion';
}

export default function CourseraMappingsAdmin({
  members,
  mappings,
  xapiAttention,
  syncStatus,
  progressAudit,
  progressAuditError,
  auditEmailInitial,
}: {
  members: MemberOption[];
  mappings: MappingRow[];
  xapiAttention: XapiStatementAttentionRow[];
  syncStatus: CourseraSyncStatus;
  progressAudit: ProgressAuditPayload | null;
  progressAuditError: string | null;
  auditEmailInitial: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [userId, setUserId] = useState('');
  const [courseraEmail, setCourseraEmail] = useState('');
  const [actorIdentifier, setActorIdentifier] = useState('');
  const [actorHomePage, setActorHomePage] = useState('');
  const [notes, setNotes] = useState('');
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [reprocessResult, setReprocessResult] = useState<{ processed: number; matched: number } | null>(null);
  const [isAutoHealing, setIsAutoHealing] = useState(false);
  // Actor email pending confirmation for the "Backfill progress" action;
  // null means the confirm dialog is closed.
  const [backfillEmail, setBackfillEmail] = useState<string | null>(null);

  function runBackfill(actorEmail: string) {
    fetch(`/api/admin/coursera/backfill-xapi?email=${encodeURIComponent(actorEmail)}`, {
      method: 'GET',
      credentials: 'include',
    })
      .then(async (res) => {
        const payload = await res.json().catch(() => ({}));
        if (res.ok && payload.ok) {
          setMessage({
            kind: 'success',
            text: `Backfilled ${payload.progressUpdated + payload.completed} course(s) for ${actorEmail}.`,
          });
          router.refresh();
        } else {
          setMessage({ kind: 'error', text: payload.error || 'Backfill failed.' });
        }
      })
      .catch(() => setMessage({ kind: 'error', text: 'Network error during backfill.' }));
  }

  // Sort/filter state for xAPI attention
  const [xapiFilter, setXapiFilter] = useState('');
  const [xapiSort, setXapiSort] = useState<'newest' | 'email' | 'verb'>('newest');
  const [showOnlyUnprocessed, setShowOnlyUnprocessed] = useState(false);

  // Sort/filter state for saved mappings
  const [mappingFilter, setMappingFilter] = useState('');
  const [mappingSort, setMappingSort] = useState<'newest' | 'member' | 'courseraEmail'>('newest');

  const filteredXapiAttention = useMemo(() => {
    let rows = [...xapiAttention];

    if (xapiFilter.trim()) {
      const q = xapiFilter.toLowerCase();
      rows = rows.filter(
        (r) =>
          (r.actorEmail ?? '').toLowerCase().includes(q) ||
          (r.courseName ?? '').toLowerCase().includes(q) ||
          r.verb.toLowerCase().includes(q)
      );
    }

    if (showOnlyUnprocessed) {
      rows = rows.filter((r) => !r.processed);
    }

    switch (xapiSort) {
      case 'email':
        rows.sort((a, b) => (a.actorEmail ?? '').localeCompare(b.actorEmail ?? ''));
        break;
      case 'verb':
        rows.sort((a, b) => a.verb.localeCompare(b.verb));
        break;
      case 'newest':
      default:
        rows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        break;
    }

    return rows;
  }, [xapiAttention, xapiFilter, xapiSort, showOnlyUnprocessed]);

  const filteredMappings = useMemo(() => {
    let rows = [...mappings];
    if (mappingFilter.trim()) {
      const q = mappingFilter.toLowerCase();
      rows = rows.filter(
        (r) =>
          r.userFullName.toLowerCase().includes(q) ||
          r.userEmail.toLowerCase().includes(q) ||
          (r.courseraEmail ?? '').toLowerCase().includes(q)
      );
    }
    switch (mappingSort) {
      case 'member':
        rows.sort((a, b) => a.userFullName.localeCompare(b.userFullName));
        break;
      case 'courseraEmail':
        rows.sort((a, b) => (a.courseraEmail ?? '').localeCompare(b.courseraEmail ?? ''));
        break;
      case 'newest':
      default:
        rows.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
        break;
    }
    return rows;
  }, [mappings, mappingSort, mappingFilter]);

  const selectedMember = useMemo(
    () => members.find((member) => member.id === userId) ?? null,
    [members, userId]
  );

  useEffect(() => {
    const m = members.find((x) => x.id === userId);
    const email = m?.workspaceEmail?.trim() ?? '';
    setCourseraEmail(email);
  }, [userId, members]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    startTransition(async () => {
      try {
        const response = await fetch('/api/admin/coursera/mappings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            userId,
            courseraEmail: courseraEmail || undefined,
            actorIdentifier: actorIdentifier || undefined,
            actorHomePage: actorHomePage || undefined,
            notes: notes || undefined,
          }),
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          setMessage({ kind: 'error', text: payload.error || 'Unable to save mapping.' });
          setReprocessResult(null);
          return;
        }

        setMessage({ kind: 'success', text: 'Coursera mapping saved.' });
        if (payload.reprocessed) {
          setReprocessResult({
            processed: payload.reprocessed.processed ?? 0,
            matched: payload.reprocessed.matched ?? 0,
          });
        }
        router.refresh();
      } catch {
        setMessage({ kind: 'error', text: 'Network error while saving mapping.' });
      }
    });
  }

  function applyXapiAttentionRow(row: XapiStatementAttentionRow) {
    setCourseraEmail(row.actorEmail || '');
    setActorIdentifier('');
    setActorHomePage('');
    setNotes(
      (current) =>
        current ||
        `Seeded from xAPI statement ${row.statementId || row.id} (${reasonLabel(row.reason)})`
    );
    setMessage(null);
    requestAnimationFrame(() => {
      const el = document.getElementById('coursera-mapping-form-top');
      el?.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
      document.getElementById('coursera-mapping-userId')?.focus();
    });
  }

  return (
    <div style={{ display: 'grid', gap: '1.25rem' }}>
      <section style={cardStyle}>
        <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.1rem' }}>Sync status</h2>
        <p style={{ margin: '0 0 1rem', color: 'var(--color-on-surface-variant)' }}>
          Operational view of xAPI ingest and course progress coverage (uses existing DB only).
        </p>
        <div
          style={{
            display: 'grid',
            gap: '0.75rem',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          }}
        >
          <div className="content-chip" style={{ padding: '0.85rem 1rem', display: 'grid', gap: '0.25rem' }}>
            <span style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>Last xAPI received</span>
            <strong style={{ fontSize: '1rem' }}>{fmtDate(syncStatus.lastXapiReceivedAt)}</strong>
          </div>
          <div className="content-chip" style={{ padding: '0.85rem 1rem', display: 'grid', gap: '0.25rem' }}>
            <span style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>
              Members with course progress
            </span>
            <strong style={{ fontSize: '1rem' }}>{syncStatus.distinctMembersWithCourseProgress}</strong>
          </div>
          <div className="content-chip" style={{ padding: '0.85rem 1rem', display: 'grid', gap: '0.25rem' }}>
            <span style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>
              Statements needing attention
            </span>
            <strong style={{ fontSize: '1rem' }}>{syncStatus.attentionStatementCount}</strong>
          </div>
        </div>
      </section>

      <section style={cardStyle} id="coursera-mapping-form-top">
        <div className="coursera-header-row" style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Manual identity mapping</h2>
            <p style={{ margin: '0.35rem 0 0', color: 'var(--color-on-surface-variant)', maxWidth: '48rem' }}>
              Bind a Coursera learner email or actor ID to a WAP member when direct email matching is not enough.
            </p>
            <div style={{ marginTop: '0.85rem' }}>
              <p style={{ margin: '0 0 0.5rem', fontSize: '0.8125rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-on-surface-variant)' }}>
                Data path (this page)
              </p>
              <CourseraPipelineFlow variant="compact" />
            </div>
          </div>
          <div className="coursera-chip-row" style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <div className="content-chip">{mappings.length} mapping{mappings.length === 1 ? '' : 's'}</div>
            <div className="content-chip">
              {syncStatus.attentionStatementCount} statement{syncStatus.attentionStatementCount === 1 ? '' : 's'}{' '}
              needing attention
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '1rem' }} aria-describedby="coursera-manual-mapping-hint">
          <p id="coursera-manual-mapping-hint" className="sr-only">
            Choose a member, enter Coursera identity fields, then save. Use unmatched events below to pre-fill the form.
          </p>
          <div className="coursera-form-grid" style={{ display: 'grid', gap: '1rem' }}>
            <div style={{ minWidth: 0 }}>
              <label htmlFor="coursera-mapping-userId" style={labelStyle}>
                Member
              </label>
              <select
                id="coursera-mapping-userId"
                name="userId"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                style={inputStyle}
                className="coursera-input"
                required
              >
                <option value="">Select a member</option>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {formatMemberOptionLabel(member)}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ minWidth: 0 }}>
              <label htmlFor="coursera-mapping-courseraEmail" style={labelStyle}>
                Coursera email
              </label>
              <input
                id="coursera-mapping-courseraEmail"
                name="courseraEmail"
                type="email"
                autoComplete="email"
                value={courseraEmail}
                onChange={(e) => setCourseraEmail(e.target.value)}
                style={inputStyle}
                className="coursera-input"
                placeholder="learner@example.com"
              />
              {selectedMember?.workspaceEmail ? (
                <p style={{ margin: '0.35rem 0 0', fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>
                  Suggested from training seat: <strong>{selectedMember.workspaceEmail}</strong>
                  {selectedMember.workspaceEmailProvisioned ? ' (provisioned)' : ''}
                </p>
              ) : null}
            </div>

            <div style={{ minWidth: 0 }}>
              <label htmlFor="coursera-mapping-actorIdentifier" style={labelStyle}>
                Actor identifier
              </label>
              <input
                id="coursera-mapping-actorIdentifier"
                name="actorIdentifier"
                value={actorIdentifier}
                onChange={(e) => setActorIdentifier(e.target.value)}
                style={inputStyle}
                className="coursera-input"
                placeholder="optional stable Coursera actor id"
              />
            </div>

            <div style={{ minWidth: 0 }}>
              <label htmlFor="coursera-mapping-actorHomePage" style={labelStyle}>
                Actor home page
              </label>
              <input
                id="coursera-mapping-actorHomePage"
                name="actorHomePage"
                type="url"
                value={actorHomePage}
                onChange={(e) => setActorHomePage(e.target.value)}
                style={inputStyle}
                className="coursera-input"
                placeholder="optional actor home page"
              />
            </div>
          </div>

          <div>
            <label htmlFor="coursera-mapping-notes" style={labelStyle}>
              Notes
            </label>
            <textarea
              id="coursera-mapping-notes"
              name="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              style={{ ...inputStyle, minHeight: '5rem', resize: 'vertical' }}
              className="coursera-input"
              placeholder="Why this mapping exists, test notes, etc."
            />
          </div>

          {selectedMember && (
            <div className="coursera-selected-member" style={{ padding: '0.85rem 1rem', borderRadius: '0.75rem', background: 'var(--surface-container)', color: 'var(--color-on-surface-variant)' }}>
              Mapping to <strong style={{ color: 'var(--color-on-surface)' }}>{selectedMember.fullName}</strong> ({selectedMember.email})
              {selectedMember.programTitle ? ` in ${selectedMember.programTitle}` : ''}.
            </div>
          )}

          {message && (
            <div
              role={message.kind === 'success' ? 'status' : 'alert'}
              style={{
              padding: '0.8rem 1rem',
              borderRadius: '0.75rem',
              background: message.kind === 'success' ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
              border: `1px solid ${message.kind === 'success' ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'}`,
              color: message.kind === 'success' ? 'var(--color-green, #15803d)' : 'var(--color-error, #b91c1c)',
            }}>
              {message.text}
              {reprocessResult && message.kind === 'success' && (
                <div style={{ marginTop: '0.5rem', fontSize: '0.9rem', color: 'var(--color-on-surface-variant)' }}>
                  Re-processed {reprocessResult.processed} unmatched xAPI event{reprocessResult.processed === 1 ? '' : 's'} — {reprocessResult.matched} matched to this member.
                </div>
              )}
            </div>
          )}

          <div className="coursera-actions" style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button type="submit" className="btn btn-primary coursera-action-button" disabled={isPending || !userId || (!courseraEmail && !actorIdentifier)}>
              {isPending ? 'Saving…' : 'Save mapping'}
            </button>
            <button
              type="button"
              className="btn btn-outline coursera-action-button"
              onClick={() => {
                setUserId('');
                setCourseraEmail('');
                setActorIdentifier('');
                setActorHomePage('');
                setNotes('');
                setMessage(null);
              }}
            >
              Clear
            </button>
          </div>
        </form>

        <style jsx>{`
          .coursera-form-grid {
            grid-template-columns: minmax(0, 1fr);
          }

          .coursera-input {
            box-sizing: border-box;
            min-width: 0;
          }

          .coursera-selected-member {
            word-break: break-word;
            overflow-wrap: anywhere;
          }

          .coursera-actions {
            align-items: stretch;
          }

          .coursera-action-button {
            min-height: 44px;
          }

          @media (max-width: 640px) {
            .coursera-header-row {
              gap: 0.75rem;
            }

            .coursera-chip-row {
              width: 100%;
              gap: 0.5rem;
            }

            .coursera-actions {
              display: grid;
              grid-template-columns: minmax(0, 1fr);
            }

            .coursera-action-button {
              width: 100%;
              justify-content: center;
            }
          }

          @media (min-width: 860px) {
            .coursera-form-grid {
              grid-template-columns: repeat(2, minmax(0, 1fr));
            }
          }
        `}</style>
      </section>

      <section style={cardStyle} key={`audit-wrap-${auditEmailInitial}`}>
        <h2 style={{ margin: '0 0 0.35rem', fontSize: '1.1rem' }}>Member progress audit</h2>
        <p style={{ margin: '0 0 1rem', color: 'var(--color-on-surface-variant)' }}>
          Search by email to list <code style={{ fontSize: '0.85em' }}>CourseProgress</code> rows and program rollups
          (same catalog counts and <code style={{ fontSize: '0.85em' }}>MemberProgramProgress</code> averages as training dashboard).
        </p>
        <form method="get" action="/admin/coursera" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end', marginBottom: '1rem' }}>
          {/* Keep the audit search on the legacy (interactive) view; the default route is the design-kit treatment. */}
          <input type="hidden" name="ui" value="legacy" />
          <div style={{ flex: '1 1 220px', minWidth: 0 }}>
            <label htmlFor="coursera-audit-email" style={labelStyle}>
              Member email
            </label>
            <input
              id="coursera-audit-email"
              name="auditEmail"
              type="email"
              defaultValue={auditEmailInitial}
              style={inputStyle}
              placeholder="member@example.org"
            />
          </div>
          <button type="submit" className="btn btn-primary" style={{ minHeight: '44px' }}>
            Search
          </button>
        </form>

        {progressAuditError && auditEmailInitial.trim() ? (
          <p style={{ color: '#fca5a5', margin: 0 }}>Progress audit failed: {progressAuditError}</p>
        ) : null}

        {!progressAudit || !auditEmailInitial.trim() ? (
          <p style={{ color: 'var(--color-on-surface-variant)', margin: 0 }}>Enter an email and search to load progress.</p>
        ) : !progressAudit.found ? (
          <p style={{ color: 'var(--color-on-surface-variant)', margin: 0 }}>No user found for that email.</p>
        ) : (
          <div style={{ display: 'grid', gap: '1rem' }}>
            <div style={{ color: 'var(--color-on-surface-variant)' }}>
              <strong style={{ color: 'var(--color-on-surface)' }}>{progressAudit.fullName}</strong> · {progressAudit.email}
              <div style={{ fontSize: '0.875rem', marginTop: '0.25rem' }}>
                User id: {progressAudit.userId}
                {progressAudit.enrolledProgram ? ` · Enrolled program slug: ${progressAudit.enrolledProgram}` : ''}
              </div>
            </div>

            {progressAudit.rollups.length === 0 ? (
              <p style={{ color: 'var(--color-on-surface-variant)', margin: 0 }}>No course progress rows for this member.</p>
            ) : (
              <div style={{ overflowX: 'auto', maxWidth: '100%', minWidth: 0, WebkitOverflowScrolling: 'touch' }}>
                <DataTable
                  density="compact"
                  scrollX={false}
                  rows={progressAudit.rollups}
                  rowKey={(r) => r.programSlug}
                  columns={[
                    {
                      key: 'program',
                      header: 'Program',
                      cell: (r) => (
                        <>
                          <div style={{ fontWeight: 700 }}>{r.programTitle || r.programSlug}</div>
                          <div style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>{r.programSlug}</div>
                        </>
                      ),
                    },
                    {
                      key: 'complete',
                      header: 'Complete',
                      align: 'right',
                      cell: (r) => (
                        <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {r.coursesCompleted} of {r.catalogCourseCount || '—'}
                        </span>
                      ),
                    },
                    {
                      key: 'avg',
                      header: 'Avg %',
                      align: 'right',
                      cell: (r) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{r.averagePercent}%</span>,
                    },
                    {
                      key: 'source',
                      header: 'Rollup source',
                      cell: (r) => (
                        <span style={{ fontSize: '0.875rem', color: 'var(--color-on-surface-variant)' }}>
                          {r.fromMemberProgramProgress ? 'MemberProgramProgress' : 'Derived from rows'}
                        </span>
                      ),
                    },
                  ]}
                />
              </div>
            )}

            {progressAudit.courseRows.length > 0 ? (
              <div>
                <h3 style={{ fontSize: '1rem', margin: '0 0 0.5rem' }}>Course progress rows</h3>
                <div style={{ overflowX: 'auto', maxWidth: '100%', minWidth: 0, WebkitOverflowScrolling: 'touch' }}>
                  <DataTable
                    density="compact"
                    scrollX={false}
                    rows={progressAudit.courseRows}
                    rowKey={(row) => row.id}
                    columns={[
                      {
                        key: 'program',
                        header: 'Program',
                        cell: (row) => <span style={{ fontSize: '0.875rem' }}>{row.programSlug}</span>,
                      },
                      { key: 'course', header: 'Course', cell: (row) => row.courseSlug },
                      {
                        key: 'cid',
                        header: 'Coursera id',
                        cell: (row) => (
                          <span style={{ fontSize: '0.875rem', color: 'var(--color-on-surface-variant)' }}>
                            {row.courseId || '—'}
                          </span>
                        ),
                      },
                      { key: 'status', header: 'Status', cell: (row) => row.status },
                      {
                        key: 'pct',
                        header: '%',
                        align: 'right',
                        cell: (row) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{row.percentComplete}</span>,
                      },
                      {
                        key: 'updated',
                        header: 'Updated',
                        cell: (row) => <span style={{ fontSize: '0.875rem' }}>{fmtDate(row.lastUpdatedAt)}</span>,
                      },
                    ]}
                  />
                </div>
              </div>
            ) : null}
          </div>
        )}
      </section>

      <section style={cardStyle}>
        <div style={{ marginBottom: '1rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Saved mappings</h2>
          <p style={{ margin: '0.35rem 0 0', color: 'var(--color-on-surface-variant)' }}>
            These mappings are checked before direct email match during xAPI completion processing.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '0.75rem' }}>
          <input
            type="text"
            value={mappingFilter}
            onChange={(e) => setMappingFilter(e.target.value)}
            placeholder="Filter by member name, email, or Coursera email..."
            aria-label="Filter saved mappings"
            style={{ ...inputStyle, flex: '1 1 200px', minWidth: '180px' }}
          />
          <select
            value={mappingSort}
            onChange={(e) => setMappingSort(e.target.value as 'newest' | 'member' | 'courseraEmail')}
            aria-label="Sort saved mappings"
            style={{ ...inputStyle, width: 'auto', minWidth: '120px' }}
          >
            <option value="newest">Newest first</option>
            <option value="member">Member A→Z</option>
            <option value="courseraEmail">Coursera email A→Z</option>
          </select>
        </div>

        {filteredMappings.length === 0 ? (
          <div className="coursera-empty-row__inner" style={{ padding: '1.5rem 0' }}>
            <DataLandingEmptyArt />
            <span style={{ color: 'var(--color-on-surface-variant)', textAlign: 'center', maxWidth: '28rem' }}>
              No manual mappings yet. When xAPI cannot match a learner automatically, save a row here so statements
              route to the right member.
            </span>
          </div>
        ) : (
          <>
            {/* Mobile: stacked cards (avoids horizontal cropping of email columns) */}
            <div className="coursera-unmatched-cards md:wa-hidden" style={{ marginBottom: '0.5rem' }}>
              {filteredMappings.map((mapping) => (
                <article key={`mapping-card-${mapping.id}`} className="coursera-unmatched-card">
                  <div className="coursera-unmatched-card__label">Member</div>
                  <div className="coursera-unmatched-card__value">
                    <div style={{ fontWeight: 700 }}>{mapping.userFullName}</div>
                    <div style={{ color: 'var(--color-on-surface-variant)', fontSize: '0.8125rem' }}>{mapping.userEmail}</div>
                  </div>

                  <div className="coursera-unmatched-card__label">Coursera email</div>
                  <div className="coursera-unmatched-card__value">{mapping.courseraEmail || '—'}</div>

                  <div className="coursera-unmatched-card__label">Actor ID</div>
                  <div className="coursera-unmatched-card__value">
                    <div>{mapping.actorIdentifier || '—'}</div>
                    {mapping.actorHomePage ? (
                      <div style={{ color: 'var(--color-on-surface-variant)', fontSize: '0.8125rem' }}>{mapping.actorHomePage}</div>
                    ) : null}
                  </div>

                  <div className="coursera-unmatched-card__label">Source · last seen</div>
                  <div className="coursera-unmatched-card__value">
                    {mapping.source}
                    <div style={{ color: 'var(--color-on-surface-variant)', fontSize: '0.8125rem', marginTop: '0.2rem' }}>
                      {fmtDate(mapping.lastSeenAt)}
                    </div>
                  </div>

                  <div className="coursera-unmatched-card__label">Notes</div>
                  <div className="coursera-unmatched-card__value" style={{ color: 'var(--color-on-surface-variant)' }}>
                    {mapping.notes || '—'}
                  </div>
                </article>
              ))}
            </div>

            {/* Desktop: original table */}
            <div className="wa-hidden md:wa-block">
              <DataTable
                variant="admin"
                tableClassName="coursera-unmatched-table coursera-admin-data-table"
                className="coursera-unmatched-table-wrap"
                rows={filteredMappings}
                rowKey={(m) => m.id}
                columns={[
                  {
                    key: 'member',
                    header: 'Member',
                    cell: (mapping) => (
                      <>
                        <div style={{ fontWeight: 700 }}>{mapping.userFullName}</div>
                        <div style={{ color: 'var(--color-on-surface-variant)', fontSize: '0.875rem' }}>{mapping.userEmail}</div>
                      </>
                    ),
                  },
                  { key: 'coursera', header: 'Coursera email', cell: (m) => m.courseraEmail || '—' },
                  {
                    key: 'actor',
                    header: 'Actor ID',
                    cell: (mapping) => (
                      <>
                        <div>{mapping.actorIdentifier || '—'}</div>
                        {mapping.actorHomePage ? (
                          <div style={{ color: 'var(--color-on-surface-variant)', fontSize: '0.8125rem' }}>{mapping.actorHomePage}</div>
                        ) : null}
                      </>
                    ),
                  },
                  { key: 'source', header: 'Source', cell: (m) => m.source },
                  { key: 'last', header: 'Last seen', cell: (m) => fmtDate(m.lastSeenAt) },
                  {
                    key: 'notes',
                    header: 'Notes',
                    cell: (m) => <span style={{ color: 'var(--color-on-surface-variant)' }}>{m.notes || '—'}</span>,
                  },
                ]}
              />
            </div>
          </>
        )}
      </section>

      <section style={cardStyle}>
        <div
          style={{
            marginBottom: '1rem',
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            gap: '0.75rem',
            alignItems: 'flex-start',
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: '1.1rem' }}>xAPI statements needing attention</h2>
            <p style={{ margin: '0.35rem 0 0', color: 'var(--color-on-surface-variant)', maxWidth: '48rem' }}>
              From <code style={{ fontSize: '0.85em' }}>XapiStatement</code>: still unprocessed, or linked to an identity/completion
              issue. <strong>{xapiAttention.length}</strong> row{xapiAttention.length === 1 ? '' : 's'} below — use{' '}
              <strong>Create mapping</strong> to load actor email into the form, pick the member, then save.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-primary coursera-unmatched-cta"
              disabled={isAutoHealing}
              onClick={() => {
                setIsAutoHealing(true);
                fetch('/api/admin/coursera/auto-heal', { method: 'POST', credentials: 'include' })
                  .then(async (res) => {
                    const payload = await res.json().catch(() => ({}));
                    if (res.ok && payload.result) {
                      const r = payload.result as {
                        processed?: number;
                        matched?: number;
                        errors?: number;
                        pendingReplay?: { replayed?: number };
                      };
                      const pendingReplayed = r.pendingReplay?.replayed ?? 0;
                      const detail = pendingReplayed
                        ? ` Drained ${pendingReplayed} pending xAPI row${pendingReplayed === 1 ? '' : 's'}.`
                        : '';
                      setMessage({
                        kind: 'success',
                        text: `Auto-heal complete: ${r.matched ?? 0} of ${r.processed ?? 0} statements credited to members.${detail}`,
                      });
                      router.refresh();
                    } else {
                      setMessage({ kind: 'error', text: payload.error || 'Auto-heal failed.' });
                    }
                  })
                  .catch(() => setMessage({ kind: 'error', text: 'Network error during auto-heal.' }))
                  .finally(() => setIsAutoHealing(false));
              }}
            >
              {isAutoHealing ? 'Healing…' : 'Auto-heal all'}
            </button>
            <a href="#coursera-mapping-form-top" className="btn btn-primary coursera-unmatched-cta" style={{ textDecoration: 'none' }}>
              Jump to mapping form
            </a>
          </div>
        </div>

        <div className="coursera-unmatched-controls" style={{ display: 'grid', gap: '0.75rem', marginBottom: '0.5rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              type="text"
              value={xapiFilter}
              onChange={(e) => setXapiFilter(e.target.value)}
              placeholder="Filter by email, course, or verb..."
              aria-label="Filter xAPI statements needing attention"
              style={{ ...inputStyle, flex: '1 1 200px', minWidth: '180px' }}
            />
            <select
              value={xapiSort}
              onChange={(e) => setXapiSort(e.target.value as 'newest' | 'email' | 'verb')}
              aria-label="Sort xAPI statements needing attention"
              style={{ ...inputStyle, width: 'auto', minWidth: '120px' }}
            >
              <option value="newest">Newest first</option>
              <option value="email">Email A→Z</option>
              <option value="verb">Verb A→Z</option>
            </select>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={showOnlyUnprocessed}
              onChange={(e) => setShowOnlyUnprocessed(e.target.checked)}
            />
            Show only unprocessed
          </label>
          <div style={{ fontSize: '0.85rem', color: 'var(--color-on-surface-variant)' }}>
            Showing {filteredXapiAttention.length} of {xapiAttention.length} statements
          </div>
        </div>

        {filteredXapiAttention.length === 0 ? (
          <div className="coursera-empty-row__inner" style={{ padding: '1.5rem 0' }}>
            <DataLandingEmptyArt />
            <p style={{ margin: 0, color: 'var(--color-on-surface-variant)', textAlign: 'center', maxWidth: '28rem' }}>
              No statement rows need attention right now — ingest is caught up or the attention filters returned nothing.
            </p>
          </div>
        ) : (
          <>
            <div className="coursera-unmatched-cards md:wa-hidden" style={{ marginBottom: '0.5rem' }}>
              {filteredXapiAttention.map((row) => (
                <article key={`a-${row.id}`} className="coursera-unmatched-card">
                  <div className="coursera-unmatched-card__label">When · actor</div>
                  <div className="coursera-unmatched-card__value">
                    {fmtDate(row.createdAt)}
                    <div style={{ marginTop: '0.35rem' }}>{row.actorEmail || '—'}</div>
                  </div>
                  <div className="coursera-unmatched-card__label">Verb</div>
                  <div className="coursera-unmatched-card__value" style={{ fontSize: '0.8125rem', wordBreak: 'break-word' }}>
                    {formatVerb(row.verb)}
                  </div>
                  <div className="coursera-unmatched-card__label">Course · reason</div>
                  <div className="coursera-unmatched-card__value">
                    {row.courseName || '—'}
                    {row.statementId ? (
                      <div style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', marginTop: '0.25rem' }}>
                        stmt: {row.statementId}
                      </div>
                    ) : null}
                    <div style={{ marginTop: '0.35rem', fontSize: '0.85rem' }}>
                      {reasonLabel(row.reason)} · processed: {row.processed ? 'yes' : 'no'}
                    </div>
                  </div>
                  <div className="coursera-unmatched-card__actions">
                    <button
                      type="button"
                      className="btn btn-primary coursera-unmatched-cta"
                      style={{ width: '100%' }}
                      onClick={() => applyXapiAttentionRow(row)}
                    >
                      Create mapping
                    </button>
                    {row.actorEmail ? (
                      <button
                        type="button"
                        className="btn coursera-unmatched-cta"
                        style={{ width: '100%', background: 'var(--color-surface-variant)', color: 'var(--color-on-surface)' }}
                        onClick={() => setBackfillEmail(row.actorEmail ?? '')}
                      >
                        Backfill progress
                      </button>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>

            <div className="wa-hidden md:wa-block">
              <DataTable
                variant="admin"
                tableClassName="coursera-unmatched-table"
                className="coursera-unmatched-table-wrap"
                rows={filteredXapiAttention}
                rowKey={(row) => row.id}
                columns={[
                  {
                    key: 'ts',
                    header: 'Timestamp',
                    cell: (row) => <span style={{ whiteSpace: 'nowrap' }}>{fmtDate(row.createdAt)}</span>,
                  },
                  { key: 'actor', header: 'Actor email', cell: (row) => row.actorEmail || '—' },
                  {
                    key: 'verb',
                    header: 'Verb',
                    cell: (row) => (
                      <span style={{ fontSize: '0.8125rem', maxWidth: '280px', wordBreak: 'break-word', display: 'inline-block' }}>
                        {formatVerb(row.verb)}
                      </span>
                    ),
                  },
                  {
                    key: 'course',
                    header: 'Course',
                    cell: (row) => (
                      <>
                        <div>{row.courseName || '—'}</div>
                        {row.courseId ? (
                          <div style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>id: {row.courseId}</div>
                        ) : null}
                        {row.statementId ? (
                          <div style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>stmt: {row.statementId}</div>
                        ) : null}
                      </>
                    ),
                  },
                  {
                    key: 'reason',
                    header: 'Reason',
                    cell: (row) => (
                      <span style={{ fontSize: '0.8125rem' }}>
                        {reasonLabel(row.reason)}
                        <div style={{ color: 'var(--color-on-surface-variant)' }}>processed: {row.processed ? 'yes' : 'no'}</div>
                      </span>
                    ),
                  },
                  {
                    key: 'action',
                    header: 'Action',
                    columnClassName: 'coursera-unmatched-actions',
                    cell: (row) => (
                      <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm coursera-unmatched-cta"
                          onClick={() => applyXapiAttentionRow(row)}
                        >
                          Use in form
                        </button>
                        {row.actorEmail ? (
                          <button
                            type="button"
                            className="btn btn-sm"
                            style={{ background: 'var(--color-surface-variant)', color: 'var(--color-on-surface)' }}
                            onClick={() => setBackfillEmail(row.actorEmail ?? '')}
                          >
                            Backfill
                          </button>
                        ) : null}
                      </div>
                    ),
                  },
                ]}
              />
            </div>
          </>
        )}
      </section>

      <ConfirmDialog
        open={backfillEmail !== null}
        title="Backfill progress?"
        body={`Backfill progress for ${backfillEmail ?? ''}?`}
        confirmLabel="Backfill"
        onConfirm={() => {
          const email = backfillEmail;
          setBackfillEmail(null);
          if (email !== null) runBackfill(email);
        }}
        onCancel={() => setBackfillEmail(null)}
      />
    </div>
  );
}
