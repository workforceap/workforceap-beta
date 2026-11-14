import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
    user: { count: vi.fn() },
    placementRecord: { count: vi.fn() },
    application: { count: vi.fn() },
  },
}));

vi.mock('@/lib/email', () => ({
  sendAdminWeeklyRecapEmail: vi.fn(),
}));

vi.mock('@/lib/observability/captureApiError', () => ({
  captureApiError: vi.fn(),
  captureApiResponseError: vi.fn(),
}));

vi.mock('@/lib/admin/logCronRun', () => ({
  logCronRun: vi.fn(),
}));

vi.mock('@/lib/cron/withCronLogging', () => ({
  withCronLogging: vi.fn((_key, handler) => handler),
}));

vi.mock('@/lib/cron/cronExecution', () => ({
  setCronRecordsProcessed: vi.fn(),
}));

import { GET } from '@/app/api/cron/weekly-recap-email/route';
import { prisma } from '@/lib/db/prisma';
import { sendAdminWeeklyRecapEmail } from '@/lib/email';
import { captureApiError } from '@/lib/observability/captureApiError';
import { logCronRun } from '@/lib/admin/logCronRun';
import { setCronRecordsProcessed } from '@/lib/cron/cronExecution';

const NOW = new Date('2026-11-02T10:00:00.000Z');
const request = () => new Request('http://localhost/api/cron/weekly-recap-email');

function daysAgo(from: Date, days: number): Date {
  const next = new Date(from);
  next.setDate(next.getDate() - days);
  return next;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.clearAllMocks();
  vi.mocked(prisma.user.count).mockImplementation((async (args?: { where?: Record<string, unknown> }) => {
    if (args?.where && 'createdAt' in args.where) return 3;
    if (args?.where && 'enrolledProgram' in args.where) return 2;
    return 0;
  }) as never);
  vi.mocked(prisma.placementRecord.count).mockResolvedValue(1);
  vi.mocked(prisma.application.count).mockResolvedValue(4);
  vi.mocked(sendAdminWeeklyRecapEmail).mockResolvedValue({ ok: true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('GET /api/cron/weekly-recap-email', () => {
  it('counts live members only for new applicants and at-risk students', async () => {
    const res = await GET(request());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      newApplicants: 3,
      placements: 1,
      atRiskStudents: 2,
      pendingApplications: 4,
      emailSent: true,
    });

    expect(prisma.user.count).toHaveBeenCalledTimes(2);
    const applicantWhere = vi.mocked(prisma.user.count).mock.calls[0]![0]!.where;
    const atRiskWhere = vi.mocked(prisma.user.count).mock.calls[1]![0]!.where;
    expect(applicantWhere).toEqual({
      deletedAt: null,
      createdAt: { gte: daysAgo(NOW, 7) },
    });
    expect(atRiskWhere).toEqual({
      deletedAt: null,
      enrolledProgram: { not: null },
      memberEvents: { none: { createdAt: { gte: daysAgo(NOW, 14) } } },
    });

    expect(prisma.placementRecord.count).toHaveBeenCalledWith({
      where: { placedAt: { gte: daysAgo(NOW, 7) } },
    });
    expect(prisma.application.count).toHaveBeenCalledWith({
      where: { status: 'PENDING' },
    });

    expect(sendAdminWeeklyRecapEmail).toHaveBeenCalledExactlyOnceWith({
      newApplicants: 3,
      placements: 1,
      atRiskStudents: 2,
      pendingApplications: 4,
    });
    expect(setCronRecordsProcessed).toHaveBeenCalledWith(10);
    expect(logCronRun).toHaveBeenCalledWith(
      'cron_weekly_recap_email',
      expect.objectContaining({ emailSent: true, newApplicants: 3, atRiskStudents: 2 }),
      'ok',
    );
  });

  it('logs error when the recap send fails without treating the cron as thrown', async () => {
    vi.mocked(sendAdminWeeklyRecapEmail).mockResolvedValue({ ok: false, error: 'Send failed' });

    const res = await GET(request());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ ok: true, emailSent: false });
    expect(logCronRun).toHaveBeenCalledWith(
      'cron_weekly_recap_email',
      expect.objectContaining({ emailSent: false }),
      'error',
    );
    expect(captureApiError).not.toHaveBeenCalled();
  });

  it('answers 500 and logs error when a count query throws', async () => {
    vi.mocked(prisma.user.count).mockRejectedValueOnce(new Error('users unavailable'));

    const res = await GET(request());
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body).toEqual({ error: 'Cron job failed' });
    expect(sendAdminWeeklyRecapEmail).not.toHaveBeenCalled();
    expect(setCronRecordsProcessed).not.toHaveBeenCalled();
    expect(captureApiError).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ message: 'users unavailable' }),
      { route: 'cron/weekly-recap-email' },
    );
    expect(logCronRun).toHaveBeenCalledWith(
      'cron_weekly_recap_email',
      { error: 'users unavailable' },
      'error',
    );
  });
});
