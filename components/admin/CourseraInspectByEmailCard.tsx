'use client';

import { useCallback, useState } from 'react';
import DataTable, { type DataTableColumn } from '@/components/portal/ui/DataTable';

type InspectResponse = {
  email: string;
  wap: {
    userId: string | null;
    fullName: string | null;
    organizationId: string | null;
    profileRole: string | null;
    extraRoles: string[];
    isMember: boolean;
    enrollments: Array<{
      courseId: string;
      programSlug: string;
      status: string;
      lastActivityAt: string | null;
    }>;
  };
  identityMappings: Array<{
    id: string;
    courseraEmail: string | null;
    actorIdentifier: string | null;
    source: string;
    notes: string | null;
    createdAt: string;
    lastSeenAt: string | null;
  }>;
  coursera: {
    foundInRoster: boolean;
    rosterEntry: {
      externalId: string;
      fullName: string;
      membershipProgramIds: string[];
    } | null;
    enrollmentReports: Array<{
      programId: string;
      contentId: string;
      contentType: string;
      isCompleted: boolean;
      overallProgress: number | null;
      lastActivityAt: string | null;
    }>;
    gradebookReports: Array<{
      programId: string;
      courseId: string;
      collectionName: string;
      overallProgress: number;
      approxTotalLearningHrs: number;
      lastActivityAt: string | null;
    }>;
  };
  xapiActivity: {
    statementCount: number;
    latestStatementAt: string | null;
    unprocessedCount: number;
  };
  diagnosis: string[];
};

const cardStyle: React.CSSProperties = {
  padding: '0.85rem 1rem',
  border: '1px solid var(--outline-variant)',
  borderRadius: '0.75rem',
  background: 'var(--surface-container-lowest)',
  display: 'grid',
  gap: '0.45rem',
  minWidth: 0,
};

const cardTitleStyle: React.CSSProperties = {
  fontSize: '0.8125rem',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  color: 'var(--color-on-surface-variant)',
  fontWeight: 700,
};

const btnStyle: React.CSSProperties = {
  padding: '0.55rem 0.95rem',
  borderRadius: '0.6rem',
  border: '1px solid var(--outline-variant)',
  background: 'var(--primary)',
  color: 'var(--on-primary)',
  fontWeight: 600,
  fontSize: '0.9rem',
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const btnDisabledStyle: React.CSSProperties = {
  ...btnStyle,
  opacity: 0.55,
  cursor: 'not-allowed',
};

const btnSecondaryStyle: React.CSSProperties = {
  ...btnStyle,
  background: 'var(--surface-container)',
  color: 'var(--color-on-surface)',
};

function fmt(value: string | null | undefined): string {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function YesNo({ value }: { value: boolean }) {
  return (
    <span
      style={{
        fontSize: '0.8125rem',
        padding: '0.15rem 0.5rem',
        borderRadius: '0.5rem',
        background: value ? 'rgba(34, 197, 94, 0.15)' : 'rgba(244, 63, 94, 0.12)',
        color: value ? 'rgb(22, 163, 74)' : 'rgb(190, 18, 60)',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.02em',
      }}
    >
      {value ? 'yes' : 'no'}
    </span>
  );
}

type SyncResult = {
  ok: boolean;
  message: string;
  detail?: {
    seededEnrollments: number;
    updatedEnrollments: number;
    droppedNoMapping: Array<{ courseraContentId: string; reason: string }>;
    learningPaths: Array<{
      courseraContentId: string;
      name: string;
      programSlug: string | null;
      overallProgress: number | null;
    }>;
    xapiReplayed: number;
    xapiCredited: number;
  };
};

export default function CourseraInspectByEmailCard() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<InspectResponse | null>(null);
  const [adding, setAdding] = useState(false);
  const [addResult, setAddResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);

  const runInspect = useCallback(async () => {
    const trimmed = email.trim();
    if (!trimmed) {
      setError('Enter an email to inspect.');
      return;
    }
    setLoading(true);
    setError(null);
    setData(null);
    setAddResult(null);
    setSyncResult(null);
    try {
      const url = new URL('/api/admin/coursera/inspect-by-email', window.location.origin);
      url.searchParams.set('email', trimmed);
      const response = await fetch(url.toString(), { cache: 'no-store' });
      if (!response.ok) {
        const text = await response.text();
        setError(`HTTP ${response.status}: ${text.slice(0, 240)}`);
        return;
      }
      const json = (await response.json()) as InspectResponse;
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Inspect request failed');
    } finally {
      setLoading(false);
    }
  }, [email]);

  const handleAddToWap = useCallback(async () => {
    if (!data || !data.coursera.rosterEntry) return;
    setAdding(true);
    setAddResult(null);
    try {
      const response = await fetch('/api/admin/coursera/reconcile/add-to-wap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: data.email,
          fullName: data.coursera.rosterEntry.fullName || undefined,
          courseraExternalId: data.coursera.rosterEntry.externalId,
          programId:
            data.coursera.rosterEntry.membershipProgramIds[0] ??
            data.coursera.enrollmentReports[0]?.programId ??
            '',
        }),
      });
      const json = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        userId?: string;
        error?: string;
      };
      if (!response.ok || !json.ok) {
        setAddResult({ ok: false, message: json.error ?? `HTTP ${response.status}` });
        return;
      }
      setAddResult({ ok: true, message: `Added userId=${json.userId ?? '?'}` });
      // Re-run inspect to reflect the new state.
      await runInspect();
    } catch (err) {
      setAddResult({
        ok: false,
        message: err instanceof Error ? err.message : 'Add-to-WAP failed',
      });
    } finally {
      setAdding(false);
    }
  }, [data, runInspect]);

  const handleSyncFromCoursera = useCallback(async () => {
    if (!data || !data.wap.userId) return;
    setSyncing(true);
    setSyncResult(null);
    try {
      const response = await fetch('/api/admin/coursera/sync-user-from-b4b', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: data.email }),
      });
      const json = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        message?: string;
        error?: string;
        mapped?: {
          seededEnrollments: number;
          updatedEnrollments: number;
          droppedNoMapping: Array<{ courseraContentId: string; reason: string }>;
          learningPaths?: Array<{
            courseraContentId: string;
            name: string;
            programSlug: string | null;
            overallProgress: number | null;
          }>;
        };
        xapi?: {
          statementsReplayed: number;
          nowCredited: number;
        };
      };
      if (!response.ok || !json.ok) {
        setSyncResult({
          ok: false,
          message: json.error ?? `HTTP ${response.status}`,
        });
        return;
      }
      setSyncResult({
        ok: true,
        message: json.message ?? 'Sync complete.',
        detail: {
          seededEnrollments: json.mapped?.seededEnrollments ?? 0,
          updatedEnrollments: json.mapped?.updatedEnrollments ?? 0,
          droppedNoMapping: json.mapped?.droppedNoMapping ?? [],
          learningPaths: json.mapped?.learningPaths ?? [],
          xapiReplayed: json.xapi?.statementsReplayed ?? 0,
          xapiCredited: json.xapi?.nowCredited ?? 0,
        },
      });
      // Re-run inspect so the card reflects the new state.
      await runInspect();
    } catch (err) {
      setSyncResult({
        ok: false,
        message:
          err instanceof Error ? err.message : 'Sync from Coursera failed',
      });
    } finally {
      setSyncing(false);
    }
  }, [data, runInspect]);

  // The "Add to WorkforceAP" inline action only makes sense when Coursera
  // sees the learner but WAP does not yet. In every other case we hide it.
  const showAddAction = Boolean(
    data &&
      data.coursera.foundInRoster &&
      data.coursera.rosterEntry &&
      !data.wap.userId,
  );

  // The "Sync from Coursera" inline action handles the inverse case: WAP
  // already knows the user and Coursera also has them, but either xAPI
  // statements are stuck unprocessed or the WAP enrollment row was never
  // seeded so the dashboard shows 0%.
  const showSyncAction = Boolean(
    data &&
      data.wap.userId &&
      data.coursera.foundInRoster &&
      (data.xapiActivity.unprocessedCount > 0 || !data.wap.isMember),
  );

  return (
    <div style={{ display: 'grid', gap: '0.85rem' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
        <input
          type="email"
          placeholder="Email to inspect (e.g. learner@example.com)"
          aria-label="Email to inspect"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !loading) {
              e.preventDefault();
              void runInspect();
            }
          }}
          style={{
            padding: '0.55rem 0.8rem',
            borderRadius: '0.55rem',
            border: '1px solid var(--outline-variant)',
            background: 'var(--surface-container-lowest)',
            color: 'var(--color-on-surface)',
            fontSize: '0.9rem',
            minWidth: '20rem',
            flex: '1 1 20rem',
          }}
        />
        <button
          type="button"
          onClick={runInspect}
          disabled={loading}
          style={loading ? btnDisabledStyle : btnStyle}
        >
          {loading ? 'Inspecting…' : 'Inspect'}
        </button>
        {data && (
          <span
            style={{
              fontSize: '0.8125rem',
              color: 'var(--color-on-surface-variant)',
              marginLeft: 'auto',
            }}
          >
            Inspected <code>{data.email}</code>
          </span>
        )}
      </div>

      {error && (
        <div
          role="alert"
          style={{
            padding: '0.75rem 1rem',
            borderRadius: '0.6rem',
            border: '1px solid rgba(239, 68, 68, 0.5)',
            background: 'rgba(239, 68, 68, 0.06)',
            color: 'rgb(190, 18, 60)',
            fontSize: '0.9rem',
          }}
        >
          <strong>Inspect failed:</strong> {error}
        </div>
      )}

      {data && (
        <>
          {/* Four-column grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: '0.6rem',
            }}
          >
            {/* WAP record */}
            <div style={cardStyle}>
              <span style={cardTitleStyle}>WAP record</span>
              {data.wap.userId ? (
                <>
                  <div>
                    <strong>{data.wap.fullName || data.email}</strong>
                  </div>
                  <div style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>
                    userId: <code>{data.wap.userId.slice(0, 8)}…</code>
                  </div>
                  <div style={{ fontSize: '0.8125rem' }}>
                    Profile role: <code>{data.wap.profileRole ?? '—'}</code>
                  </div>
                  {data.wap.extraRoles.length > 0 && (
                    <div style={{ fontSize: '0.8125rem' }}>
                      Extra roles: <code>{data.wap.extraRoles.join(', ')}</code>
                    </div>
                  )}
                  <div style={{ fontSize: '0.8125rem', display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                    isMember: <YesNo value={data.wap.isMember} />
                  </div>
                  {data.wap.enrollments.length > 0 ? (
                    <div style={{ marginTop: '0.35rem' }}>
                      <div style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>
                        Enrollments ({data.wap.enrollments.length})
                      </div>
                      <ul
                        style={{
                          margin: '0.2rem 0 0 1rem',
                          padding: 0,
                          fontSize: '0.8125rem',
                          maxHeight: '8rem',
                          overflowY: 'auto',
                        }}
                      >
                        {data.wap.enrollments.slice(0, 8).map((row, idx) => (
                          <li key={`${row.programSlug}:${row.courseId}:${idx}`}>
                            <code>{row.programSlug}</code> · {row.courseId} · {row.status}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <div style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>
                      No CourseProgress rows.
                    </div>
                  )}
                </>
              ) : (
                <div style={{ fontSize: '0.85rem', color: 'var(--color-on-surface-variant)' }}>
                  No WAP user with this email in your org.
                </div>
              )}
            </div>

            {/* Identity mappings */}
            <div style={cardStyle}>
              <span style={cardTitleStyle}>Identity mappings</span>
              {data.identityMappings.length > 0 ? (
                <DataTable<InspectResponse['identityMappings'][number]>
                  rows={data.identityMappings}
                  rowKey={(row) => row.id}
                  density="compact"
                  columns={[
                    {
                      key: 'source',
                      header: 'Source',
                      cell: (row) => <code>{row.source}</code>,
                    },
                    {
                      key: 'courseraEmail',
                      header: 'Coursera email',
                      cell: (row) => (
                        <span style={{ wordBreak: 'break-all' }}>
                          {row.courseraEmail ?? row.actorIdentifier ?? '—'}
                        </span>
                      ),
                    },
                    {
                      key: 'lastSeenAt',
                      header: 'Last seen',
                      cell: (row) => fmt(row.lastSeenAt),
                    },
                  ] satisfies DataTableColumn<InspectResponse['identityMappings'][number]>[]}
                />
              ) : (
                <div style={{ fontSize: '0.85rem', color: 'var(--color-on-surface-variant)' }}>
                  No mapping rows.
                </div>
              )}
            </div>

            {/* Coursera */}
            <div style={cardStyle}>
              <span style={cardTitleStyle}>Coursera</span>
              <div style={{ fontSize: '0.85rem', display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                In roster: <YesNo value={data.coursera.foundInRoster} />
              </div>
              {data.coursera.rosterEntry ? (
                <>
                  <div style={{ fontSize: '0.8125rem', wordBreak: 'break-all' }}>
                    externalId: <code>{data.coursera.rosterEntry.externalId}</code>
                  </div>
                  <div style={{ fontSize: '0.8125rem' }}>
                    {data.coursera.rosterEntry.membershipProgramIds.length} program(s)
                  </div>
                </>
              ) : null}
              {data.coursera.enrollmentReports.length > 0 && (
                <div style={{ marginTop: '0.35rem' }}>
                  <div style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>
                    enrollmentReports ({data.coursera.enrollmentReports.length})
                  </div>
                  <ul
                    style={{
                      margin: '0.2rem 0 0 1rem',
                      padding: 0,
                      fontSize: '0.8125rem',
                      maxHeight: '6rem',
                      overflowY: 'auto',
                    }}
                  >
                    {data.coursera.enrollmentReports.slice(0, 6).map((r, idx) => (
                      <li key={`${r.programId}:${r.contentId}:${idx}`}>
                        {r.contentType ?? 'COURSE'} ·{' '}
                        {typeof r.overallProgress === 'number'
                          ? `${Math.round(r.overallProgress * 100)}%`
                          : '—'}
                        {r.isCompleted ? ' ✓' : ''}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {data.coursera.gradebookReports.length > 0 && (
                <div style={{ marginTop: '0.35rem' }}>
                  <div style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>
                    gradebookReports ({data.coursera.gradebookReports.length})
                  </div>
                  <ul
                    style={{
                      margin: '0.2rem 0 0 1rem',
                      padding: 0,
                      fontSize: '0.8125rem',
                      maxHeight: '6rem',
                      overflowY: 'auto',
                    }}
                  >
                    {data.coursera.gradebookReports.slice(0, 6).map((r, idx) => (
                      <li key={`${r.programId}:${r.courseId}:${idx}`}>
                        {r.collectionName || r.courseId} · {Math.round(r.overallProgress * 100)}% ·{' '}
                        {r.approxTotalLearningHrs.toFixed(1)}h
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* xAPI activity */}
            <div style={cardStyle}>
              <span style={cardTitleStyle}>xAPI activity</span>
              <div style={{ fontSize: '1.4rem', fontWeight: 700 }}>{data.xapiActivity.statementCount}</div>
              <div style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>
                statements received
              </div>
              <div style={{ fontSize: '0.85rem' }}>
                Latest: {fmt(data.xapiActivity.latestStatementAt)}
              </div>
              <div style={{ fontSize: '0.85rem' }}>
                Unprocessed: <strong>{data.xapiActivity.unprocessedCount}</strong>
              </div>
            </div>
          </div>

          {/* Diagnosis callout */}
          <div
            style={{
              padding: '0.85rem 1rem',
              border: '1px solid var(--outline-variant)',
              borderRadius: '0.75rem',
              background: 'var(--surface-container)',
              display: 'grid',
              gap: '0.4rem',
            }}
          >
            <span
              style={{
                fontSize: '0.8125rem',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                fontWeight: 700,
                color: 'var(--color-on-surface-variant)',
              }}
            >
              Diagnosis
            </span>
            {data.diagnosis.length === 0 ? (
              <span style={{ fontSize: '0.85rem', color: 'var(--color-on-surface-variant)' }}>
                No diagnosis lines were generated.
              </span>
            ) : (
              <ul style={{ margin: 0, paddingLeft: '1.1rem', display: 'grid', gap: '0.25rem' }}>
                {data.diagnosis.map((line, idx) => (
                  <li key={idx} style={{ fontSize: '0.9rem', lineHeight: 1.45 }}>
                    {line}
                  </li>
                ))}
              </ul>
            )}

            {(showAddAction || showSyncAction) && (
              <div style={{ marginTop: '0.35rem', display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                {showAddAction && (
                  <button
                    type="button"
                    onClick={handleAddToWap}
                    disabled={adding}
                    style={adding ? btnDisabledStyle : btnSecondaryStyle}
                  >
                    {adding ? 'Adding…' : 'Add to WorkforceAP'}
                  </button>
                )}
                {showSyncAction && (
                  <button
                    type="button"
                    onClick={handleSyncFromCoursera}
                    disabled={syncing}
                    style={syncing ? btnDisabledStyle : btnSecondaryStyle}
                  >
                    {syncing ? 'Syncing…' : 'Sync from Coursera'}
                  </button>
                )}
                {addResult && (
                  <span
                    role={addResult.ok ? 'status' : 'alert'}
                    style={{
                      fontSize: '0.85rem',
                      color: addResult.ok ? 'rgb(22, 163, 74)' : 'rgb(190, 18, 60)',
                    }}
                  >
                    {addResult.ok ? '✓' : '✗'} {addResult.message}
                  </span>
                )}
                {syncResult && (
                  <span
                    role={syncResult.ok ? 'status' : 'alert'}
                    style={{
                      fontSize: '0.85rem',
                      color: syncResult.ok ? 'rgb(22, 163, 74)' : 'rgb(190, 18, 60)',
                    }}
                  >
                    {syncResult.ok ? '✓' : '✗'} {syncResult.message}
                    {syncResult.ok && syncResult.detail && syncResult.detail.droppedNoMapping.length > 0 && (
                      <span
                        style={{
                          display: 'block',
                          marginTop: '0.2rem',
                          color: 'var(--color-on-surface-variant)',
                          fontSize: '0.8125rem',
                        }}
                      >
                        Dropped (no catalog mapping): {syncResult.detail.droppedNoMapping
                          .slice(0, 4)
                          .map((d) => d.courseraContentId)
                          .join(', ')}
                        {syncResult.detail.droppedNoMapping.length > 4
                          ? ` +${syncResult.detail.droppedNoMapping.length - 4} more`
                          : ''}
                      </span>
                    )}
                    {syncResult.ok && syncResult.detail && syncResult.detail.learningPaths.length > 0 && (
                      <span
                        data-testid="coursera-sync-learning-paths"
                        style={{
                          display: 'block',
                          marginTop: '0.2rem',
                          color: 'var(--color-on-surface-variant)',
                          fontSize: '0.8125rem',
                        }}
                      >
                        Learning Paths (program-level progress):{' '}
                        {syncResult.detail.learningPaths
                          .map(
                            (path) =>
                              `${path.name} → ${path.programSlug ?? 'no WAP program yet'}${
                                path.overallProgress == null ? '' : ` (${Math.round(path.overallProgress)}%)`
                              }`,
                          )
                          .join('; ')}
                      </span>
                    )}
                  </span>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
