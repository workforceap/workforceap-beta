/**
 * Public "placed" figures count staff-verified placements only
 * (docs/OUTCOMES-METHODOLOGY.md, "Public placement counts"; Mike, Slack
 * 2026-09-23 05:08 UTC).
 *
 * Each public surface is fed the same two placement rows: one a counselor
 * verified, and one an employer "hired" click created
 * (`startDateVerified: false`, lib/placement/recordPlacementFromApplication.ts).
 * The fake db applies the query's own `startDateVerified` filter to the rows,
 * so a surface that drops the filter counts the unverified row and fails.
 */
import { Prisma, type PrismaClient } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/db/optionalBuildDb', () => ({
  shouldSkipOptionalDbQueriesAtBuild: vi.fn(() => false),
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    $queryRaw: vi.fn(),
    user: { count: vi.fn(), findMany: vi.fn(), groupBy: vi.fn() },
    employer: { count: vi.fn() },
    job: { count: vi.fn() },
    placementRecord: { count: vi.fn() },
    courseProgress: { findMany: vi.fn() },
  },
}));

import { prisma } from '@/lib/db/prisma';
import { getGoogleItLandingMetrics } from '@/lib/marketing/googleItSupportLanding';
import { getPublicImpactStats } from '@/lib/marketing/publicImpactStats';
import { formatTrustStripLine, getTrustStripMetrics } from '@/lib/marketing/trustStripMetrics';
import { getOutcomesSocialProof } from '@/lib/outcomes/socialProof';
import { VERIFIED_PLACEMENT_WHERE } from '@/lib/placement/verifiedPlacement';

type Row = {
  id: string;
  userId: string;
  startDateVerified: boolean;
  salaryOffered: number | null;
  jobTitle: string;
  programSlug: string | null;
  placedAt: Date;
};

const VERIFIED: Row = {
  id: 'placement-verified',
  userId: 'member-verified',
  startDateVerified: true,
  salaryOffered: 40000,
  jobTitle: 'IT Support Specialist',
  programSlug: 'google-it-support',
  placedAt: new Date('2026-08-01T00:00:00Z'),
};

// What an employer "hired" click writes: a real row, not yet verified.
const EMPLOYER_HIRED_UNVERIFIED: Row = {
  id: 'placement-unverified',
  userId: 'member-unverified',
  startDateVerified: false,
  salaryOffered: 90000,
  jobTitle: 'Help Desk Technician',
  programSlug: 'google-it-support',
  placedAt: new Date('2026-09-01T00:00:00Z'),
};

const ROWS: Row[] = [VERIFIED, EMPLOYER_HIRED_UNVERIFIED];

/** Applies the placement-level filters these queries use; user/OR joins are out of scope. */
function placementMatches(row: Row, where: Record<string, unknown> | undefined): boolean {
  if (!where) return true;
  if ('startDateVerified' in where && row.startDateVerified !== where.startDateVerified) return false;
  const salary = where.salaryOffered as { not?: unknown } | undefined;
  if (salary && 'not' in salary && salary.not === null && row.salaryOffered == null) return false;
  return true;
}

function fakePlacementRecord() {
  return {
    count: vi.fn(async (args?: { where?: Record<string, unknown> }) =>
      ROWS.filter((r) => placementMatches(r, args?.where)).length,
    ),
    aggregate: vi.fn(async (args: { where?: Record<string, unknown> }) => {
      const matched = ROWS.filter((r) => placementMatches(r, args.where) && r.salaryOffered != null);
      const avg = matched.length
        ? matched.reduce((sum, r) => sum + (r.salaryOffered ?? 0), 0) / matched.length
        : null;
      return { _avg: { salaryOffered: avg } };
    }),
    findMany: vi.fn(async (args: { where?: Record<string, unknown> }) =>
      ROWS.filter((r) => placementMatches(r, args.where)).map((r) => ({
        id: r.id,
        jobTitle: r.jobTitle,
        programSlug: r.programSlug,
        placedAt: r.placedAt,
      })),
    ),
  };
}

describe('the verified-placement definition', () => {
  it('is the startDateVerified flag the funder report and partner CSV use', () => {
    expect(VERIFIED_PLACEMENT_WHERE).toEqual({ startDateVerified: true });
  });
});

describe('TrustStrip "members placed" on /apply', () => {
  it('does not count or average an unverified employer-hired row', async () => {
    const placementRecord = fakePlacementRecord();
    const db = {
      placementRecord,
      employer: { count: vi.fn().mockResolvedValue(3) },
    } as unknown as PrismaClient;

    const metrics = await getTrustStripMetrics('org-1', db);

    expect(metrics.membersPlaced).toBe(1);
    expect(metrics.avgStartingWage).toBe(40000);
    expect(formatTrustStripLine(metrics)).toBe('1 members placed · $40K avg starting wage');
  });

  it('keeps the no-number placeholder when only unverified rows exist', async () => {
    const onlyUnverified = {
      count: vi.fn(async (args?: { where?: Record<string, unknown> }) =>
        [EMPLOYER_HIRED_UNVERIFIED].filter((r) => placementMatches(r, args?.where)).length,
      ),
      aggregate: vi.fn(async (args: { where?: Record<string, unknown> }) => ({
        _avg: {
          salaryOffered: placementMatches(EMPLOYER_HIRED_UNVERIFIED, args.where)
            ? EMPLOYER_HIRED_UNVERIFIED.salaryOffered
            : null,
        },
      })),
    };
    const db = {
      placementRecord: onlyUnverified,
      employer: { count: vi.fn().mockResolvedValue(3) },
    } as unknown as PrismaClient;

    const metrics = await getTrustStripMetrics('org-1', db);

    expect(metrics).toMatchObject({ membersPlaced: 0, avgStartingWage: null, hasLiveData: false });
    expect(formatTrustStripLine(metrics)).not.toMatch(/\d/);
  });
});

describe('/outcomes and /partners social proof', () => {
  it('counts and shows story cards for verified placements only', async () => {
    const placementRecord = fakePlacementRecord();
    const db = {
      user: {
        count: vi.fn()
          .mockResolvedValueOnce(10) // enrolled
          .mockResolvedValueOnce(2), // referred members
      },
      placementRecord,
      partnerReferral: { findMany: vi.fn().mockResolvedValue([]) },
      partner: { count: vi.fn().mockResolvedValue(1) },
    };

    const result = await getOutcomesSocialProof(db as never, { enabled: true, baseUrl: 'https://www.workforceap.org' });

    expect(result.storyCards.map((c) => c.id)).toEqual(['placement-verified']);
    // Partner placements: 1 verified of 2 referred, not 2 of 2.
    expect(result.partnerSnapshot).toMatchObject({ placements: 1, placementRate: { label: '1 of 2', suppressed: true } });
    for (const call of placementRecord.count.mock.calls) {
      expect(call[0]?.where).toMatchObject(VERIFIED_PLACEMENT_WHERE);
    }
  });
});

describe('Google IT Support landing placement card', () => {
  it('does not count an unverified employer-hired row', async () => {
    const placementRecord = fakePlacementRecord();
    const db = {
      courseEnrollment: { count: vi.fn().mockResolvedValue(40) },
      placementRecord,
      $queryRaw: vi.fn().mockResolvedValue([{ count: 0 }]),
    } as unknown as PrismaClient;

    const metrics = await getGoogleItLandingMetrics('org-1', db);

    expect(metrics.placementCount).toBe(1);
  });
});

describe('/impact public stats', () => {
  type FakeUser = { placementRecord: Row | null };
  const USERS: FakeUser[] = [{ placementRecord: VERIFIED }, { placementRecord: EMPLOYER_HIRED_UNVERIFIED }];

  beforeEach(() => {
    vi.mocked(prisma.user.count).mockImplementation((async (args?: { where?: Record<string, unknown> }) => {
      const pr = args?.where?.placementRecord as { isNot?: null; is?: Record<string, unknown> } | undefined;
      if (!pr) return USERS.length;
      if ('is' in pr) return USERS.filter((u) => u.placementRecord && placementMatches(u.placementRecord, pr.is)).length;
      return USERS.filter((u) => u.placementRecord != null).length;
    }) as never);
    vi.mocked(prisma.placementRecord.count).mockImplementation((async (args?: { where?: Record<string, unknown> }) =>
      ROWS.filter((r) => placementMatches(r, args?.where)).length) as never);
    vi.mocked(prisma.user.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.user.groupBy).mockResolvedValue([] as never);
    vi.mocked(prisma.employer.count).mockResolvedValue(0 as never);
    vi.mocked(prisma.job.count).mockResolvedValue(0 as never);
    vi.mocked(prisma.courseProgress.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.$queryRaw).mockImplementation((async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = Prisma.sql(strings, ...values).sql;
      return sql.includes('avg_delta') ? [{ avg_delta: null, n: 0 }] : [];
    }) as never);
  });

  it('does not count an unverified employer-hired row in hires or the placement rate', async () => {
    const stats = await getPublicImpactStats('org-1');

    expect(stats.hiresMade).toBe(1);
    // 1 verified placement among 2 enrolled members, not 2 of 2.
    expect(stats.placementRatePct).toBe(50);
  });

  it('limits the salary-increase aggregate to verified placements', async () => {
    await getPublicImpactStats('org-1');

    const calls = vi.mocked(prisma.$queryRaw).mock.calls as unknown as Array<[TemplateStringsArray, ...unknown[]]>;
    const salarySql = calls
      .map(([strings, ...values]) => Prisma.sql(strings, ...values).sql)
      .find((sql) => sql.includes('avg_delta'));
    expect(salarySql).toContain('pr.start_date_verified = true');
  });
});
