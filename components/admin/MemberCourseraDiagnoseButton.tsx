'use client';

import { useState, useTransition } from 'react';
import {
  diagnoseMemberCoursera,
  type CourseraDiagnoseReport,
} from '@/lib/admin/diagnoseMemberCoursera';
import DataTable from '@/components/portal/ui/DataTable';

// Colors match the semantic success/warning/error palette used elsewhere in
// the Coursera admin surface (e.g. StatusBadge success = rgb(22,163,74)).
const STATUS_COLORS: Record<'ok' | 'warn' | 'fail', { bg: string; fg: string; border: string }> = {
  ok: { bg: 'rgba(34,197,94,0.1)', fg: 'rgb(22,163,74)', border: 'rgba(34,197,94,0.4)' },
  warn: { bg: 'rgba(234,179,8,0.12)', fg: 'rgb(217,119,6)', border: 'rgba(234,179,8,0.5)' },
  fail: { bg: 'rgba(239,68,68,0.12)', fg: 'rgb(220,38,38)', border: 'rgba(239,68,68,0.5)' },
};

function formatWhen(value: Date | string | null): string {
  return value ? new Date(value).toLocaleString() : 'Never recorded';
}

export default function MemberCourseraDiagnoseButton({ memberId }: { memberId: string }) {
  const [report, setReport] = useState<CourseraDiagnoseReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const run = () => {
    setError(null);
    startTransition(async () => {
      try {
        const result = await diagnoseMemberCoursera(memberId);
        setReport(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Diagnose failed');
      }
    });
  };

  return (
    <div style={{ marginTop: '0.75rem' }}>
      <button
        type="button"
        onClick={run}
        disabled={isPending}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.4rem',
          fontSize: '0.85rem',
          fontWeight: 600,
          padding: '0.5rem 0.85rem',
          borderRadius: '0.4rem',
          border: '1px solid var(--outline-variant)',
          background: 'var(--surface-container-low)',
          color: 'var(--color-on-surface)',
          cursor: isPending ? 'wait' : 'pointer',
        }}
      >
        {isPending ? 'Running diagnostic…' : report ? 'Re-run diagnostic' : 'Diagnose Coursera connection'}
      </button>

      {error ? (
        <p role="alert" style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: 'rgb(153,27,27)' }}>
          {error}
        </p>
      ) : null}

      {report && !report.ok ? (
        <p role="alert" style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: 'rgb(153,27,27)' }}>
          {report.error}
        </p>
      ) : null}

      {report && report.ok ? (
        <div style={{ marginTop: '0.75rem', display: 'grid', gap: '0.5rem' }}>
          {report.verdict.map((item, i) => {
            const colors = STATUS_COLORS[item.status];
            return (
              <div
                key={i}
                style={{
                  padding: '0.6rem 0.75rem',
                  borderRadius: '0.4rem',
                  border: `1px solid ${colors.border}`,
                  background: colors.bg,
                  color: colors.fg,
                }}
              >
                <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 700 }}>{item.title}</p>
                <p style={{ margin: '0.2rem 0 0', fontSize: '0.8125rem' }}>{item.detail}</p>
              </div>
            );
          })}

          <div style={{ marginTop: '0.25rem' }}>
            <p style={{ margin: '0 0 0.3rem', fontSize: '0.8125rem', fontWeight: 700, color: 'var(--color-on-surface-variant)' }}>
              Sync freshness
            </p>
            {report.freshness ? (
              <dl
                style={{
                  margin: 0,
                  display: 'grid',
                  gridTemplateColumns: 'minmax(11rem, max-content) 1fr',
                  rowGap: '0.25rem',
                  columnGap: '1rem',
                  fontSize: '0.8125rem',
                }}
              >
                <dt style={{ color: 'var(--color-on-surface-variant)' }}>Last B4B sync (organization)</dt>
                <dd style={{ margin: 0 }}>{formatWhen(report.freshness.orgLastB4BSyncAt)}</dd>
                <dt style={{ color: 'var(--color-on-surface-variant)' }}>Last row for this learner</dt>
                <dd style={{ margin: 0 }}>
                  {formatWhen(report.freshness.memberLastSyncAt)}
                  {report.freshness.memberLastSyncSource ? ` · ${report.freshness.memberLastSyncSource}` : ''}
                </dd>
                <dt style={{ color: 'var(--color-on-surface-variant)' }}>Last xAPI event received</dt>
                <dd style={{ margin: 0 }}>{formatWhen(report.freshness.lastXapiReceivedAt)}</dd>
                <dt style={{ color: 'var(--color-on-surface-variant)' }}>Last learner activity</dt>
                <dd style={{ margin: 0 }}>{formatWhen(report.freshness.lastLearnerActivityAt)}</dd>
              </dl>
            ) : (
              <p style={{ margin: 0, fontSize: '0.8125rem' }}>Unavailable: the freshness reads failed.</p>
            )}
          </div>

          <details style={{ marginTop: '0.25rem' }}>
            <summary style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', cursor: 'pointer' }}>
              Raw diagnostic numbers
            </summary>
            <dl
              style={{
                marginTop: '0.5rem',
                display: 'grid',
                gridTemplateColumns: 'minmax(11rem, max-content) 1fr',
                rowGap: '0.25rem',
                columnGap: '1rem',
                fontSize: '0.8125rem',
              }}
            >
              <dt style={{ color: 'var(--color-on-surface-variant)' }}>xAPI events (this learner)</dt>
              <dd style={{ margin: 0 }}>
                {report.xapi.totalForActor} total · {report.xapi.processedForActor} processed ·{' '}
                {report.xapi.ignoredForActor} ignored · {report.xapi.erroredForActor} errored
              </dd>
              <dt style={{ color: 'var(--color-on-surface-variant)' }}>CourseProgress rows</dt>
              <dd style={{ margin: 0 }}>{report.canonical.courseProgressRows}</dd>
              <dt style={{ color: 'var(--color-on-surface-variant)' }}>CourseraCourseProgress rows</dt>
              <dd style={{ margin: 0 }}>{report.canonical.courseraCourseProgressRows}</dd>
              <dt style={{ color: 'var(--color-on-surface-variant)' }}>CourseraBadgeProgress rows</dt>
              <dd style={{ margin: 0 }}>{report.canonical.courseraBadgeProgressRows}</dd>
              <dt style={{ color: 'var(--color-on-surface-variant)' }}>Canonical mappings (org-wide)</dt>
              <dd style={{ margin: 0 }}>{report.canonical.canonicalMappingsTotal}</dd>
              <dt style={{ color: 'var(--color-on-surface-variant)' }}>Identity mappings</dt>
              <dd style={{ margin: 0 }}>
                {report.identityMappings.length === 0
                  ? '—'
                  : report.identityMappings
                      .map((m) => `${m.courseraEmail || m.actorIdentifier || '?'} (${m.source})`)
                      .join(', ')}
              </dd>
              <dt style={{ color: 'var(--color-on-surface-variant)' }}>Canonical program</dt>
              <dd style={{ margin: 0 }}>
                {report.user.canonicalProgram ?? '—'}
                {report.user.canonicalProgram && !report.user.enrolledProgram ? ' (legacy pointer empty)' : ''}
              </dd>
              <dt style={{ color: 'var(--color-on-surface-variant)' }}>Enrollments</dt>
              <dd style={{ margin: 0 }}>
                {report.enrollments.length === 0
                  ? '—'
                  : report.enrollments
                      .map((e) => `${e.programSlug}${e.isPrimary ? ' (primary)' : ''}`)
                      .join(', ')}
              </dd>
            </dl>

            {report.xapi.latestIgnored.length > 0 ? (
              <div style={{ marginTop: '0.6rem' }}>
                <p style={{ margin: '0 0 0.3rem', fontSize: '0.8125rem', fontWeight: 700, color: 'var(--color-on-surface-variant)' }}>
                  Latest ignored xAPI events
                </p>
                <ul style={{ margin: 0, paddingLeft: '1rem', fontSize: '0.8125rem' }}>
                  {report.xapi.latestIgnored.map((ev, i) => (
                    <li key={i}>
                      <code>{ev.courseSlug ?? '(no course slug)'}</code> · {ev.verbId.split('/').pop()} ·{' '}
                      {new Date(ev.receivedAt).toLocaleString()}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {report.reconciliation.length > 0 ? (
              <div style={{ marginTop: '0.75rem', display: 'grid', gap: '0.75rem' }}>
                <p style={{ margin: 0, fontSize: '0.8125rem', fontWeight: 700, color: 'var(--color-on-surface-variant)' }}>
                  Validated Coursera reconciliation
                </p>
                {report.reconciliation.map((program) => (
                  <div key={program.programSlug} style={{ overflowX: 'auto' }}>
                    <p style={{ margin: '0 0 0.3rem', fontSize: '0.8125rem', fontWeight: 700 }}>
                      {program.programSlug}: {program.completedCount}/{program.totalCourses} · {program.programPercent}%
                    </p>
                    <DataTable
                      rows={program.rows}
                      rowKey={(row) => row.courseSlug}
                      density="compact"
                      columns={[
                        {
                          key: 'course',
                          header: 'Course',
                          cell: (row) => <code>{row.courseSlug}</code>,
                        },
                        {
                          key: 'b4b',
                          header: 'B4B',
                          align: 'right',
                          cell: (row) => row.b4bPercent == null ? '—' : `${row.b4bPercent}%`,
                        },
                        {
                          key: 'local',
                          header: 'Local',
                          align: 'right',
                          cell: (row) => row.localPercent == null ? '—' : `${row.localPercent}%`,
                        },
                        {
                          key: 'display',
                          header: 'Display',
                          align: 'right',
                          cell: (row) => `${row.displayPercent}%${row.displayCompleted ? ' ✓' : ''}`,
                        },
                        {
                          key: 'drift',
                          header: 'Drift',
                          cell: (row) => row.drift,
                        },
                      ]}
                    />
                  </div>
                ))}
              </div>
            ) : null}
          </details>
        </div>
      ) : null}
    </div>
  );
}
