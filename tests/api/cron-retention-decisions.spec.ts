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
    placementRecord: { findMany: vi.fn() },
    counselorAssignment: { findMany: vi.fn() },
    profile: { findMany: vi.fn() },
    userRole: { findMany: vi.fn() },
    user: { findMany: vi.fn() },
  },
}));

vi.mock('@/lib/notifications/create', () => ({ createNotification: vi.fn() }));
vi.mock('@/lib/observability/captureApiError', () => ({ captureApiError: vi.fn() }));
vi.mock('@/lib/admin/logCronRun', () => ({ logCronRun: vi.fn() }));
vi.mock('@/lib/cron/cronExecution', () => ({ setCronRecordsProcessed: vi.fn() }));
vi.mock('@/lib/cron/withCronLogging', () => ({
  withCronLogging: vi.fn((_key: string, handler: (req: Request) => Promise<Response>) => handler),
}));

import { GET } from '@/app/api/cron/retention-decisions/route';
import { prisma } from '@/lib/db/prisma';
import { createNotification } from '@/lib/notifications/create';
import { setCronRecordsProcessed } from '@/lib/cron/cronExecution';

const prismaMock = prisma as unknown as {
  placementRecord: { findMany: ReturnType<typeof vi.fn> };
  counselorAssignment: { findMany: ReturnType<typeof vi.fn> };
  profile: { findMany: ReturnType<typeof vi.fn> };
  userRole: { findMany: ReturnType<typeof vi.fn> };
  user: { findMany: ReturnType<typeof vi.fn> };
};

const NOW = new Date('2026-10-31T12:00:00.000Z');
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function daysAgo(days: number) {
  return new Date(NOW.getTime() - days * MS_PER_DAY);
}

function request() {
  return new Request('http://localhost/api/cron/retention-decisions');
}

describe('GET /api/cron/retention-decisions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    prismaMock.placementRecord.findMany.mockResolvedValue([]);
    prismaMock.counselorAssignment.findMany.mockResolvedValue([]);
    prismaMock.profile.findMany.mockResolvedValue([]);
    prismaMock.userRole.findMany.mockResolvedValue([]);
    prismaMock.user.findMany.mockResolvedValue([]);
    vi.mocked(createNotification).mockResolvedValue(undefined as never);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns a quiet success when no live placements are due', async () => {
    const res = await GET(request());
    const json = await res.json();

    expect(json).toEqual({
      ok: true,
      checkedAt: NOW.toISOString(),
      duePlacements: 0,
      counselorsNotified: 0,
      adminDigestsSent: 0,
    });
    expect(prismaMock.placementRecord.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        OR: [{ retentionDecision: null }, { retentionDecision: 'pending' }],
        placedAt: { lte: new Date(NOW.getTime() - 85 * MS_PER_DAY) },
      },
      take: 2000,
    }));
    expect(createNotification).not.toHaveBeenCalled();
    expect(setCronRecordsProcessed).toHaveBeenCalledWith(0);
  });

  it('excludes deleted members, buckets 180-day rows once, and notifies the counselor once', async () => {
    prismaMock.placementRecord.findMany.mockResolvedValue([
      {
        id: 'p-90',
        employerName: 'Acme',
        placedAt: daysAgo(90),
        userId: 'member-assigned',
        user: { id: 'member-assigned', organizationId: 'org-a', deletedAt: null },
      },
      {
        id: 'p-180',
        employerName: 'Acme',
        placedAt: daysAgo(180),
        userId: 'member-assigned',
        user: { id: 'member-assigned', organizationId: 'org-a', deletedAt: null },
      },
      {
        id: 'p-deleted',
        employerName: 'Gone Inc',
        placedAt: daysAgo(90),
        userId: 'member-deleted',
        user: { id: 'member-deleted', organizationId: 'org-a', deletedAt: daysAgo(1) },
      },
    ]);
    prismaMock.counselorAssignment.findMany.mockResolvedValue([
      {
        memberId: 'member-assigned',
        counselor: { id: 'c-1', active: true, userId: 'counselor-1' },
      },
    ]);

    const res = await GET(request());
    const json = await res.json();

    expect(json).toMatchObject({
      ok: true,
      duePlacements: 2,
      counselorsNotified: 1,
      orgsWithUnassignedMembers: 0,
      adminDigestsSent: 0,
    });
    expect(prismaMock.counselorAssignment.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { memberId: { in: ['member-assigned', 'member-assigned'] }, active: true },
    }));
    expect(createNotification).toHaveBeenCalledOnce();
    expect(createNotification).toHaveBeenCalledWith({
      userId: 'counselor-1',
      type: 'task_assigned',
      title: '2 retention decisions due',
      body: '1 member due for a 90-day retention decision and 1 due for 180-day — funder-payable milestones waiting on your call.',
      data: { link: '/admin/placements/retention' },
    });
    expect(prismaMock.profile.findMany).not.toHaveBeenCalled();
    expect(setCronRecordsProcessed).toHaveBeenCalledWith(2);
  });

  it('rolls unassigned live members into an org-scoped admin digest', async () => {
    prismaMock.placementRecord.findMany.mockResolvedValue([
      {
        id: 'p-unassigned',
        employerName: 'Beta',
        placedAt: daysAgo(90),
        userId: 'member-open',
        user: { id: 'member-open', organizationId: 'org-a', deletedAt: null },
      },
    ]);
    prismaMock.counselorAssignment.findMany.mockResolvedValue([]);
    prismaMock.profile.findMany.mockResolvedValue([
      { userId: 'admin-a' },
      { userId: 'admin-other' },
    ]);
    prismaMock.userRole.findMany.mockResolvedValue([{ userId: 'admin-a' }]);
    prismaMock.user.findMany.mockResolvedValue([
      { id: 'admin-a', organizationId: 'org-a' },
    ]);

    const res = await GET(request());
    const json = await res.json();

    expect(json).toMatchObject({
      duePlacements: 1,
      counselorsNotified: 0,
      orgsWithUnassignedMembers: 1,
      adminDigestsSent: 1,
    });
    expect(prismaMock.user.findMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['admin-a', 'admin-other'] },
        deletedAt: null,
        organizationId: { in: ['org-a'] },
      },
      select: { id: true, organizationId: true },
    });
    expect(createNotification).toHaveBeenCalledOnce();
    expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'admin-a',
      title: '1 retention decision due — no counselor assigned',
      data: { link: '/admin/placements/retention' },
    }));
  });
});
