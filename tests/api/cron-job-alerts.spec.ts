import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  cronFindFirst: vi.fn(),
  userFindMany: vi.fn(),
  jobFindMany: vi.fn(),
  notify: vi.fn(),
  email: vi.fn(),
  discord: vi.fn(),
  capture: vi.fn(),
  log: vi.fn(),
  records: vi.fn(),
  currentExecutionId: vi.fn(() => null as string | null),
}));

vi.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), {
        ...init,
        headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
      }),
  },
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    cronExecution: { findFirst: mocks.cronFindFirst },
    user: { findMany: mocks.userFindMany },
    job: { findMany: mocks.jobFindMany },
  },
}));

vi.mock('@/lib/email', () => ({
  sendJobAlertDigestEmail: mocks.email,
}));

vi.mock('@/lib/notifications/create', () => ({
  createNotification: mocks.notify,
}));

vi.mock('@/lib/notify/discord', () => ({
  notifyDiscord: mocks.discord,
}));

vi.mock('@/lib/observability/captureApiError', () => ({
  captureApiError: mocks.capture,
  captureApiResponseError: vi.fn(),
}));

vi.mock('@/lib/admin/logCronRun', () => ({
  logCronRun: mocks.log,
}));

vi.mock('@/lib/cron/withCronLogging', () => ({
  withCronLogging: (_key: string, handler: (req: Request) => Promise<Response>) => handler,
}));

vi.mock('@/lib/cron/cronExecution', () => ({
  setCronRecordsProcessed: mocks.records,
  getCurrentCronExecutionId: mocks.currentExecutionId,
}));

vi.mock('@/lib/email/pacing', () => ({
  createBulkEmailCronPacer: () => ({
    run: <T>(operation: () => Promise<T>) => operation(),
    summary: () => ({ admitted: 0, skipped: 0 }),
  }),
}));

import { GET } from '@/app/api/cron/job-alerts/route';
import { prisma } from '@/lib/db/prisma';

const NOW = new Date('2026-11-01T10:00:00.000Z');

function expectedSevenDaysAgo(): Date {
  const fallbackWindow = new Date();
  fallbackWindow.setDate(fallbackWindow.getDate() - 7);
  return fallbackWindow;
}

function request() {
  return new Request('http://localhost/api/cron/job-alerts');
}

function member(overrides: Record<string, unknown> = {}) {
  return {
    id: 'member-1',
    email: 'member@example.com',
    fullName: 'Ada Lovelace',
    enrolledProgram: 'Cyber',
    ...overrides,
  };
}

function job(overrides: Record<string, unknown> = {}) {
  return {
    id: 'job-1',
    title: 'Help desk',
    location: 'Remote',
    employer: { companyName: 'Acme' },
    ...overrides,
  };
}

describe('GET /api/cron/job-alerts', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.clearAllMocks();
    mocks.currentExecutionId.mockReturnValue(null);
    mocks.cronFindFirst.mockResolvedValue(null);
    mocks.userFindMany.mockResolvedValue([]);
    mocks.jobFindMany.mockResolvedValue([]);
    mocks.notify.mockResolvedValue(undefined);
    mocks.email.mockResolvedValue({ ok: true });
    mocks.discord.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses a 7-day window on the first successful run', async () => {
    const json = await (await GET(request())).json();

    expect(prisma.cronExecution.findFirst).toHaveBeenCalledWith({
      where: { jobName: 'cron_job_alerts', status: 'SUCCESS' },
      orderBy: { completedAt: 'desc' },
      select: { startedAt: true },
    });
    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: {
        deletedAt: null,
        enrolledProgram: { not: null },
        OR: [
          { savedJobs: { some: {} } },
          { jobPostingApplications: { some: {} } },
          { aiJobMatches: { some: {} } },
        ],
      },
      select: { id: true, email: true, fullName: true, enrolledProgram: true },
      take: 1000,
    });
    expect(json.sinceIso).toBe(expectedSevenDaysAgo().toISOString());
    expect(mocks.discord).not.toHaveBeenCalled();
    expect(mocks.records).toHaveBeenCalledWith(0);
  });

  it('excludes the in-flight execution when reading the last success', async () => {
    const lastStarted = new Date('2026-10-25T09:00:00.000Z');
    mocks.currentExecutionId.mockReturnValue('exec-now');
    mocks.cronFindFirst.mockResolvedValue({ startedAt: lastStarted });

    const json = await (await GET(request())).json();

    expect(prisma.cronExecution.findFirst).toHaveBeenCalledWith({
      where: {
        jobName: 'cron_job_alerts',
        status: 'SUCCESS',
        id: { not: 'exec-now' },
      },
      orderBy: { completedAt: 'desc' },
      select: { startedAt: true },
    });
    expect(json.sinceIso).toBe(lastStarted.toISOString());
  });

  it('matches live unexpired jobs against the lowercased enrolled program', async () => {
    mocks.userFindMany.mockResolvedValue([member()]);
    mocks.jobFindMany.mockResolvedValue([job()]);

    const json = await (await GET(request())).json();

    expect(prisma.job.findMany).toHaveBeenCalledWith({
      where: {
        status: 'live',
        updatedAt: { gte: expectedSevenDaysAgo() },
        OR: [{ expiresAt: null }, { expiresAt: { gte: NOW } }],
        suggestedPrograms: { has: 'cyber' },
      },
      orderBy: { updatedAt: 'desc' },
      take: 5,
      select: {
        id: true,
        title: true,
        location: true,
        employer: { select: { companyName: true } },
      },
    });
    expect(mocks.notify).toHaveBeenCalledWith({
      userId: 'member-1',
      type: 'job_match',
      notifyOperator: false,
      title: '1 new job match your program',
      body: 'New this week: Help desk at Acme.',
      data: { link: '/dashboard/jobs', jobIds: ['job-1'] },
    });
    expect(mocks.email).toHaveBeenCalledWith({
      to: 'member@example.com',
      firstName: 'Ada',
      jobs: [{ title: 'Help desk', company: 'Acme', location: 'Remote' }],
    });
    expect(json).toMatchObject({
      notificationsCreated: 1,
      emailsAccepted: 1,
      emailsSkipped: 0,
      emailFailures: 0,
    });
    expect(mocks.discord).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'job_match',
        fields: [{ name: 'cron', value: 'job-alerts' }],
      }),
    );
    expect(mocks.records).toHaveBeenCalledWith(1);
  });

  it('creates no notification or Discord post when the window has no matching jobs', async () => {
    mocks.userFindMany.mockResolvedValue([member()]);
    mocks.jobFindMany.mockResolvedValue([]);

    const json = await (await GET(request())).json();

    expect(mocks.notify).not.toHaveBeenCalled();
    expect(mocks.email).not.toHaveBeenCalled();
    expect(mocks.discord).not.toHaveBeenCalled();
    expect(json).toMatchObject({ notificationsCreated: 0, emailsAccepted: 0 });
  });

  it('still notifies in-app when the member has no email', async () => {
    mocks.userFindMany.mockResolvedValue([member({ email: null })]);
    mocks.jobFindMany.mockResolvedValue([job()]);

    const json = await (await GET(request())).json();

    expect(mocks.notify).toHaveBeenCalledTimes(1);
    expect(mocks.email).not.toHaveBeenCalled();
    expect(json).toMatchObject({
      notificationsCreated: 1,
      emailsAccepted: 0,
      emailsSkipped: 0,
      emailFailures: 0,
    });
  });

  it('counts a failed send separately from a fixture skip', async () => {
    mocks.userFindMany.mockResolvedValue([
      member({ id: 'fail', email: 'fail@example.com' }),
      member({ id: 'skip', email: 'skip@example.com', fullName: 'Skip' }),
    ]);
    mocks.jobFindMany.mockResolvedValue([job()]);
    mocks.email
      .mockResolvedValueOnce({ ok: false, error: 'bounce' })
      .mockResolvedValueOnce({ ok: false, skipped: true, error: 'fixture_recipient' });

    const json = await (await GET(request())).json();

    expect(json).toMatchObject({
      notificationsCreated: 2,
      emailsAccepted: 0,
      emailsSkipped: 1,
      emailFailures: 1,
    });
    expect(mocks.records).toHaveBeenCalledWith(2);
  });

  it('continues after one member throws', async () => {
    mocks.userFindMany.mockResolvedValue([
      member({ id: 'boom' }),
      member({ id: 'ok', email: 'ok@example.com', fullName: 'OK' }),
    ]);
    mocks.jobFindMany
      .mockRejectedValueOnce(new Error('jobs down'))
      .mockResolvedValueOnce([job({ id: 'job-2' })]);

    const json = await (await GET(request())).json();

    expect(mocks.capture).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ route: 'cron/job-alerts', extra: { userId: 'boom' } }),
    );
    expect(mocks.notify).toHaveBeenCalledTimes(1);
    expect(json.notificationsCreated).toBe(1);
  });
});
