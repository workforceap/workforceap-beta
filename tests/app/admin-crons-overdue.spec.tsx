import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * X03 part 3: /admin/crons flags a scheduled job that has stopped succeeding
 * ("Overdue · last success Nd ago") and a vercel.json job that has never
 * recorded a run ("Never run"). Before this, the board listed only jobs with
 * CronExecution rows and showed their last status, so a job that silently
 * stopped looked green indefinitely.
 *
 * Prisma is mocked over an in-memory execution log; the page and the real
 * CronsMonitorKit render, and the kit's props are captured for row checks.
 */

type Exec = { jobName: string; status: string; startedAt: Date; durationMs: number | null };
type Row = { job: string; status: string | null; freshness: string; schedule: string };
type KitProps = { jobs: Row[]; totalJobs: number; enabled: number; failing: number };

const NOW = new Date(Date.UTC(2026, 8, 23, 12, 0, 0));
const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const h = vi.hoisted(() => ({
  execs: [] as Array<{ jobName: string; status: string; startedAt: Date; durationMs: number | null }>,
  kitProps: null as unknown,
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock('@/app/seo', () => ({ buildPageMetadataAsync: vi.fn(async (input: unknown) => input) }));
vi.mock('@/lib/auth/server', () => ({ getUser: vi.fn(async () => ({ id: 'admin-1' })) }));
vi.mock('@/lib/tenant/adminPageScope', () => ({
  resolveAdminPageTenant: vi.fn(async () => ({ ok: true, orgId: 'org-1', superAdmin: false })),
  withAdminPageScope: vi.fn(),
  inheritUserOrg: vi.fn(),
  inheritMemberOrg: vi.fn(),
  inheritLeaderOrg: vi.fn(),
  inheritInvitedByOrg: vi.fn(),
}));
vi.mock('@/components/portal/PageHeader', () => ({ default: () => null }));
vi.mock('@/components/admin/AdminCronsClient', () => ({ default: () => null }));
vi.mock('@/components/portal/kit/pages/admin-subviews/CronsMonitorKit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/portal/kit/pages/admin-subviews/CronsMonitorKit')>();
  return {
    ...actual,
    CronsMonitorKit: (props: Parameters<typeof actual.CronsMonitorKit>[0]) => {
      h.kitProps = props;
      return actual.CronsMonitorKit(props);
    },
  };
});

/** Minimal groupBy over the in-memory log: `by` keys, optional equality `where`, `_max.startedAt`. */
function groupBy(args: { by: Array<keyof Exec>; where?: Partial<Exec> }) {
  const where = args.where ?? {};
  const groups = new Map<string, { key: Partial<Exec>; max: Date | null }>();
  for (const e of h.execs) {
    if (Object.entries(where).some(([k, v]) => e[k as keyof Exec] !== v)) continue;
    const key = Object.fromEntries(args.by.map((k) => [k, e[k]])) as Partial<Exec>;
    const id = JSON.stringify(key);
    const g = groups.get(id) ?? { key, max: null };
    if (!g.max || e.startedAt > g.max) g.max = e.startedAt;
    groups.set(id, g);
  }
  return [...groups.values()].map((g) => ({ ...g.key, _max: { startedAt: g.max } }));
}

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    cronExecution: {
      groupBy: vi.fn(async (args: { by: Array<keyof Exec>; where?: Partial<Exec> }) => groupBy(args)),
      findMany: vi.fn(async (args: { take?: number }) =>
        [...h.execs].sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime()).slice(0, args.take ?? Infinity),
      ),
    },
  },
}));

import AdminCronsPage from '@/app/admin/crons/page';

const ago = (ms: number) => new Date(NOW.getTime() - ms);
const run = (jobName: string, status: string, startedAt: Date): Exec => ({ jobName, status, startedAt, durationMs: 1200 });

async function renderBoard(execs: Exec[]) {
  h.execs = execs;
  h.kitProps = null;
  const html = renderToStaticMarkup(await AdminCronsPage({ searchParams: Promise.resolve({}) }));
  const props = h.kitProps as KitProps | null;
  if (!props) throw new Error('CronsMonitorKit was not rendered');
  return { html, props, row: (job: string) => props.jobs.find((r) => r.job === job) };
}

/** 250 webhook-retry runs, one every 10 minutes: enough to push older jobs out of the 200-row recent slice. */
const busyWebhookRuns = Array.from({ length: 250 }, (_, i) =>
  run('cron_webhook_process_retries', 'SUCCESS', ago(i * 10 * MIN + MIN)),
);

describe('/admin/crons overdue and never-run jobs (X03 part 3)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('lists a scheduled job with no CronExecution rows as "Never run"', async () => {
    const { html, row } = await renderBoard([run('cron_deploy_health', 'SUCCESS', ago(30 * MIN))]);
    // vercel.json schedules /api/cron/weekly-recap ("53 18 * * 0"); it has no rows here.
    expect(row('cron_weekly_recap')).toMatchObject({ freshness: 'never_run', status: null, schedule: 'Sunday 6:53 PM UTC' });
    expect(html).toContain('Never run');
  });

  it('flags an hourly job whose last success was 3 h ago as "Overdue · last success 3h ago"', async () => {
    const { html, row } = await renderBoard([
      run('cron_deploy_health', 'SUCCESS', ago(3 * HOUR)),
      run('cron_smoke_test', 'SUCCESS', ago(90 * MIN)),
    ]);
    expect(row('cron_deploy_health')?.freshness).toBe('overdue');
    expect(row('cron_smoke_test')?.freshness).toBe('ok');
    expect(html).toContain('Overdue · last success 3h ago');
  });

  it('measures overdue from the last success, not a later failed run', async () => {
    const { row } = await renderBoard([
      run('cron_deploy_health', 'SUCCESS', ago(3 * HOUR)),
      run('cron_deploy_health', 'FAILED', ago(10 * MIN)),
    ]);
    expect(row('cron_deploy_health')).toMatchObject({ status: 'Failed', freshness: 'overdue' });
  });

  it('shows a daily job outside the recent slice with its real last status, and flags it overdue', async () => {
    const { html, row } = await renderBoard([...busyWebhookRuns, run('cron_at_risk_check', 'SUCCESS', ago(3 * DAY))]);
    expect(row('cron_at_risk_check')).toMatchObject({ status: 'Success', freshness: 'overdue' });
    expect(html).toContain('Overdue · last success 3d ago');
    expect(row('cron_webhook_process_retries')?.freshness).toBe('ok');
  });

  it('does not flag a disabled job (latest run SKIPPED) as overdue', async () => {
    const { row } = await renderBoard([
      run('cron_job_alerts', 'SUCCESS', ago(40 * DAY)),
      run('cron_job_alerts', 'SKIPPED', ago(DAY)),
    ]);
    expect(row('cron_job_alerts')).toMatchObject({ status: 'Disabled', freshness: 'unknown' });
  });

  it('never flags a job with no declared schedule', async () => {
    const { row } = await renderBoard([run('cron_manual_backfill', 'SUCCESS', ago(90 * DAY))]);
    expect(row('cron_manual_backfill')).toMatchObject({ schedule: '—', freshness: 'unknown' });
  });

  it('puts flagged jobs first, counts them in the Overdue KPI and relabels "Enabled" as "Last run OK"', async () => {
    const { html, props } = await renderBoard([
      run('cron_smoke_test', 'SUCCESS', ago(5 * MIN)),
      run('cron_deploy_health', 'SUCCESS', ago(3 * HOUR)),
    ]);
    const firstOk = props.jobs.findIndex((r) => r.freshness === 'ok' || r.freshness === 'unknown');
    const lastFlagged = props.jobs.map((r) => r.freshness).lastIndexOf('overdue');
    expect(lastFlagged).toBeLessThan(firstOk);
    expect(props.jobs[0]?.job).toBe('cron_deploy_health');
    expect(html).toContain('Last run OK');
    expect(html).not.toContain('>Enabled<');
    expect(html).toContain('Overdue');
    // Total counts the scheduled jobs that have never run, too.
    expect(props.totalJobs).toBe(props.jobs.length);
    expect(props.jobs.some((r) => r.freshness === 'never_run')).toBe(true);
  });
});
