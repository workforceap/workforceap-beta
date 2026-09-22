import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';
import { getAdminMetrics } from './metrics';
import { prisma } from '@/lib/db/prisma';
import { SYSTEM_GENERATED_MEMBER_EVENTS } from './healthScore';

const mockCache = {
  getCache: vi.fn(),
  setCache: vi.fn(),
};

vi.mock('@/lib/cache', () => ({
  getCache: (...args: unknown[]) => mockCache.getCache(...args),
  setCache: (...args: unknown[]) => mockCache.setCache(...args),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/tenant/withTenantScope', () => ({
  withTenantScope: async (_orgId: string, fn: (db: unknown) => Promise<unknown>) =>
    fn({ user: { count: vi.fn().mockResolvedValue(0) } }),
}));
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    memberEvent: { findMany: vi.fn().mockResolvedValue([]) },
    goal: { count: vi.fn().mockResolvedValue(0) },
    jobApplication: { count: vi.fn().mockResolvedValue(0) },
    resourceProgress: { count: vi.fn().mockResolvedValue(0) },
    learningProgress: { count: vi.fn().mockResolvedValue(0) },
    aIToolResult: { count: vi.fn().mockResolvedValue(0), groupBy: vi.fn().mockResolvedValue([]) },
    user: { findMany: vi.fn().mockResolvedValue([]) },
    placementRecord: { count: vi.fn().mockResolvedValue(0) },
    userCertification: { count: vi.fn().mockResolvedValue(0) },
    workflowDiagnostic: { count: vi.fn().mockResolvedValue(0) },
    $queryRaw: vi.fn().mockResolvedValue([]),
  },
}));

describe('admin metrics caching', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('getAdminMetrics uses cache with org-scoped key', async () => {
    const cachedMetrics = {
      totalMembers: 42,
      weeklyActiveMembers: 10,
      inactive14Days: 5,
      activeGoals: 3,
      applicationsSubmitted: 2,
      resourcesCompleted: 1,
      aiToolRuns: 0,
      aiToolStats: { runsLastNDays: 0, trend: 0, totalRuns: 0, breakdown: [] },
      pathwayStarts: 0,
      inactiveUserIds: [],
      dailyActivity: [],
      enrollmentByProgram: [],
      placementStats: { enrolled: 0, placed: 0, certifications: 0, placementRate: 0 },
      careerOsMetrics: {
        completionEventsReceived: 0,
        actionsCreated: 0,
        actionsCompleted: 0,
        actionsDismissed: 0,
        actionsPending: 0,
        followThroughRate: 0,
      },
      degradedSlices: [],
    };

    mockCache.getCache.mockResolvedValueOnce(cachedMetrics);
    const result = await getAdminMetrics('org-123');

    expect(mockCache.getCache).toHaveBeenCalledWith('admin:metrics:org-123');
    expect(mockCache.setCache).not.toHaveBeenCalled();
    expect(result.totalMembers).toBe(42);
  });

  it('getAdminMetrics computes on a cache miss and does not cache a zero-filled partial result', async () => {
    mockCache.getCache.mockResolvedValue(null);

    // Queries settle independently; the mocked Prisma surface is missing
    // several models (memberEvent.count, $queryRaw rows, ...), so slices
    // degrade to zeros instead of throwing. Such a partial result is returned
    // but must never be written to the shared cache, or every viewer sees
    // zeros for the TTL (number audit 2026-09-20, S29).
    const result = await getAdminMetrics('org-456');
    expect(result.totalMembers).toBe(0);
    expect(result.degradedSlices.length).toBeGreaterThan(0);
    expect(mockCache.getCache).toHaveBeenCalledWith('admin:metrics:org-456');
    expect(mockCache.setCache).not.toHaveBeenCalled();
  });

  it('weekly active and inactive members count only events the member caused, never platform mail', async () => {
    mockCache.getCache.mockResolvedValue(null);
    // A tiny member_events table: two members who signed in, plus three
    // members who only ever received a nudge mail. Mike's activity rule
    // (2026-09-20): mail the platform sent *to* a member is not activity.
    const events = [
      { userId: 'm1', eventName: 'login' },
      { userId: 'm2', eventName: 'login' },
      { userId: 'm3', eventName: 'inactive_nudge_sent' },
      { userId: 'm4', eventName: 'weekly_recap_generated' },
      { userId: 'm5', eventName: 'application_reminder_sent' },
    ];
    vi.mocked(prisma.$queryRaw).mockImplementation((async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const q = Prisma.sql(strings, ...values);
      if (!q.sql.includes('COUNT(DISTINCT me.user_id)')) return [];
      // Evaluate the query's own exclusion list against the table.
      const excludedSlot = q.sql.replace(/\s+/g, ' ').match(/me\.event_name NOT IN \(((?:\?,?)+)\)/);
      const excluded = new Set<string>();
      if (excludedSlot) {
        const placeholders = excludedSlot[1].split(',').length;
        const bound = q.values.filter((v): v is string => typeof v === 'string');
        // The exclusion values are the trailing string params of the query.
        for (const name of bound.slice(bound.length - placeholders)) excluded.add(name);
      }
      const active = new Set(events.filter((e) => !excluded.has(e.eventName)).map((e) => e.userId));
      return [{ count: BigInt(active.size) }];
    }) as never);
    vi.mocked(prisma.memberEvent.findMany).mockResolvedValue([]);

    const result = await getAdminMetrics('org-activity');

    expect(SYSTEM_GENERATED_MEMBER_EVENTS).toEqual(expect.arrayContaining(['inactive_nudge_sent', 'weekly_recap_generated', 'application_reminder_sent']));
    // 2 members signed in; the 3 who were only mailed are not "weekly active".
    expect(result.weeklyActiveMembers).toBe(2);
  });

  it('bypasses shared cache during a read-only audit', async () => {
    const result = await getAdminMetrics('org-audit', { readOnlyAudit: true });

    expect(result.totalMembers).toBe(0);
    expect(mockCache.getCache).not.toHaveBeenCalled();
    expect(mockCache.setCache).not.toHaveBeenCalled();
  });
});
