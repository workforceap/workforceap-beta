import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { resolveAdminPageTenant, withAdminPageScope, inheritUserOrg, inheritMemberOrg, inheritLeaderOrg, inheritInvitedByOrg } from '@/lib/tenant/adminPageScope';
import PageHeader from '@/components/portal/PageHeader';
import { prisma } from '@/lib/db/prisma';
import AdminCronsClient from '@/components/admin/AdminCronsClient';
import { CRON_EXPRESSION_BY_JOB, CRON_SCHEDULE_BY_JOB } from '@/lib/admin/cronScheduleKey';
import { cronFreshness } from '@/lib/cron/cronFreshness';
import { DesignSurface } from '@/components/portal/kit';
import {
  CronsMonitorKit,
  type CronJobRow,
  type CronDisplayStatus,
} from '@/components/portal/kit/pages/admin-subviews/CronsMonitorKit';

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadataAsync({
    title: 'Cron monitoring',
    description: 'Monitor cron job executions, success rates, and failures.',
    path: '/admin/crons',
  });
}

/** Most recent execution per distinct job we materialize for the dense board. */
const BOARD_LIMIT = 50;

const DISPLAY_STATUS: Record<string, CronDisplayStatus> = {
  SUCCESS: 'Success',
  FAILED: 'Failed',
  RUNNING: 'Running',
  SKIPPED: 'Disabled',
};

/**
 * Compact relative caption: "just now", "3m ago", "3h ago", "2d ago", …
 * Matches the format used by /admin/email-crons (timeAgo()) so the two
 * cron-monitoring dashboards read consistently.
 */
function relativeTime(date: Date | null): string {
  if (!date) return '—';
  const diffMs = Date.now() - new Date(date).getTime();
  if (diffMs < 0) return 'just now';
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hr = Math.floor(mins / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

/** "2.4s" / "180ms" / "—" from durationMs. */
function formatDuration(ms: number | null): string {
  if (ms == null) return '—';
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

export default async function AdminCronsPage({
  searchParams,
}: {
  searchParams: Promise<{ ui?: string }>;
}) {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/admin/crons');
  const scope = await resolveAdminPageTenant(user.id);
  if (!scope.ok) redirect('/dashboard');

  const { ui } = await searchParams;

  if (ui !== 'legacy') {
    return renderKit();
  }

  return renderLegacy();
}

/** Design-kit default: one row per distinct cron job (its latest execution). */
async function renderKit() {
  // One grouped read by (jobName, status) gives each job's latest run, its
  // latest status and its last SUCCESS, however old; the recent slice only
  // supplies the latest run's duration. Jobs vercel.json schedules that have
  // no rows at all are merged in as "Never run".
  const [statusGroups, recent] = await Promise.all([
    prisma.cronExecution.groupBy({
      by: ['jobName', 'status'],
      _max: { startedAt: true },
    }),
    prisma.cronExecution.findMany({
      orderBy: { startedAt: 'desc' },
      take: 200,
      select: {
        jobName: true,
        status: true,
        startedAt: true,
        durationMs: true,
      },
    }),
  ]);

  type JobRuns = { lastRunAt: Date | null; lastStatus: string | null; lastSuccessAt: Date | null };
  const runsByJob = new Map<string, JobRuns>();
  for (const g of statusGroups) {
    const at = g._max.startedAt;
    const runs = runsByJob.get(g.jobName) ?? { lastRunAt: null, lastStatus: null, lastSuccessAt: null };
    if (at && (!runs.lastRunAt || at > runs.lastRunAt)) {
      runs.lastRunAt = at;
      runs.lastStatus = g.status;
    }
    if (g.status === 'SUCCESS') runs.lastSuccessAt = at;
    runsByJob.set(g.jobName, runs);
  }
  const jobsWithRuns = [...runsByJob.keys()];
  const neverRunJobs = Object.keys(CRON_EXPRESSION_BY_JOB).filter((job) => !runsByJob.has(job));

  // Latest execution row per job (from the recent slice), for its duration.
  const latestByJob = new Map<string, (typeof recent)[number]>();
  for (const exec of recent) {
    if (!latestByJob.has(exec.jobName)) latestByJob.set(exec.jobName, exec);
  }

  const now = new Date();
  const allRows: CronJobRow[] = [...jobsWithRuns, ...neverRunJobs].map((job) => {
    const runs = runsByJob.get(job) ?? { lastRunAt: null, lastStatus: null, lastSuccessAt: null };
    const latest = latestByJob.get(job);
    const status: CronDisplayStatus | null = runs.lastStatus ? DISPLAY_STATUS[runs.lastStatus] ?? 'Disabled' : null;
    return {
      id: job,
      job,
      // Captions come from vercel.json, keyed by the recorded jobName; a job
      // with no declared schedule (a manual run, a retired job) shows "—".
      schedule: CRON_SCHEDULE_BY_JOB[job] ?? '—',
      lastRun: relativeTime(runs.lastRunAt),
      duration: formatDuration(latest?.durationMs ?? null),
      status,
      freshness: cronFreshness({
        expr: CRON_EXPRESSION_BY_JOB[job] ?? null,
        lastSuccessAt: runs.lastSuccessAt,
        lastRunAt: runs.lastRunAt,
        now,
        // withCronLogging records SKIPPED when the job's toggle is off.
        enabled: runs.lastStatus !== 'SKIPPED',
      }),
      lastSuccess: relativeTime(runs.lastSuccessAt),
    };
  });

  // Flagged jobs first so the board limit can never hide them, then the
  // most recently run (groupBy returns no guaranteed order).
  const flagged = (r: CronJobRow) => r.freshness === 'overdue' || r.freshness === 'never_run';
  const lastRunMs = (r: CronJobRow) => runsByJob.get(r.job)?.lastRunAt?.getTime() ?? 0;
  allRows.sort(
    (a, b) => Number(flagged(b)) - Number(flagged(a)) || lastRunMs(b) - lastRunMs(a) || a.job.localeCompare(b.job),
  );

  const rows = allRows.slice(0, BOARD_LIMIT);

  const totalJobs = allRows.length;
  const enabled = allRows.filter((r) => r.status === 'Success').length;
  const failing = allRows.filter((r) => r.status === 'Failed').length;
  const overdue = allRows.filter((r) => r.freshness === 'overdue').length;
  const neverRun = allRows.filter((r) => r.freshness === 'never_run').length;
  const mostRecentRun = Math.max(0, ...allRows.map(lastRunMs));
  const lastRun = relativeTime(mostRecentRun ? new Date(mostRecentRun) : null);

  return (
    <DesignSurface surface="dense">
      <CronsMonitorKit
        jobs={rows}
        totalJobs={totalJobs}
        enabled={enabled}
        overdue={overdue}
        neverRun={neverRun}
        failing={failing}
        lastRun={lastRun}
      />
    </DesignSurface>
  );
}

/** Legacy execution-log workspace (preserved behind ?ui=legacy). */
async function renderLegacy() {
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [
    totalJobs,
    currentlyRunning,
    failedLast24h,
    successLast24h,
    avgDurationLast7d,
    recentExecutions,
    distinctJobNames,
  ] = await Promise.all([
    prisma.cronExecution.count(),
    prisma.cronExecution.count({ where: { status: 'RUNNING' } }),
    prisma.cronExecution.count({ where: { status: 'FAILED', startedAt: { gte: twentyFourHoursAgo } } }),
    prisma.cronExecution.count({ where: { status: 'SUCCESS', startedAt: { gte: twentyFourHoursAgo } } }),
    prisma.cronExecution.aggregate({
      where: { status: 'SUCCESS', startedAt: { gte: sevenDaysAgo }, durationMs: { not: null } },
      _avg: { durationMs: true },
    }),
    prisma.cronExecution.findMany({
      orderBy: { startedAt: 'desc' },
      take: 50,
    }),
    prisma.cronExecution.groupBy({
      by: ['jobName'],
      _count: { jobName: true },
      orderBy: { jobName: 'asc' },
    }),
  ]);

  const totalLast24h = successLast24h + failedLast24h;
  const successRate24h = totalLast24h > 0 ? Math.round((successLast24h / totalLast24h) * 100) : 100;

  return (
    <div>
      <PageHeader
        title="Cron Monitoring"
        subtitle="Track cron job health, success rates, and recent executions."
      />

      {/* Summary cards */}
      <div className="portal-metric-strip" style={{ marginBottom: '1.5rem' }}>
        <div className="portal-metric-card">
          <div className="portal-metric-card__icon-wrap portal-metric-card__icon-wrap--blue">
            <span className="material-symbols-outlined" style={{ fontSize: '1rem', fontVariationSettings: "'FILL' 1" }}>schedule</span>
          </div>
          <p className="portal-metric-card__value" style={{ fontVariantNumeric: 'tabular-nums' }}>{totalJobs}</p>
          <p className="portal-metric-card__label">Total Runs</p>
        </div>
        <div className="portal-metric-card">
          <div className="portal-metric-card__icon-wrap portal-metric-card__icon-wrap--green">
            <span className="material-symbols-outlined" style={{ fontSize: '1rem', fontVariationSettings: "'FILL' 1" }}>check_circle</span>
          </div>
          <p className="portal-metric-card__value" style={{ fontVariantNumeric: 'tabular-nums' }}>{successRate24h}%</p>
          <p className="portal-metric-card__label">Success Rate (24h)</p>
        </div>
        <div className="portal-metric-card">
          <div className="portal-metric-card__icon-wrap portal-metric-card__icon-wrap--accent">
            <span className="material-symbols-outlined" style={{ fontSize: '1rem', fontVariationSettings: "'FILL' 1" }}>error</span>
          </div>
          <p className="portal-metric-card__value" style={{ fontVariantNumeric: 'tabular-nums', color: failedLast24h > 0 ? 'var(--wa-accent-text)' : undefined }}>{failedLast24h}</p>
          <p className="portal-metric-card__label">Failed (24h)</p>
        </div>
        <div className="portal-metric-card">
          <div className="portal-metric-card__icon-wrap portal-metric-card__icon-wrap--gold">
            <span className="material-symbols-outlined" style={{ fontSize: '1rem', fontVariationSettings: "'FILL' 1" }}>play_circle</span>
          </div>
          <p className="portal-metric-card__value" style={{ fontVariantNumeric: 'tabular-nums', color: currentlyRunning > 0 ? 'var(--wa-info-dark)' : undefined }}>{currentlyRunning}</p>
          <p className="portal-metric-card__label">Running</p>
        </div>
        <div className="portal-metric-card">
          <div className="portal-metric-card__icon-wrap portal-metric-card__icon-wrap--blue">
            <span className="material-symbols-outlined" style={{ fontSize: '1rem', fontVariationSettings: "'FILL' 1" }}>timer</span>
          </div>
          <p className="portal-metric-card__value" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {avgDurationLast7d._avg.durationMs
              ? `${Math.round((avgDurationLast7d._avg.durationMs ?? 0) / 1000)}s`
              : '—'}
          </p>
          <p className="portal-metric-card__label">Avg Duration (7d)</p>
        </div>
      </div>

      <AdminCronsClient
        initialExecutions={recentExecutions}
        jobNames={distinctJobNames.map((j) => j.jobName)}
      />
    </div>
  );
}
