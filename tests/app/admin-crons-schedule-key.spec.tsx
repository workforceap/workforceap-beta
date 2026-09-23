import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import vercelConfig from '@/vercel.json';

/**
 * X03: /admin/crons shows each job's schedule next to its last run, so a
 * late job is recognisable. The board is keyed by `CronExecution.jobName`,
 * which is the key each route passes to `withCronLogging(...)` (for most jobs
 * `cron_<route_segment>`). The schedule caption must resolve for that key and
 * must describe the schedule vercel.json actually deploys.
 */

type KitProps = { jobs: Array<{ id: string; job: string; schedule: string }> };

const h = vi.hoisted(() => ({
  jobNames: [] as string[],
  kitProps: null as null | KitProps,
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
vi.mock('@/components/portal/kit', () => ({
  DesignSurface: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('@/components/portal/kit/pages/admin-subviews/CronsMonitorKit', () => ({
  CronsMonitorKit: (props: KitProps) => {
    h.kitProps = props;
    return <div />;
  },
}));
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    cronExecution: {
      groupBy: vi.fn(async () =>
        // The page groups by (jobName, status); every job here last ran successfully.
        h.jobNames.map((jobName, i) => ({
          jobName,
          status: 'SUCCESS',
          _max: { startedAt: new Date(Date.UTC(2026, 8, 23, 12, 0, i)) },
        })),
      ),
      findMany: vi.fn(async () =>
        h.jobNames.map((jobName, i) => ({
          jobName,
          status: 'SUCCESS',
          startedAt: new Date(Date.UTC(2026, 8, 23, 12, 0, i)),
          durationMs: 1200,
        })),
      ),
    },
  },
}));

import AdminCronsPage from '@/app/admin/crons/page';

/**
 * The jobName each scheduled route records today (the first argument of its
 * `withCronLogging(...)` call), by vercel.json path. The webhook retry job
 * lives outside /api/cron and is checked on its own below.
 */
const RECORDED_JOB_NAME_BY_PATH: Record<string, string> = {
  '/api/cron/applicant-followup': 'cron_applicant_followup',
  '/api/cron/applicant-aging-digest': 'cron_applicant_aging_digest',
  '/api/cron/at-risk-alerts': 'cron_at_risk_alerts',
  '/api/cron/at-risk-check': 'cron_at_risk_check',
  '/api/cron/coursera-auto-heal': 'cron_coursera_auto_heal',
  '/api/cron/coursera-b4b-sync': 'cron_coursera_b4b_sync',
  '/api/cron/coursera-sync': 'cron_coursera_sync',
  '/api/cron/coursera-training-sync': 'cron_coursera_training_sync',
  '/api/cron/course-accountability': 'cron_course_accountability',
  '/api/cron/data-cleanup': 'data_cleanup',
  '/api/cron/deploy-health': 'cron_deploy_health',
  '/api/cron/inactive-nudge': 'cron_inactive_nudge',
  '/api/cron/inactivity-nudge': 'cron_inactivity_nudge',
  '/api/cron/interview-reminders': 'cron_interview_reminders',
  '/api/cron/onboarding-stalls': 'cron_onboarding_stalls',
  '/api/cron/employer-pending-applicants': 'cron_employer_pending_applicants',
  '/api/cron/job-expiry': 'cron_job_expiry',
  '/api/cron/retention-decisions': 'cron_retention_decisions',
  '/api/cron/job-alerts': 'cron_job_alerts',
  '/api/cron/milestone-cascade-draft': 'milestone_cascade_draft',
  '/api/cron/milestone-cascade-expire': 'milestone_cascade_expire',
  '/api/cron/milestone-celebration': 'cron_milestone_celebration',
  '/api/cron/partner-outcome-digest': 'cron_partner_digest',
  '/api/cron/placement-survey': 'cron_placement_survey',
  '/api/cron/smoke-test': 'cron_smoke_test',
  '/api/cron/stale-training-check': 'cron_stale_training_check',
  '/api/cron/verification': 'cron_verification',
  '/api/cron/weekly-recap': 'cron_weekly_recap',
  '/api/cron/weekly-recap-email': 'cron_weekly_recap_email',
  '/api/cron/wioa-report': 'cron_wioa_report',
};

const scheduledCronPaths = vercelConfig.crons.map((c) => c.path).filter((p) => p.startsWith('/api/cron/'));

async function renderBoard(jobNames: string[]) {
  h.jobNames = jobNames;
  h.kitProps = null;
  renderToStaticMarkup(await AdminCronsPage({ searchParams: Promise.resolve({}) }));
  // Set by the CronsMonitorKit mock during render (TS narrowed it to null above).
  const props = h.kitProps as KitProps | null;
  if (!props) throw new Error('CronsMonitorKit was not rendered');
  return new Map(props.jobs.map((row) => [row.job, row.schedule]));
}

describe('/admin/crons schedule key (X03)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('knows the recorded jobName of every scheduled /api/cron route', () => {
    expect(Object.keys(RECORDED_JOB_NAME_BY_PATH).sort()).toEqual([...scheduledCronPaths].sort());
  });

  it('shows a schedule for every scheduled job, keyed by the jobName its route records', async () => {
    const board = await renderBoard(Object.values(RECORDED_JOB_NAME_BY_PATH));
    const missing = [...board].filter(([, schedule]) => schedule === '—').map(([job]) => job);
    expect(missing).toEqual([]);
  });

  it('captions the schedule vercel.json deploys, to the minute, in UTC', async () => {
    const board = await renderBoard(Object.values(RECORDED_JOB_NAME_BY_PATH));
    // vercel.json: at-risk-check "11 6 * * *", weekly-recap "53 18 * * 0",
    // coursera-auto-heal "15 * * * *", coursera-b4b-sync "30 */6 * * *",
    // wioa-report "31 14 1 * *", applicant-followup "7 11 */3 * *".
    expect(board.get('cron_at_risk_check')).toBe('Daily 6:11 AM UTC');
    expect(board.get('cron_weekly_recap')).toBe('Sunday 6:53 PM UTC');
    expect(board.get('cron_coursera_auto_heal')).toBe('Hourly at :15 UTC');
    expect(board.get('cron_coursera_b4b_sync')).toBe('Every 6 hours at :30 UTC');
    expect(board.get('cron_wioa_report')).toBe('Monthly on the 1st, 2:31 PM UTC');
    expect(board.get('cron_applicant_followup')).toBe('Every 3 days from the 1st of the month, 11:07 AM UTC');
    expect(board.get('data_cleanup')).toBe('Daily 7:30 AM UTC');
  });

  it('shows the webhook retry job with its 10-minute schedule (X03 part 2)', async () => {
    const board = await renderBoard(['cron_webhook_process_retries']);
    expect(board.get('cron_webhook_process_retries')).toBe('Every 10 minutes');
  });

  it('still renders "—" for a job name no schedule is declared for', async () => {
    const board = await renderBoard(['cron_manual_backfill']);
    expect(board.get('cron_manual_backfill')).toBe('—');
  });
});
