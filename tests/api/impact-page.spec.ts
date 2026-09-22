import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

// ─── Mocks ───
vi.mock('server-only', () => ({}));

vi.mock('@/lib/db/optionalBuildDb', () => ({
  shouldSkipOptionalDbQueriesAtBuild: vi.fn(() => false),
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    $transaction: vi.fn(async (arg: any) => { const { prisma } = await import('@/lib/db/prisma'); return typeof arg === 'function' ? arg(prisma) : Promise.all(arg); }),
    $queryRaw: vi.fn(),
    user: {
      count: vi.fn(),
      findMany: vi.fn(),
      groupBy: vi.fn(),
    },
    employer: {
      count: vi.fn(),
    },
    job: {
      count: vi.fn(),
    },
    placementRecord: {
      count: vi.fn(),
    },
    memberProgramProgress: {
      count: vi.fn(),
      groupBy: vi.fn(),
    },
    courseProgress: {
      findMany: vi.fn(),
    },
  },
}));

// ─── Imports after mocks ───
import {
  getPublicImpactStats,
  EMPTY_PUBLIC_IMPACT_STATS,
  buildPublishedImpactJsonLdStats,
  hasPublicImpactEnrolledCohort,
  hasPublicImpactLiveData,
  type PublicImpactStats,
} from '@/lib/marketing/publicImpactStats';
import { prisma } from '@/lib/db/prisma';
import { MEMBER_ONLY_EXCLUDED_EMAILS, MEMBER_ONLY_EXCLUDED_EMAIL_NOT, MEMBER_ONLY_WHERE } from '@/lib/admin/memberOnlyWhere';
import { shouldSkipOptionalDbQueriesAtBuild } from '@/lib/db/optionalBuildDb';
import { getProgramBySlug } from '@/lib/content/programs';

const ORG_ID = 'org-test-123';

function makeEnrolledUser(overrides: {
  id: string;
  programSlug: string;
  avgPercent: number;
  coursesCompleted: number;
  hasPlacement?: boolean;
  enrolledAt?: Date;
  createdAt?: Date;
  lastUpdatedAt?: Date;
}) {
  return {
    id: overrides.id,
    enrolledProgram: overrides.programSlug,
    enrolledAt: overrides.enrolledAt ?? new Date('2024-01-01'),
    createdAt: overrides.createdAt ?? new Date('2024-01-01'),
    courseEnrollments: [],
    coursesCompleted: [],
    memberProgramProgress: [
      {
        programSlug: overrides.programSlug,
        averagePercent: overrides.avgPercent,
        coursesCompleted: overrides.coursesCompleted,
        lastUpdatedAt: overrides.lastUpdatedAt ?? new Date('2024-03-01'),
      },
    ],
    placementRecord: overrides.hasPlacement ? { id: `placement-${overrides.id}` } : null,
  };
}

type EnrolledUser = ReturnType<typeof makeEnrolledUser>;

function mockImpactQueries(options: {
  membersServed?: number;
  enrolledUsers?: EnrolledUser[];
  enrolledCount?: number;
  placedAmongEnrolled?: number;
  employersPartnered?: number;
  jobsPosted?: number;
  hiresMade?: number;
  avgSalaryIncreaseDollars?: number | null;
  salaryIncreaseSampleSize?: number;
  courseProgress?: Array<{ userId: string; programSlug: string; completedAt: Date }>;
} = {}) {
  const enrolledUsers = options.enrolledUsers ?? [];
  const enrolledCount = options.enrolledCount ?? enrolledUsers.length;
  const placedAmongEnrolled =
    options.placedAmongEnrolled ?? enrolledUsers.filter((user) => user.placementRecord).length;
  const enrolledBySlug = new Map<string, number>();
  const completedBySlug = new Map<string, number>();
  for (const user of enrolledUsers) {
    enrolledBySlug.set(user.enrolledProgram, (enrolledBySlug.get(user.enrolledProgram) ?? 0) + 1);
    const expectedCourses = getProgramBySlug(user.enrolledProgram)?.courses.length ?? 0;
    if (
      expectedCourses > 0 &&
      user.memberProgramProgress.some(
        (progress) => progress.coursesCompleted === expectedCourses,
      )
    ) {
      completedBySlug.set(user.enrolledProgram, (completedBySlug.get(user.enrolledProgram) ?? 0) + 1);
    }
  }

  (prisma.user.count as any)
    .mockResolvedValueOnce(options.membersServed ?? enrolledUsers.length)
    .mockResolvedValueOnce(enrolledCount)
    .mockResolvedValueOnce(placedAmongEnrolled);
  (prisma.user.findMany as any).mockResolvedValue(enrolledUsers);
  (prisma.user.groupBy as any).mockResolvedValue(
    [...enrolledBySlug].map(([enrolledProgram, count]) => ({
      enrolledProgram,
      _count: { _all: count },
    })),
  );
  (prisma.memberProgramProgress.groupBy as any).mockResolvedValue(
    [...completedBySlug].map(([programSlug, count]) => ({
      programSlug,
      _count: { _all: count },
    })),
  );
  (prisma.employer.count as any).mockResolvedValue(options.employersPartnered ?? 0);
  (prisma.job.count as any).mockResolvedValue(options.jobsPosted ?? 0);
  (prisma.placementRecord.count as any).mockResolvedValue(options.hiresMade ?? placedAmongEnrolled);
  (prisma.$queryRaw as any)
    .mockResolvedValueOnce(
      [...completedBySlug].map(([program_slug, count]) => ({ program_slug, count })),
    )
    .mockResolvedValueOnce([
      {
        avg_delta: options.avgSalaryIncreaseDollars ?? null,
        n: options.salaryIncreaseSampleSize ?? 0,
      },
    ]);
  (prisma.courseProgress.findMany as any).mockResolvedValue(options.courseProgress ?? []);
}

describe('Impact Page — getPublicImpactStats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (shouldSkipOptionalDbQueriesAtBuild as any).mockReturnValue(false);
  });

  describe('public impact presentation helpers', () => {
    it('hasPublicImpactLiveData is false for empty stats', () => {
      expect(hasPublicImpactLiveData(EMPTY_PUBLIC_IMPACT_STATS)).toBe(false);
    });

    it('hasPublicImpactLiveData is true when any core metric is recorded', () => {
      expect(hasPublicImpactLiveData({ ...EMPTY_PUBLIC_IMPACT_STATS, membersServed: 1 })).toBe(true);
      expect(hasPublicImpactLiveData({ ...EMPTY_PUBLIC_IMPACT_STATS, employersPartnered: 2 })).toBe(true);
    });

    it('hasPublicImpactEnrolledCohort follows program rows', () => {
      expect(hasPublicImpactEnrolledCohort(EMPTY_PUBLIC_IMPACT_STATS)).toBe(false);
      expect(
        hasPublicImpactEnrolledCohort({
          ...EMPTY_PUBLIC_IMPACT_STATS,
          programs: [
            {
              programSlug: 'digital-literacy-empowerment-class',
              programTitle: 'Digital Literacy',
              enrolled: 1,
              completed: 0,
              avgDaysToComplete: null,
            },
          ],
        }),
      ).toBe(true);
    });

    it('buildPublishedImpactJsonLdStats omits unpublished 0% rates and empty metrics', () => {
      const labels = {
        membersServed: 'Members served',
        completionRate: 'Completion rate',
        placementRate: 'Placement rate',
        avgSalaryIncrease: 'Avg. salary increase',
        employerPartners: 'Employer partners',
        jobsPosted: 'Jobs posted',
        hires: 'Hires',
      };

      expect(buildPublishedImpactJsonLdStats(EMPTY_PUBLIC_IMPACT_STATS, labels)).toEqual([]);

      expect(
        buildPublishedImpactJsonLdStats(
          {
            ...EMPTY_PUBLIC_IMPACT_STATS,
            membersServed: 12,
            completionRatePct: 0,
            placementRatePct: 0,
          },
          labels,
        ),
      ).toEqual([{ label: 'Members served', value: '12' }]);

      expect(
        buildPublishedImpactJsonLdStats(
          {
            ...EMPTY_PUBLIC_IMPACT_STATS,
            membersServed: 8,
            completionRatePct: 40,
            placementRatePct: 25,
            programs: [
              {
                programSlug: 'digital-literacy-empowerment-class',
                programTitle: 'Digital Literacy',
                enrolled: 5,
                completed: 2,
                avgDaysToComplete: 30,
              },
            ],
            salaryIncreaseSampleSize: 2,
            avgSalaryIncreaseDollars: 12500,
            employersPartnered: 3,
            jobsPosted: 10,
            hiresMade: 4,
          },
          labels,
        ),
      ).toEqual([
        { label: 'Members served', value: '8' },
        { label: 'Completion rate', value: '40%' },
        { label: 'Placement rate', value: '25%' },
        { label: 'Avg. salary increase', value: '+$12,500' },
        { label: 'Employer partners', value: '3' },
        { label: 'Jobs posted', value: '10' },
        { label: 'Hires', value: '4' },
      ]);
    });
  });

  describe('live stats shape', () => {
    it('returns all expected public impact stat fields', async () => {
      mockImpactQueries({ membersServed: 10, employersPartnered: 5, jobsPosted: 20, hiresMade: 3 });

      const stats = await getPublicImpactStats(ORG_ID);

      expect(stats).toMatchObject<Partial<PublicImpactStats>>({
        membersServed: expect.any(Number),
        completionRatePct: expect.any(Number),
        placementRatePct: expect.any(Number),
        avgSalaryIncreaseDollars: expect.toBeOneOf([expect.any(Number), null]),
        salaryIncreaseSampleSize: expect.any(Number),
        programs: expect.any(Array),
        employersPartnered: expect.any(Number),
        jobsPosted: expect.any(Number),
        hiresMade: expect.any(Number),
        asOfLabel: expect.any(String),
      });
    });

    it('includes members served, completers, placements, and avg wage', async () => {
      const enrolled = [
        makeEnrolledUser({ id: 'u1', programSlug: 'digital-literacy-empowerment-class', avgPercent: 100, coursesCompleted: 10, hasPlacement: true }),
        makeEnrolledUser({ id: 'u2', programSlug: 'digital-literacy-empowerment-class', avgPercent: 100, coursesCompleted: 10, hasPlacement: true }),
        makeEnrolledUser({ id: 'u3', programSlug: 'it-support-professional-certificate-ibm', avgPercent: 50, coursesCompleted: 3, hasPlacement: false }),
      ];

      mockImpactQueries({
        membersServed: 5, // 2 non-enrolled + 3 enrolled
        enrolledUsers: enrolled,
        employersPartnered: 4,
        jobsPosted: 12,
        hiresMade: 2,
        avgSalaryIncreaseDollars: 15000,
        salaryIncreaseSampleSize: 2,
      });

      const stats = await getPublicImpactStats(ORG_ID);

      expect(stats.membersServed).toBe(5);
      expect(stats.completionRatePct).toBe(67); // 2 of 3 enrolled completed
      expect(stats.placementRatePct).toBe(67); // 2 of 3 enrolled placed
      expect(stats.avgSalaryIncreaseDollars).toBe(15000);
      expect(stats.salaryIncreaseSampleSize).toBe(2);
      expect(stats.hiresMade).toBe(2);
      expect(stats.employersPartnered).toBe(4);
      expect(stats.jobsPosted).toBe(12);
    });
  });

  describe('data accuracy', () => {
    it('membersServed matches prisma.user.count with member-only filter', async () => {
      mockImpactQueries({ membersServed: 42 });

      const stats = await getPublicImpactStats(ORG_ID);
      expect(stats.membersServed).toBe(42);

      const countCall = (prisma.user.count as any).mock.calls[0][0];
      expect(countCall.where).toMatchObject({
        organizationId: ORG_ID,
        deletedAt: null,
        // One definition of "a member" (WAP-182 item 3): email exclusion plus
        // the role predicate, both carried in the helper's single `NOT`.
        ...MEMBER_ONLY_WHERE,
      });
      expect(countCall.where.email).toEqual({ notIn: [...MEMBER_ONLY_EXCLUDED_EMAILS] });
      expect(countCall.where.NOT.slice(0, MEMBER_ONLY_EXCLUDED_EMAIL_NOT.length))
        .toEqual(MEMBER_ONLY_EXCLUDED_EMAIL_NOT);
    });

    it('placement count matches prisma.placementRecord.count', async () => {
      const enrolled = [
        makeEnrolledUser({ id: 'u1', programSlug: 'digital-literacy-empowerment-class', avgPercent: 100, coursesCompleted: 10, hasPlacement: true }),
        makeEnrolledUser({ id: 'u2', programSlug: 'digital-literacy-empowerment-class', avgPercent: 100, coursesCompleted: 10, hasPlacement: false }),
      ];

      mockImpactQueries({ membersServed: 2, enrolledUsers: enrolled, hiresMade: 1 });

      const stats = await getPublicImpactStats(ORG_ID);
      expect(stats.hiresMade).toBe(1);
      expect(stats.placementRatePct).toBe(50);
    });

    it('avg wage calculation is correct', async () => {
      const enrolled = [
        makeEnrolledUser({ id: 'u1', programSlug: 'digital-literacy-empowerment-class', avgPercent: 100, coursesCompleted: 10, hasPlacement: true }),
      ];

      mockImpactQueries({
        membersServed: 1,
        enrolledUsers: enrolled,
        hiresMade: 1,
        avgSalaryIncreaseDollars: (14000 + 15000 + 0) / 3,
        salaryIncreaseSampleSize: 3,
      });

      const stats = await getPublicImpactStats(ORG_ID);
      // (14000 + 15000 + 0) / 3 = 9666.666...
      expect(stats.avgSalaryIncreaseDollars).toBeCloseTo(9666.67, 1);
      expect(stats.salaryIncreaseSampleSize).toBe(3);
    });

    it('program rows aggregate enrolled and completed correctly', async () => {
      const enrolled = [
        makeEnrolledUser({ id: 'u1', programSlug: 'digital-literacy-empowerment-class', avgPercent: 100, coursesCompleted: 10, hasPlacement: false }),
        makeEnrolledUser({ id: 'u2', programSlug: 'digital-literacy-empowerment-class', avgPercent: 100, coursesCompleted: 10, hasPlacement: false }),
        makeEnrolledUser({ id: 'u3', programSlug: 'digital-literacy-empowerment-class', avgPercent: 50, coursesCompleted: 3, hasPlacement: false }),
        makeEnrolledUser({
          id: 'u4',
          programSlug: 'it-support-professional-certificate-ibm',
          avgPercent: 100,
          coursesCompleted:
            getProgramBySlug('it-support-professional-certificate-ibm')?.courses.length ?? 0,
          hasPlacement: false,
        }),
      ];

      mockImpactQueries({ membersServed: 4, enrolledUsers: enrolled });

      const stats = await getPublicImpactStats(ORG_ID);

      const dlProgram = stats.programs.find((p) => p.programSlug === 'digital-literacy-empowerment-class');
      const itProgram = stats.programs.find((p) => p.programSlug === 'it-support-professional-certificate-ibm');

      expect(dlProgram).toBeDefined();
      expect(dlProgram!.enrolled).toBe(3);
      expect(dlProgram!.completed).toBe(2);

      expect(itProgram).toBeDefined();
      expect(itProgram!.enrolled).toBe(1);
      expect(itProgram!.completed).toBe(1);
    });

    it('does not publish a stale 100 percent rollup as program completion', async () => {
      const enrolled = [
        makeEnrolledUser({
          id: 'u-stale',
          programSlug: 'it-support-professional-certificate-ibm',
          avgPercent: 100,
          coursesCompleted: 1,
          hasPlacement: false,
        }),
      ];

      mockImpactQueries({ membersServed: 1, enrolledUsers: enrolled });

      const stats = await getPublicImpactStats(ORG_ID);
      expect(stats.completionRatePct).toBe(0);
      expect(stats.programs[0]?.completed).toBe(0);
    });

    it('completion rate is 0 when no enrolled members', async () => {
      mockImpactQueries();

      const stats = await getPublicImpactStats(ORG_ID);
      expect(stats.completionRatePct).toBe(0);
      expect(stats.placementRatePct).toBe(0);
    });
  });

  describe('cache behavior', () => {
    // The Next.js app/impact/page.tsx was deleted in the Astro marketing
    // migration — /impact is now the static marketing/src/pages/impact.astro,
    // so the old source-reading ISR/copy assertions no longer apply.
    it('impact page is served by the static marketing site', () => {
      const astroPath = path.resolve(__dirname, '../../marketing/src/pages/impact.astro');
      expect(readFileSync(astroPath, 'utf-8').length).toBeGreaterThan(0);
    });
  });

  describe('edge cases', () => {
    it('returns empty stats in build mode', async () => {
      (shouldSkipOptionalDbQueriesAtBuild as any).mockReturnValue(true);

      const stats = await getPublicImpactStats(ORG_ID);
      expect(stats).toEqual({
        ...EMPTY_PUBLIC_IMPACT_STATS,
        asOfLabel: 'Build mode',
      });

      // Prisma should not be called in build mode
      expect(prisma.user.count).not.toHaveBeenCalled();
    });

    it('returns empty stats when prisma throws', async () => {
      (prisma.user.count as any).mockRejectedValue(new Error('DB down'));

      const stats = await getPublicImpactStats(ORG_ID);
      expect(stats).toEqual(EMPTY_PUBLIC_IMPACT_STATS);
    });

    it('handles members with no enrolled program', async () => {
      // user.count returns all active members; findMany filters to enrolled only
      mockImpactQueries({ membersServed: 1 });

      const stats = await getPublicImpactStats(ORG_ID);
      expect(stats.membersServed).toBe(1);
      expect(stats.completionRatePct).toBe(0);
      expect(stats.placementRatePct).toBe(0);
      expect(stats.programs).toHaveLength(0);
    });

    it('avgSalaryIncreaseDollars is null when no paired salary data', async () => {
      const enrolled = [
        makeEnrolledUser({ id: 'u1', programSlug: 'digital-literacy-empowerment-class', avgPercent: 100, coursesCompleted: 10, hasPlacement: true }),
      ];

      mockImpactQueries({ membersServed: 1, enrolledUsers: enrolled, hiresMade: 1 });

      const stats = await getPublicImpactStats(ORG_ID);
      expect(stats.avgSalaryIncreaseDollars).toBeNull();
      expect(stats.salaryIncreaseSampleSize).toBe(0);
    });

    it('computes avgDaysToComplete when course progress timestamps exist', async () => {
      const enrolledAt = new Date('2024-01-01');
      const completedAt = new Date('2024-01-31');

      const enrolled = [
        makeEnrolledUser({
          id: 'u1',
          programSlug: 'digital-literacy-empowerment-class',
          avgPercent: 100,
          coursesCompleted: 10,
          hasPlacement: false,
          enrolledAt,
          lastUpdatedAt: completedAt,
        }),
      ];

      mockImpactQueries({
        membersServed: 1,
        enrolledUsers: enrolled,
        courseProgress: [
          { userId: 'u1', programSlug: 'digital-literacy-empowerment-class', completedAt },
        ],
      });

      const stats = await getPublicImpactStats(ORG_ID);
      const program = stats.programs.find((p) => p.programSlug === 'digital-literacy-empowerment-class');
      expect(program).toBeDefined();
      expect(program!.avgDaysToComplete).toBeCloseTo(30, 0);
    });
  });
});
