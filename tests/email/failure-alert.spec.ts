/**
 * WAP-163: failed sends in the last 24h raise the existing Sentry/Discord
 * alert from the daily verification cron, and the count is in its result.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db/prisma', () => ({
  prisma: { workflowDiagnostic: { findMany: vi.fn(), count: vi.fn() } },
}));
vi.mock('@/lib/notify/discord', () => ({ notifyDiscord: vi.fn(() => Promise.resolve()) }));
vi.mock('@/lib/observability/captureApiError', () => ({ captureApiError: vi.fn(), captureApiResponseError: vi.fn() }));
vi.mock('@/lib/admin/logCronRun', () => ({ logCronRun: vi.fn(() => Promise.resolve()) }));
vi.mock('@/lib/cron/withCronLogging', () => ({
  withCronLogging: (_key: string, handler: (request: Request) => Promise<Response>) => handler,
}));
vi.mock('@/lib/cron/cronExecution', () => ({ setCronRecordsProcessed: vi.fn(() => Promise.resolve()) }));

import { prisma } from '@/lib/db/prisma';
import { notifyDiscord } from '@/lib/notify/discord';
import { captureApiError } from '@/lib/observability/captureApiError';
import {
  EMAIL_FAILURE_ALERT_THRESHOLD,
  EMAIL_FAILURE_ALERT_WINDOW_HOURS,
  alertOnRecentEmailFailures,
  countRecentEmailFailures,
  emailFailureWindowStart,
} from '@/lib/email/failureAlert';
import { GET } from '@/app/api/cron/verification/route';

const NOW = new Date('2026-09-20T11:00:00Z');

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.clearAllMocks();
  vi.mocked(prisma.workflowDiagnostic.findMany).mockResolvedValue([]);
});
afterEach(() => vi.useRealTimers());

describe('alertOnRecentEmailFailures', () => {
  it('counts email_send errors inside a 24h window', async () => {
    vi.mocked(prisma.workflowDiagnostic.count).mockResolvedValue(0);
    expect(EMAIL_FAILURE_ALERT_WINDOW_HOURS).toBe(24);
    expect(emailFailureWindowStart(NOW).toISOString()).toBe('2026-09-19T11:00:00.000Z');
    await countRecentEmailFailures(prisma, NOW);
    expect(prisma.workflowDiagnostic.count).toHaveBeenCalledWith({
      where: { workflow: 'email_send', status: 'error', createdAt: { gte: new Date('2026-09-19T11:00:00Z') } },
    });
  });

  it('stays silent at or below the threshold', async () => {
    vi.mocked(prisma.workflowDiagnostic.count).mockResolvedValue(EMAIL_FAILURE_ALERT_THRESHOLD);
    const result = await alertOnRecentEmailFailures({ now: NOW });
    expect(result).toEqual({ count: EMAIL_FAILURE_ALERT_THRESHOLD, alerted: false, threshold: EMAIL_FAILURE_ALERT_THRESHOLD });
    expect(captureApiError).not.toHaveBeenCalled();
    expect(notifyDiscord).not.toHaveBeenCalled();
  });

  it('raises Sentry and Discord with the count once failures exceed the threshold', async () => {
    vi.mocked(prisma.workflowDiagnostic.count).mockResolvedValue(3);
    const result = await alertOnRecentEmailFailures({ now: NOW, siteUrl: 'https://www.workforceap.org' });
    expect(result).toMatchObject({ count: 3, alerted: true });
    expect(captureApiError).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ message: '3 email sends failed in the last 24h' }),
      expect.objectContaining({ route: 'cron/verification/email-failures', extra: expect.objectContaining({ count: 3, threshold: EMAIL_FAILURE_ALERT_THRESHOLD }) }),
    );
    expect(notifyDiscord).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      level: 'warn',
      url: 'https://www.workforceap.org/admin/diagnostics',
      fields: [{ name: 'Failed in 24h', value: '3' }],
    }));
  });

  it('singularises one failure', async () => {
    vi.mocked(prisma.workflowDiagnostic.count).mockResolvedValue(1);
    await alertOnRecentEmailFailures({ now: NOW });
    expect(captureApiError).toHaveBeenCalledWith(expect.objectContaining({ message: '1 email send failed in the last 24h' }), expect.anything());
  });
});

const CRITICAL_CRONS = [
  { workflow: 'cron_applicant_followup', schedule: 'daily', maxAgeHours: 30 },
  { workflow: 'cron_inactive_nudge', schedule: 'daily', maxAgeHours: 30 },
  { workflow: 'cron_milestone_celebration', schedule: 'daily', maxAgeHours: 30 },
  { workflow: 'cron_inactivity_nudge', schedule: 'weekly', maxAgeHours: 8 * 24 },
  { workflow: 'cron_partner_digest', schedule: 'weekly', maxAgeHours: 8 * 24 },
  { workflow: 'cron_weekly_recap_email', schedule: 'weekly', maxAgeHours: 8 * 24 },
  { workflow: 'cron_weekly_recap', schedule: 'weekly', maxAgeHours: 8 * 24 },
] as const;

function diagnostic(
  workflow: string,
  hoursAgo: number,
  status: 'ok' | 'error' = 'ok',
) {
  return {
    workflow,
    createdAt: new Date(NOW.getTime() - hoursAgo * 60 * 60 * 1000),
    status,
  };
}

function freshCriticalRuns(overrides: Array<ReturnType<typeof diagnostic>> = []) {
  const byWorkflow = new Map(overrides.map((run) => [run.workflow, run]));
  return CRITICAL_CRONS.map(
    (cron) => byWorkflow.get(cron.workflow) ?? diagnostic(cron.workflow, 1),
  );
}

describe('GET /api/cron/verification', () => {
  it('reports the 24h email failure count and turns not-ok when failures exceed the threshold', async () => {
    vi.mocked(prisma.workflowDiagnostic.count).mockResolvedValue(2);
    const body = await (await GET(new Request('http://localhost/api/cron/verification'))).json();
    expect(body).toMatchObject({ ok: false, emailFailures24h: 2, emailFailureAlerted: true });
    expect(captureApiError).toHaveBeenCalledWith(expect.objectContaining({ message: '2 email sends failed in the last 24h' }), expect.anything());
  });

  it('keeps the cron-freshness verdict when no email failed', async () => {
    vi.mocked(prisma.workflowDiagnostic.count).mockResolvedValue(0);
    vi.mocked(prisma.workflowDiagnostic.findMany).mockResolvedValue(freshCriticalRuns() as never);
    const body = await (await GET(new Request('http://localhost/api/cron/verification'))).json();
    expect(body).toMatchObject({ ok: true, emailFailures24h: 0, emailFailureAlerted: false, staleOrMissing: [], failures: [] });
    expect(notifyDiscord).not.toHaveBeenCalled();
  });

  it('uses a 30h daily window and an 8-day weekly window, and does not apply the daily bound to weekly crons', async () => {
    vi.mocked(prisma.workflowDiagnostic.count).mockResolvedValue(0);
    vi.mocked(prisma.workflowDiagnostic.findMany).mockResolvedValue(
      freshCriticalRuns([
        diagnostic('cron_applicant_followup', 29),
        diagnostic('cron_inactive_nudge', 31),
        diagnostic('cron_inactivity_nudge', 31),
        diagnostic('cron_partner_digest', 8 * 24 + 1),
      ]) as never,
    );

    const body = await (await GET(new Request('http://localhost/api/cron/verification'))).json();
    expect(body.ok).toBe(false);
    expect(body.staleOrMissing).toEqual(['cron_inactive_nudge', 'cron_partner_digest']);
    expect(body.windows).toEqual(
      CRITICAL_CRONS.map((cron) => ({
        workflow: cron.workflow,
        schedule: cron.schedule,
        maxAgeHours: cron.maxAgeHours,
        lastRunAt: expect.any(String),
      })),
    );
  });

  it('treats a missing last run as stale even when other critical crons are fresh', async () => {
    vi.mocked(prisma.workflowDiagnostic.count).mockResolvedValue(0);
    vi.mocked(prisma.workflowDiagnostic.findMany).mockResolvedValue(
      freshCriticalRuns().filter((run) => run.workflow !== 'cron_weekly_recap') as never,
    );

    const body = await (await GET(new Request('http://localhost/api/cron/verification'))).json();
    expect(body).toMatchObject({
      ok: false,
      staleOrMissing: ['cron_weekly_recap'],
      failures: [],
      ran: 6,
    });
    expect(body.windows.find((row: { workflow: string }) => row.workflow === 'cron_weekly_recap')).toMatchObject({
      lastRunAt: null,
      maxAgeHours: 8 * 24,
    });
  });

  it('fails closed on a fresh error-status last run and keeps only the newest row per workflow', async () => {
    vi.mocked(prisma.workflowDiagnostic.count).mockResolvedValue(0);
    vi.mocked(prisma.workflowDiagnostic.findMany).mockResolvedValue([
      diagnostic('cron_milestone_celebration', 1, 'error'),
      diagnostic('cron_milestone_celebration', 2, 'ok'),
      ...freshCriticalRuns().filter((run) => run.workflow !== 'cron_milestone_celebration'),
    ] as never);

    const body = await (await GET(new Request('http://localhost/api/cron/verification'))).json();
    expect(body).toMatchObject({
      ok: false,
      staleOrMissing: [],
      failures: ['cron_milestone_celebration'],
    });
  });

  it('ignores an older error once a newer ok run exists for that workflow', async () => {
    vi.mocked(prisma.workflowDiagnostic.count).mockResolvedValue(0);
    vi.mocked(prisma.workflowDiagnostic.findMany).mockResolvedValue([
      diagnostic('cron_milestone_celebration', 1, 'ok'),
      diagnostic('cron_milestone_celebration', 2, 'error'),
      ...freshCriticalRuns().filter((run) => run.workflow !== 'cron_milestone_celebration'),
    ] as never);

    const body = await (await GET(new Request('http://localhost/api/cron/verification'))).json();
    expect(body).toMatchObject({ ok: true, staleOrMissing: [], failures: [] });
  });
});
