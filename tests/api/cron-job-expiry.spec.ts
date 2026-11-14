import { beforeEach, describe, expect, it, vi } from 'vitest';

const pacing = vi.hoisted(() => ({
  create: vi.fn(() => ({
    run: async (operation: () => Promise<unknown>) => operation(),
    summary: () => ({ admitted: 1, skipped: 0 }),
  })),
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
    job: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

vi.mock('@/lib/notifications/create', () => ({ createNotification: vi.fn() }));
vi.mock('@/lib/email', () => ({ sendEmployerJobExpiryEmail: vi.fn() }));
vi.mock('@/lib/email/pacing', () => ({ createBulkEmailCronPacer: pacing.create }));
vi.mock('@/lib/observability/captureApiError', () => ({ captureApiError: vi.fn() }));
vi.mock('@/lib/admin/logCronRun', () => ({ logCronRun: vi.fn() }));
vi.mock('@/lib/cron/cronExecution', () => ({ setCronRecordsProcessed: vi.fn() }));
vi.mock('@/lib/jobs/listingCache', () => ({ invalidateJobListings: vi.fn() }));
vi.mock('@/lib/cron/withCronLogging', () => ({
  withCronLogging: vi.fn((_key: string, handler: (req: Request) => Promise<Response>) => handler),
}));

import { GET } from '@/app/api/cron/job-expiry/route';
import { prisma } from '@/lib/db/prisma';
import { createNotification } from '@/lib/notifications/create';
import { sendEmployerJobExpiryEmail } from '@/lib/email';
import { invalidateJobListings } from '@/lib/jobs/listingCache';
import { setCronRecordsProcessed } from '@/lib/cron/cronExecution';
import { CRON_JOB_EXPIRY_CAP } from '@/lib/cron/cronCaps';

const prismaMock = prisma as unknown as {
  job: { findMany: ReturnType<typeof vi.fn>; updateMany: ReturnType<typeof vi.fn> };
};

function request() {
  return new Request('http://localhost/api/cron/job-expiry');
}

describe('GET /api/cron/job-expiry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pacing.create.mockImplementation(() => ({
      run: async (operation: () => Promise<unknown>) => operation(),
      summary: () => ({ admitted: 1, skipped: 0 }),
    }));
    prismaMock.job.findMany.mockResolvedValue([]);
    prismaMock.job.updateMany.mockResolvedValue({ count: 0 });
    vi.mocked(invalidateJobListings).mockResolvedValue(undefined as never);
    vi.mocked(createNotification).mockResolvedValue(undefined as never);
    vi.mocked(sendEmployerJobExpiryEmail).mockResolvedValue({ ok: true } as never);
  });

  it('returns a quiet success when no live jobs have expired', async () => {
    const res = await GET(request());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toMatchObject({ ok: true, expiredCount: 0, employersNotified: 0 });
    expect(prismaMock.job.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: 'live', expiresAt: { lt: expect.any(Date) } }),
      take: CRON_JOB_EXPIRY_CAP,
      orderBy: { expiresAt: 'asc' },
    }));
    expect(prismaMock.job.updateMany).not.toHaveBeenCalled();
    expect(createNotification).not.toHaveBeenCalled();
    expect(setCronRecordsProcessed).toHaveBeenCalledWith(0);
  });

  it('closes expired live jobs once and notifies each employer a single time', async () => {
    prismaMock.job.findMany.mockResolvedValue([
      {
        id: 'job-1',
        employerId: 'emp-1',
        employer: { userId: 'user-emp-1', contactEmail: 'hiring@acme.test' },
      },
      {
        id: 'job-2',
        employerId: 'emp-1',
        employer: { userId: 'user-emp-1', contactEmail: 'hiring@acme.test' },
      },
      {
        id: 'job-3',
        employerId: 'emp-2',
        employer: { userId: 'user-emp-2', contactEmail: null },
      },
    ]);
    prismaMock.job.updateMany.mockResolvedValue({ count: 3 });

    const res = await GET(request());
    const json = await res.json();

    expect(json).toMatchObject({ ok: true, expiredCount: 3, employersNotified: 2 });
    expect(prismaMock.job.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['job-1', 'job-2', 'job-3'] }, status: 'live' },
      data: { status: 'closed' },
    });
    expect(invalidateJobListings).toHaveBeenCalledOnce();
    expect(createNotification).toHaveBeenCalledTimes(2);
    expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-emp-1',
      title: '2 of your job posts expired',
      data: { link: '/employer/jobs' },
    }));
    expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-emp-2',
      title: '1 of your job post expired',
    }));
    expect(sendEmployerJobExpiryEmail).toHaveBeenCalledOnce();
    expect(sendEmployerJobExpiryEmail).toHaveBeenCalledWith({
      to: 'hiring@acme.test',
      expiredCount: 2,
    });
    expect(setCronRecordsProcessed).toHaveBeenCalledWith(3);
  });
});
