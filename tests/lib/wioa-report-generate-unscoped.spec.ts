// @vitest-environment node
/**
 * generateWioaReport powers both the monthly cron and POST
 * /api/admin/reports/wioa/generate. It currently counts users/placements
 * with no organizationId (pinned, not "fixed" to a tenant argument).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  userCount: vi.fn(),
  progressGroupBy: vi.fn(),
  placementCount: vi.fn(),
  placementAggregate: vi.fn(),
  enrollmentGroupBy: vi.fn(),
  placementGroupBy: vi.fn(),
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    user: { count: h.userCount },
    courseProgress: { groupBy: h.progressGroupBy },
    placementRecord: {
      count: h.placementCount,
      aggregate: h.placementAggregate,
      groupBy: h.placementGroupBy,
    },
    courseEnrollment: { groupBy: h.enrollmentGroupBy },
  },
}));

const { generateWioaReport } = await import('@/lib/cron/wioa-report');

describe('generateWioaReport query scope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.userCount.mockResolvedValue(0);
    h.progressGroupBy.mockResolvedValue([]);
    h.placementCount.mockResolvedValue(0);
    h.placementAggregate.mockResolvedValue({ _avg: { salaryOffered: null } });
    h.enrollmentGroupBy.mockResolvedValue([]);
    h.placementGroupBy.mockResolvedValue([]);
  });

  it('counts members and placements without an organizationId filter (pinned)', async () => {
    const start = new Date('2026-01-01T00:00:00.000Z');
    const end = new Date('2026-01-31T23:59:59.999Z');
    const report = await generateWioaReport({ start, end });
    expect(report.periodStart).toBe(start.toISOString());
    expect(report.periodEnd).toBe(end.toISOString());

    const memberWhere = h.userCount.mock.calls[0][0].where as Record<string, unknown>;
    expect(memberWhere).toEqual({
      deletedAt: null,
      createdAt: { gte: start, lte: end },
    });
    expect(memberWhere).not.toHaveProperty('organizationId');
    expect(generateWioaReport.length).toBe(1);

    const placementWhere = h.placementCount.mock.calls[0][0].where as Record<string, unknown>;
    expect(placementWhere).toEqual({
      placedAt: { gte: start, lte: end },
      startDateVerified: true,
    });
    expect(placementWhere).not.toHaveProperty('organizationId');
    expect(placementWhere).not.toHaveProperty('user');
  });
});
