import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  awardPoints: vi.fn(),
  sendCert: vi.fn(),
  settle: vi.fn(),
  persistEvent: vi.fn(),
  logCronRun: vi.fn(),
  setCronRecordsProcessed: vi.fn(),
  getProgramBySlug: vi.fn(),
  getProgramDisplayTitle: vi.fn(),
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
    courseProgress: { findMany: mocks.findMany },
  },
}));

vi.mock('@/lib/email', () => ({
  sendCertCelebrationEmail: mocks.sendCert,
}));

vi.mock('@/lib/email/pacing', () => ({
  createBulkEmailCronPacer: () => ({
    run: <T>(operation: () => Promise<T>) => operation(),
    summary: () => ({ admitted: 0, skipped: 0 }),
  }),
}));

vi.mock('@/lib/admin/logCronRun', () => ({
  logCronRun: mocks.logCronRun,
}));

vi.mock('@/lib/cron/withCronLogging', () => ({
  withCronLogging: (_key: string, handler: (req: Request) => Promise<Response>) => handler,
}));

vi.mock('@/lib/cron/cronExecution', () => ({
  setCronRecordsProcessed: mocks.setCronRecordsProcessed,
}));

vi.mock('@/lib/member/points', () => ({
  awardPoints: mocks.awardPoints,
}));

vi.mock('@/lib/member/referrals', () => ({
  settlePendingReferralRewards: mocks.settle,
}));

vi.mock('@/lib/events/track', () => ({
  persistEvent: mocks.persistEvent,
}));

vi.mock('@/lib/content/programs', () => ({
  getProgramBySlug: mocks.getProgramBySlug,
  getProgramDisplayTitle: mocks.getProgramDisplayTitle,
}));

import { GET } from '@/app/api/cron/milestone-celebration/route';
import { prisma } from '@/lib/db/prisma';

const NOW = new Date('2026-11-01T10:00:00.000Z');

function expectedYesterday(): Date {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);
  return yesterday;
}

function completion(overrides: Record<string, unknown> = {}) {
  return {
    id: 'progress-1',
    userId: 'member-1',
    programSlug: 'cyber',
    courseSlug: 'course-a',
    completedAt: new Date('2026-10-31T15:00:00.000Z'),
    user: { email: 'member@example.com', fullName: 'Ada Lovelace' },
    ...overrides,
  };
}

function request() {
  return new Request('http://localhost/api/cron/milestone-celebration');
}

describe('GET /api/cron/milestone-celebration', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.clearAllMocks();
    mocks.findMany.mockResolvedValue([]);
    mocks.awardPoints.mockResolvedValue({ awarded: true, points: 25 });
    mocks.sendCert.mockResolvedValue({ ok: true });
    mocks.settle.mockResolvedValue({ scanned: 0, rewarded: 0, skipped: 0, errors: 0 });
    mocks.persistEvent.mockResolvedValue(undefined);
    mocks.getProgramBySlug.mockImplementation((slug: string) =>
      slug === 'cyber' ? { slug: 'cyber', title: 'Cybersecurity' } : undefined,
    );
    mocks.getProgramDisplayTitle.mockImplementation((program: { title?: string } | string) =>
      typeof program === 'string' ? program : (program.title ?? 'unknown'),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('scans completed progress since local midnight yesterday and excludes deleted members', async () => {
    await GET(request());

    expect(prisma.courseProgress.findMany).toHaveBeenCalledWith({
      where: {
        status: 'COMPLETED',
        completedAt: { gte: expectedYesterday() },
        user: { deletedAt: null },
      },
      orderBy: { completedAt: 'desc' },
      select: {
        id: true,
        userId: true,
        programSlug: true,
        courseSlug: true,
        completedAt: true,
        user: { select: { email: true, fullName: true } },
      },
      take: 100,
    });
  });

  it('skips the celebration email when points were not freshly awarded', async () => {
    mocks.findMany.mockResolvedValue([completion()]);
    mocks.awardPoints.mockResolvedValue({ awarded: false, points: 0 });

    const json = await (await GET(request())).json();

    expect(json).toMatchObject({ sent: 0, total: 1, pointsAwardedCount: 0 });
    expect(mocks.sendCert).not.toHaveBeenCalled();
    expect(mocks.persistEvent).not.toHaveBeenCalled();
    expect(mocks.setCronRecordsProcessed).toHaveBeenCalledWith(0);
  });

  it('treats a thrown award as not awarded and does not send', async () => {
    mocks.findMany.mockResolvedValue([completion()]);
    mocks.awardPoints.mockRejectedValue(new Error('points down'));

    const json = await (await GET(request())).json();

    expect(json).toMatchObject({ sent: 0, total: 1, pointsAwardedCount: 0 });
    expect(mocks.sendCert).not.toHaveBeenCalled();
  });

  it('does not award points or email when the member has no address', async () => {
    mocks.findMany.mockResolvedValue([
      completion({ id: 'no-email', user: { email: '', fullName: 'No Mail' } }),
      completion({ id: 'missing-user', user: null }),
    ]);

    const json = await (await GET(request())).json();

    expect(json).toMatchObject({ sent: 0, total: 2, pointsAwardedCount: 0 });
    expect(mocks.awardPoints).not.toHaveBeenCalled();
    expect(mocks.sendCert).not.toHaveBeenCalled();
  });

  it('awards once per CourseProgress id and emails only freshly awarded completions', async () => {
    mocks.findMany.mockResolvedValue([
      completion({ id: 'already-celebrated', userId: 'member-1' }),
      completion({
        id: 'fresh-progress',
        userId: 'member-2',
        courseSlug: 'course-b',
        user: { email: 'second@example.com', fullName: 'Grace Hopper' },
      }),
    ]);
    mocks.awardPoints
      .mockResolvedValueOnce({ awarded: false, points: 0 })
      .mockResolvedValueOnce({ awarded: true, points: 25 });

    const json = await (await GET(request())).json();

    expect(mocks.awardPoints).toHaveBeenNthCalledWith(
      1,
      'member-1',
      'certification_earned',
      'already-celebrated',
      25,
      { note: 'Course completion celebration: Cybersecurity — course-a' },
    );
    expect(mocks.awardPoints).toHaveBeenNthCalledWith(
      2,
      'member-2',
      'certification_earned',
      'fresh-progress',
      25,
      { note: 'Course completion celebration: Cybersecurity — course-b' },
    );
    expect(mocks.sendCert).toHaveBeenCalledTimes(1);
    expect(mocks.sendCert).toHaveBeenCalledWith({
      to: 'second@example.com',
      fullName: 'Grace Hopper',
      certName: 'Cybersecurity',
      earnedAt: expect.any(Date),
      pointsAwarded: 25,
      testimonial: null,
    });
    expect(mocks.persistEvent).toHaveBeenCalledTimes(1);
    expect(mocks.persistEvent).toHaveBeenCalledWith(
      {
        userId: 'member-2',
        eventName: 'certification_celebration_sent',
        entityType: 'course_progress',
        entityId: 'fresh-progress',
        metadata: {
          programSlug: 'cyber',
          programName: 'Cybersecurity',
          courseSlug: 'course-b',
          pointsAwarded: 25,
        },
      },
      prisma,
    );
    expect(json).toMatchObject({ sent: 1, total: 2, pointsAwardedCount: 1 });
    expect(mocks.setCronRecordsProcessed).toHaveBeenCalledWith(1);
  });

  it('falls back to the program slug when the catalog has no title', async () => {
    mocks.findMany.mockResolvedValue([
      completion({ programSlug: 'unknown-track', courseSlug: 'capstone' }),
    ]);

    await GET(request());

    expect(mocks.awardPoints).toHaveBeenCalledWith(
      'member-1',
      'certification_earned',
      'progress-1',
      25,
      { note: 'Course completion celebration: unknown-track — capstone' },
    );
    expect(mocks.sendCert).toHaveBeenCalledWith(
      expect.objectContaining({ certName: 'unknown-track' }),
    );
  });

  it('does not count a failed send or write the celebration event', async () => {
    mocks.findMany.mockResolvedValue([completion()]);
    mocks.sendCert.mockResolvedValue({ ok: false, error: 'bounce' });

    const json = await (await GET(request())).json();

    expect(json).toMatchObject({ sent: 0, total: 1, pointsAwardedCount: 1 });
    expect(mocks.persistEvent).not.toHaveBeenCalled();
    expect(mocks.setCronRecordsProcessed).toHaveBeenCalledWith(0);
  });

  it('keeps the send count when persistEvent throws', async () => {
    mocks.findMany.mockResolvedValue([completion()]);
    mocks.persistEvent.mockRejectedValue(new Error('audit down'));

    const json = await (await GET(request())).json();

    expect(json).toMatchObject({ sent: 1, total: 1, pointsAwardedCount: 1 });
    expect(mocks.setCronRecordsProcessed).toHaveBeenCalledWith(1);
  });

  it('captures referral settlement failure without failing the cron', async () => {
    mocks.settle.mockRejectedValue(new Error('referral store down'));

    const res = await GET(request());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.referralSettlement).toEqual({ error: 'referral store down' });
    expect(mocks.logCronRun).toHaveBeenCalledWith(
      'cron_milestone_celebration',
      expect.objectContaining({
        sent: 0,
        total: 0,
        pointsAwardedCount: 0,
        referralSettlement: { error: 'referral store down' },
      }),
    );
  });
});
