import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { resolveAdminPageTenant, withAdminPageScope, inheritUserOrg, inheritMemberOrg, inheritLeaderOrg, inheritInvitedByOrg } from '@/lib/tenant/adminPageScope';
import { prisma } from '@/lib/db/prisma';
import { FUNNEL_DEFINITIONS } from '@/lib/events/catalog';
import { recordWorkflowDiagnostic } from '@/lib/diagnostics';
import { isReadOnlyPortalAuditHeader } from '@/lib/audit/readOnlyPortalAudit';
import PageHeader from '@/components/portal/PageHeader';
import DataTable from '@/components/portal/ui/DataTable';
import {
  DiagnosticsKit,
  type DiagnosticTile,
} from '@/components/portal/kit/pages/admin-subviews/DiagnosticsKit';

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadataAsync({
  title: 'Admin diagnostics',
  description: 'Recent workflow diagnostics for imports, recommendations, and review queues.',
  path: '/admin/diagnostics',
});
}

const STATUS_COLOR: Record<string, string> = {
  ok: 'rgba(74,155,79,0.12)',
  success: 'rgba(74,155,79,0.12)',
  inspection: 'rgba(43,123,185,0.1)',
  fallback: 'rgba(255,187,0,0.1)',
  fallback_used: 'rgba(255,187,0,0.1)',
  warn: 'rgba(255,187,0,0.1)',
  error: 'rgba(173,44,77,0.1)',
  errored: 'rgba(173,44,77,0.1)',
  failed: 'rgba(173,44,77,0.1)',
};

const STATUS_TEXT_COLOR: Record<string, string> = {
  ok: 'var(--color-green, #4a9b4f)',
  success: 'var(--color-green, #4a9b4f)',
  inspection: 'var(--color-blue, #2b7bb9)',
  fallback: 'var(--color-gold)',
  fallback_used: 'var(--color-gold)',
  warn: 'var(--color-gold)',
  error: 'var(--color-accent)',
  errored: 'var(--color-accent)',
  failed: 'var(--color-accent)',
};

function statusIcon(status: string): string {
  if (status === 'ok' || status === 'success') return 'check_circle';
  if (status === 'inspection') return 'search';
  if (status === 'fallback' || status === 'fallback_used' || status === 'warn') return 'warning';
  return 'error';
}

type DiagnosticRow = Awaited<ReturnType<typeof prisma.workflowDiagnostic.findMany>>[number];

function DiagnosticsCards({ rows, emptyText }: { rows: DiagnosticRow[]; emptyText?: string }) {
  if (rows.length === 0) {
    return <p style={{ color: 'var(--color-on-surface-variant)', fontSize: '0.875rem' }}>{emptyText ?? 'No diagnostics captured yet.'}</p>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {rows.map((row) => {
        const bg = STATUS_COLOR[row.status] ?? 'var(--surface-container-low)';
        const textColor = STATUS_TEXT_COLOR[row.status] ?? 'var(--color-on-surface-variant)';
        const icon = statusIcon(row.status);
        return (
          <div key={row.id} className="portal-card portal-card--flat" style={{ padding: '0.875rem 1rem' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.875rem' }}>
              {/* Status icon */}
              <div style={{ width: '2rem', height: '2rem', borderRadius: '0.5rem', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '0.125rem' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '1rem', color: textColor, fontVariationSettings: "'FILL' 1" }}>{icon}</span>
              </div>
              {/* Content */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.25rem' }}>
                  <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--color-on-surface)' }}>
                    {row.workflow}
                  </span>
                  <span style={{ fontSize: '0.8125rem', fontWeight: 800, padding: '0.1rem 0.4rem', borderRadius: '9999px', background: bg, color: textColor, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    {row.status}
                  </span>
                  {row.provider && (
                    <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-on-surface-variant)', background: 'var(--surface-container)', padding: '0.1rem 0.35rem', borderRadius: '0.25rem' }}>
                      {row.provider}
                    </span>
                  )}
                  {row.method && (
                    <span style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>via {row.method}</span>
                  )}
                </div>
                {row.summary && (
                  <p style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', margin: '0 0 0.25rem', lineHeight: 1.45 }}>{row.summary}</p>
                )}
                {(row.fallbackPath || row.failureReason) && (
                  <p style={{ fontSize: '0.8125rem', color: 'var(--color-accent)', margin: '0 0 0.25rem' }}>
                    {[row.fallbackPath, row.failureReason].filter(Boolean).join(' · ')}
                  </p>
                )}
                {row.metadata && (
                  <details style={{ marginTop: '0.25rem' }}>
                    <summary style={{ cursor: 'pointer', fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', fontWeight: 600 }}>Metadata</summary>
                    <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', marginTop: '0.375rem', lineHeight: 1.4, maxHeight: '200px', overflowY: 'auto', background: 'var(--surface-container-lowest)', padding: '0.5rem', borderRadius: '0.375rem' }}>
                      {JSON.stringify(row.metadata, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
              {/* Timestamp */}
              <span style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', flexShrink: 0, whiteSpace: 'nowrap' }}>
                {row.createdAt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                <br />
                <span style={{ fontSize: '0.8125rem' }}>{row.createdAt.toLocaleDateString()}</span>
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Workflows whose diagnostics indicate email-delivery health. */
const EMAIL_WORKFLOWS = [
  'email_send',
  'cron_weekly_recap',
  'cron_weekly_recap_email',
  'cron_partner_digest',
  'cron_inactive_nudge',
  'cron_inactivity_nudge',
  'cron_applicant_followup',
  'cron_milestone_celebration',
];

/** Workflows whose diagnostics indicate integration / data-sync health. */
const INTEGRATION_WORKFLOWS = [
  'employer_import_single',
  'employer_import_bulk',
  'employer_job_live_auto_match',
  'xapi_ingestion',
];

const ERROR_STATUSES = ['error', 'errored', 'failed'];
const WARN_STATUSES = ['warn', 'fallback', 'fallback_used'];

/**
 * Derive an honest tile status from a window of recorded diagnostics for a
 * subsystem. No measurements → muted "—" (we don't fabricate "healthy").
 */
function deriveSubsystemTile(
  name: string,
  iconKey: DiagnosticTile['iconKey'],
  rows: { status: string }[],
): DiagnosticTile {
  if (rows.length === 0) {
    return { name, iconKey, status: 'No recent activity', tone: 'muted' };
  }
  const errors = rows.filter((r) => ERROR_STATUSES.includes(r.status)).length;
  const warns = rows.filter((r) => WARN_STATUSES.includes(r.status)).length;
  if (errors > 0) {
    return { name, iconKey, status: `Degraded · ${errors} error${errors === 1 ? '' : 's'}`, tone: 'alert' };
  }
  if (warns > 0) {
    return { name, iconKey, status: `Fallbacks · ${warns}`, tone: 'warn' };
  }
  return { name, iconKey, status: 'Healthy', tone: 'ok' };
}

export default async function AdminDiagnosticsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/admin/diagnostics');
  const scope = await resolveAdminPageTenant(user.id);
  if (!scope.ok) redirect('/dashboard');

  const readOnlyAudit = isReadOnlyPortalAuditHeader(await headers());
  if (!readOnlyAudit) {
    await recordWorkflowDiagnostic({
      workflow: 'admin_diagnostics',
      status: 'inspection',
      actorUserId: user.id,
      summary: 'Admin opened diagnostics view',
      method: 'page_load',
    });
  }

  const params = (await searchParams) ?? {};
  const requestedUi = typeof params.ui === 'string' ? params.ui : null;

  // ---------------------------------------------------------------------------
  // LEGACY: the full workflow-log triage view (errors, drift, funnels, logs).
  // Kept verbatim behind ?ui=legacy as the escape hatch.
  // ---------------------------------------------------------------------------
  if (requestedUi === 'legacy') {
    const [recentDiagnostics, recentImports, recentRecommendations, enrolledUsersForDrift] = await Promise.all([
      prisma.workflowDiagnostic.findMany({ orderBy: { createdAt: 'desc' }, take: 50 }),
      prisma.workflowDiagnostic.findMany({ where: { workflow: { startsWith: 'employer_import' } }, orderBy: { createdAt: 'desc' }, take: 10 }),
      prisma.workflowDiagnostic.findMany({ where: { workflow: { in: ['admin_job_matches', 'admin_match_suggestions'] } }, orderBy: { createdAt: 'desc' }, take: 10 }),
      withAdminPageScope(scope, (db) => db.user.findMany({
        where: { enrolledProgram: { not: null }, deletedAt: null },
        select: {
          id: true,
          fullName: true,
          enrolledProgram: true,
          courseEnrollments: {
            where: { isPrimary: true },
            select: { programSlug: true },
            take: 1,
          },
        },
        take: 500,
      })),
    ]);

    const driftRecords = enrolledUsersForDrift.filter((u) => {
      const primary = u.courseEnrollments[0] ?? null;
      return !primary || u.enrolledProgram !== primary.programSlug;
    });

    const statusCounts = recentDiagnostics.reduce<Record<string, number>>((acc, d) => {
      acc[d.status] = (acc[d.status] ?? 0) + 1;
      return acc;
    }, {});
    const errorCount = (statusCounts['error'] ?? 0) + (statusCounts['errored'] ?? 0) + (statusCounts['failed'] ?? 0);
    const warnCount =
      (statusCounts['warn'] ?? 0) + (statusCounts['fallback'] ?? 0) + (statusCounts['fallback_used'] ?? 0);
    const okCount = (statusCounts['ok'] ?? 0) + (statusCounts['success'] ?? 0);

    return (
      <div>
        <PageHeader
          title="Diagnostics"
          subtitle="Trace brittle workflows, fallback paths, and likely abandonment moments across key admin workflows."
        />

        {/* Summary metric strip */}
        <div className="portal-metric-strip" style={{ marginBottom: '1.5rem' }}>
          <div className="portal-metric-card">
            <div className="portal-metric-card__icon-wrap portal-metric-card__icon-wrap--accent">
              <span className="material-symbols-outlined" style={{ fontSize: '1rem', fontVariationSettings: "'FILL' 1" }}>error</span>
            </div>
            <p className="portal-metric-card__value" style={{ color: errorCount > 0 ? 'var(--color-accent)' : undefined }}>{errorCount}</p>
            <p className="portal-metric-card__label">Errors</p>
          </div>
          <div className="portal-metric-card">
            <div className="portal-metric-card__icon-wrap portal-metric-card__icon-wrap--gold">
              <span className="material-symbols-outlined" style={{ fontSize: '1rem', fontVariationSettings: "'FILL' 1" }}>warning</span>
            </div>
            <p className="portal-metric-card__value">{warnCount}</p>
            <p className="portal-metric-card__label">Warnings</p>
          </div>
          <div className="portal-metric-card">
            <div className="portal-metric-card__icon-wrap portal-metric-card__icon-wrap--green">
              <span className="material-symbols-outlined" style={{ fontSize: '1rem', fontVariationSettings: "'FILL' 1" }}>check_circle</span>
            </div>
            <p className="portal-metric-card__value">{okCount}</p>
            <p className="portal-metric-card__label">Success</p>
          </div>
          <div className="portal-metric-card">
            <div className="portal-metric-card__icon-wrap portal-metric-card__icon-wrap--blue">
              <span className="material-symbols-outlined" style={{ fontSize: '1rem', fontVariationSettings: "'FILL' 1" }}>sync_problem</span>
            </div>
            <p className="portal-metric-card__value" style={{ color: driftRecords.length > 0 ? 'var(--color-accent)' : undefined }}>{driftRecords.length}</p>
            <p className="portal-metric-card__label">Drift Issues</p>
          </div>
        </div>

        {/* Recent errors triage list — only shown when errors exist (audit #84). */}
        {errorCount > 0 ? (
          <section style={{ marginBottom: '1.5rem' }}>
            <div className="portal-dash-section-header">
              <h2 className="portal-heading-with-bar portal-section-heading" style={{ margin: 0, color: 'var(--color-accent)' }}>
                Recent errors <span style={{ marginLeft: '0.5rem', fontSize: '0.8125rem', fontWeight: 700, color: 'var(--color-accent)' }}>({errorCount})</span>
              </h2>
            </div>
            <DiagnosticsCards
              rows={recentDiagnostics
                .filter((r) => r.status === 'error' || r.status === 'errored' || r.status === 'failed')
                .slice(0, 10)}
              emptyText="No recent errors."
            />
          </section>
        ) : null}

        {/* Enrollment drift */}
        <section style={{ marginBottom: '1.5rem' }}>
          <div className="portal-dash-section-header">
            <h2 className="portal-heading-with-bar portal-section-heading" style={{ margin: 0 }}>
              Enrollment Drift {driftRecords.length > 0 ? <span style={{ marginLeft: '0.5rem', fontSize: '0.8125rem', fontWeight: 700, color: 'var(--color-accent)' }}>({driftRecords.length} issues)</span> : null}
            </h2>
          </div>
          {driftRecords.length === 0 ? (
            <div className="portal-card portal-card--flat portal-card--padded" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span className="material-symbols-outlined" style={{ color: 'var(--color-green)', fontSize: '1.25rem' }}>check_circle</span>
              <span style={{ fontSize: '0.875rem', color: 'var(--color-on-surface)' }}>
                No enrollment drift detected. User.enrolledProgram and CourseEnrollment are in sync for all {enrolledUsersForDrift.length} enrolled members.
              </span>
            </div>
          ) : (
            <div className="portal-card portal-card--flat" style={{ overflow: 'auto' }}>
              <DataTable
                variant="admin"
                tableClassName="dashboard-table"
                scrollX={false}
                rows={driftRecords.slice(0, 25)}
                rowKey={(u) => u.id}
                columns={[
                  {
                    key: 'member',
                    header: 'Member',
                    cell: (u) => (
                      <a
                        href={`/admin/members/${u.id}/lifecycle`}
                        style={{ color: 'var(--color-accent)', textDecoration: 'none', fontWeight: 600 }}
                      >
                        {u.fullName ?? u.id}
                      </a>
                    ),
                  },
                  {
                    key: 'enrolled',
                    header: 'User.enrolledProgram',
                    cell: (u) => (
                      <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: '0.8125rem' }}>{u.enrolledProgram}</span>
                    ),
                  },
                  {
                    key: 'ce',
                    header: 'CourseEnrollment',
                    cell: (u) => (
                      <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: '0.8125rem' }}>
                        {u.courseEnrollments[0]?.programSlug ?? '—'}
                      </span>
                    ),
                  },
                  {
                    key: 'issue',
                    header: 'Issue',
                    cell: (u) => (
                      <span
                        style={{
                          fontSize: '0.8125rem',
                          fontWeight: 700,
                          padding: '0.15rem 0.5rem',
                          borderRadius: '9999px',
                          background: 'rgba(173,44,77,0.1)',
                          color: 'var(--color-accent)',
                        }}
                      >
                        {!u.courseEnrollments[0] ? 'No primary record' : 'Slug mismatch'}
                      </span>
                    ),
                  },
                ]}
              />
              {driftRecords.length > 25 ? (
                <p style={{ margin: '0.75rem 0 0', fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>
                  Showing 25 of {driftRecords.length} drift issues.{' '}
                  <a href="/api/admin/lifecycle/drift" style={{ color: 'var(--color-accent)', fontWeight: 600 }}>
                    View full results (JSON)
                  </a>
                </p>
              ) : null}
            </div>
          )}
        </section>

        {/* Key funnels — collapsible */}
        <section style={{ marginBottom: '1.5rem' }}>
          <details>
            <summary style={{ cursor: 'pointer', padding: '0.875rem 0', fontWeight: 700, fontSize: '0.9375rem', color: 'var(--color-on-surface)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '1.125rem', color: 'var(--color-accent)', fontVariationSettings: "'FILL' 1" }}>funnel</span>
              Key Funnels &amp; Signals
            </summary>
            <div style={{ display: 'grid', gap: '0.625rem', marginTop: '0.75rem' }}>
              {FUNNEL_DEFINITIONS.map((funnel) => (
                <div key={funnel.funnel} className="portal-card portal-card--flat" style={{ padding: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                    <div style={{ padding: '0.2rem 0.5rem', borderRadius: '9999px', background: 'rgba(173,44,77,0.1)', fontSize: '0.8125rem', fontWeight: 800, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: 'var(--color-accent)', flexShrink: 0 }}>
                      {funnel.audience}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--color-on-surface)', margin: '0 0 0.5rem' }}>{funnel.funnel}</p>
                      <p style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', margin: '0 0 0.25rem' }}>
                        <strong style={{ color: 'var(--color-on-surface)' }}>Steps:</strong> {funnel.steps.join(' → ')}
                      </p>
                      <p style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', margin: '0 0 0.25rem' }}>
                        <strong style={{ color: 'var(--color-on-surface)' }}>Outcomes:</strong> {funnel.outcomes.join(' · ')}
                      </p>
                      <p style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', margin: 0 }}>
                        <strong style={{ color: 'var(--color-accent)' }}>⚠ Signals:</strong> {funnel.confusionSignals.join(' · ')}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </details>
        </section>

        {/* Import diagnostics */}
        <section style={{ marginBottom: '1.5rem' }}>
          <div className="portal-dash-section-header">
            <h2 className="portal-heading-with-bar portal-section-heading" style={{ margin: 0 }}>Import Diagnostics</h2>
          </div>
          <DiagnosticsCards rows={recentImports} emptyText="No import diagnostics yet." />
        </section>

        {/* Recommendation diagnostics */}
        <section style={{ marginBottom: '1.5rem' }}>
          <div className="portal-dash-section-header">
            <h2 className="portal-heading-with-bar portal-section-heading" style={{ margin: 0 }}>Recommendation Diagnostics</h2>
          </div>
          <DiagnosticsCards rows={recentRecommendations} emptyText="No recommendation diagnostics yet." />
        </section>

        {/* Full workflow log */}
        <section>
          <div className="portal-dash-section-header">
            <h2 className="portal-heading-with-bar portal-section-heading" style={{ margin: 0 }}>Latest Workflow Log</h2>
            <span style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>Last 50 entries</span>
          </div>
          <DiagnosticsCards rows={recentDiagnostics} />
        </section>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // DEFAULT: design-kit "Live system diagnostics" — 4 status tiles + note.
  // Every tile is derived from REAL measurements (DB ping + recent diagnostic
  // counts in a 24h window). Nothing is fabricated; an unmeasured subsystem
  // surfaces an honest muted "No recent activity".
  // ---------------------------------------------------------------------------
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // DB health is measured by a lean ping; if the surrounding diagnostic query
  // throws we treat the database tile as unreachable.
  let dbOk = true;
  let emailRows: { status: string }[] = [];
  let integrationRows: { status: string }[] = [];
  let emailReadFailed = false;
  let integrationReadFailed = false;

  try {
    // Cheap liveness ping — proves the pooler answers.
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    dbOk = false;
  }

  if (dbOk) {
    const [emailResult, integrationResult] = await Promise.allSettled([
      prisma.workflowDiagnostic.findMany({
        where: { workflow: { in: EMAIL_WORKFLOWS }, createdAt: { gte: since } },
        select: { status: true },
        take: 500,
      }),
      prisma.workflowDiagnostic.findMany({
        where: { workflow: { in: INTEGRATION_WORKFLOWS }, createdAt: { gte: since } },
        select: { status: true },
        take: 500,
      }),
    ]);
    if (emailResult.status === 'fulfilled') emailRows = emailResult.value;
    else emailReadFailed = true;
    if (integrationResult.status === 'fulfilled') integrationRows = integrationResult.value;
    else integrationReadFailed = true;
  } else {
    emailReadFailed = true;
    integrationReadFailed = true;
  }

  const tiles: DiagnosticTile[] = [
    // App: this request reached the server and authorized an admin, so the app
    // tier is provably serving.
    { name: 'App', iconKey: 'app', status: 'Operational', tone: 'ok' },
    dbOk
      ? { name: 'Database', iconKey: 'database', status: 'Healthy', tone: 'ok' }
      : { name: 'Database', iconKey: 'database', status: 'Unreachable', tone: 'alert' },
    emailReadFailed
      ? { name: 'Email Queue', iconKey: 'email', status: 'Unavailable', tone: 'alert' }
      : deriveSubsystemTile('Email Queue', 'email', emailRows),
    integrationReadFailed
      ? { name: 'Integrations', iconKey: 'integrations', status: 'Unavailable', tone: 'alert' }
      : deriveSubsystemTile('Integrations', 'integrations', integrationRows),
  ];

  const allHealthy = tiles.every((t) => t.tone === 'ok');
  const note = emailReadFailed || integrationReadFailed
    ? 'Some diagnostic records could not be read. Unavailable means the measurement failed; it does not mean there was no activity or that delivery succeeded. Reload to retry, or check the per-workflow log (?ui=legacy).'
    : allHealthy
    ? 'All measured subsystems are reporting healthy. App and database checks are live; email and integration status reflect recorded workflow diagnostics from the last 24 hours. For the full per-workflow log, error triage, and enrollment-drift checks, open the legacy view (?ui=legacy).'
    : 'One or more subsystems need attention. Email and integration tiles are derived from recorded workflow diagnostics over the last 24 hours — drill into the legacy view (?ui=legacy) for the per-workflow log, error triage, and fallback paths.';

  return (
    <DiagnosticsKit
      tiles={tiles}
      note={note}
      noteCaption="App + database measured live this request · email/integrations over the last 24h"
    />
  );
}
