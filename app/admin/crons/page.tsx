import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { resolveAdminPageTenant, withAdminPageScope, inheritUserOrg, inheritMemberOrg, inheritLeaderOrg, inheritInvitedByOrg } from '@/lib/tenant/adminPageScope';
import PageHeader from '@/components/portal/PageHeader';
import { prisma } from '@/lib/db/prisma';
import AdminCronsClient from '@/components/admin/AdminCronsClient';
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

/**
 * Human schedule captions keyed by the jobName recorded in CronExecution
 * (withCronLogging(name) — the route segment with hyphens → underscores).
 * Derived from the committed vercel.json `crons` registry. Any jobName not
 * listed renders "—" (schedule not tracked for that job).
 */
const SCHEDULE_BY_JOB: Record<string, string> = {
  applicant_followup: 'Every 3 days, 11 AM',
  at_risk_alerts: 'Mon 1 PM',
  at_risk_check: 'Daily 6 AM',
  coursera_auto_heal: 'Hourly :15',
  coursera_b4b_sync: 'Every 6 hours',
  coursera_sync: 'Every 6 hours',
  coursera_training_sync: 'Hourly',
  course_accountability: 'Daily 3 PM',
  data_cleanup: 'Daily 7:30 AM',
  deploy_health: 'Hourly',
  inactive_nudge: 'Mon 10 AM',
  inactivity_nudge: 'Wed 10 AM',
  interview_reminders: 'Daily 2:30 PM',
  milestone_cascade_draft: 'Hourly',
  milestone_cascade_expire: 'Daily 9 AM',
  milestone_celebration: 'Daily 11 AM',
  partner_outcome_digest: 'Mon 1 PM',
  placement_survey: 'Daily 2 PM',
  smoke_test: 'Hourly',
  stale_training_check: 'Daily 12:30 PM',
  verification: 'Daily 11 AM',
  weekly_recap: 'Sun 6 PM',
  weekly_recap_email: 'Fri 10 PM',
  wioa_report: 'Monthly (1st, 2 PM)',
};

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
  // Distinct jobs (with latest-run timestamp) + recent execution slice, in
  // parallel and lean. We resolve each job's latest execution from the recent
  // slice; jobs whose latest run is older than the slice still appear via the
  // groupBy with last-run filled from _max.startedAt.
  const [jobGroups, recent] = await Promise.all([
    prisma.cronExecution.groupBy({
      by: ['jobName'],
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

  // Latest execution row per job (from the recent slice).
  const latestByJob = new Map<string, (typeof recent)[number]>();
  for (const exec of recent) {
    if (!latestByJob.has(exec.jobName)) latestByJob.set(exec.jobName, exec);
  }

  // Most-recently-run jobs first (groupBy returns no guaranteed order).
  const sortedGroups = [...jobGroups].sort(
    (a, b) => (b._max.startedAt?.getTime() ?? 0) - (a._max.startedAt?.getTime() ?? 0),
  );

  const rows: CronJobRow[] = sortedGroups.slice(0, BOARD_LIMIT).map((g) => {
    const latest = latestByJob.get(g.jobName);
    const status: CronDisplayStatus = latest
      ? DISPLAY_STATUS[latest.status] ?? 'Disabled'
      : 'Disabled';
    return {
      id: g.jobName,
      job: g.jobName,
      schedule: SCHEDULE_BY_JOB[g.jobName] ?? '—',
      lastRun: relativeTime(latest?.startedAt ?? g._max.startedAt ?? null),
      duration: formatDuration(latest?.durationMs ?? null),
      status,
    };
  });

  const totalJobs = jobGroups.length;
  const enabled = rows.filter((r) => r.status === 'Success').length;
  const failing = rows.filter((r) => r.status === 'Failed').length;
  const lastRun = relativeTime(sortedGroups[0]?._max.startedAt ?? null);

  return (
    <DesignSurface surface="dense">
      <CronsMonitorKit
        jobs={rows}
        totalJobs={totalJobs}
        enabled={enabled}
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
          <p className="portal-metric-card__value" style={{ fontVariantNumeric: 'tabular-nums', color: failedLast24h > 0 ? 'var(--color-accent)' : undefined }}>{failedLast24h}</p>
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
