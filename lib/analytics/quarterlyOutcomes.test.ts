import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ───
vi.mock('@/lib/db/prisma', () => {
  const courseProgress = {
    findMany: vi.fn(),
  };
  const userCertification = {
    findMany: vi.fn(),
  };
  const user = {
    findMany: vi.fn(),
    count: vi.fn(async () => {
      const rows = await user.findMany();
      return Array.isArray(rows) ? rows.length : 0;
    }),
  };
  const placementRecord = {
    findMany: vi.fn(),
    count: vi.fn(async () => {
      const rows = await placementRecord.findMany();
      return Array.isArray(rows) ? rows.length : 0;
    }),
    groupBy: vi.fn().mockResolvedValue([]),
  };
  const aIToolResult = {
    findMany: vi.fn(),
    groupBy: vi.fn(async () => {
      const rows = await aIToolResult.findMany();
      if (!Array.isArray(rows)) return [];
      const ids = [...new Set(rows.map((r: { userId: string }) => r.userId))];
      return ids.map((userId) => ({ userId, _count: { _all: 1 } }));
    }),
  };
  return { prisma: { courseProgress, userCertification, user, placementRecord, aIToolResult } };
});

import { prisma } from '@/lib/db/prisma';
import { LEGACY_CURRICULUM_VERSION } from '@/lib/content/programCurriculumManifest';
import {
  DIGITAL_LITERACY_PROGRAM_SLUG,
  digitalLiteracyCatalogCourses,
} from '@/shared/digitalLiteracyPathway';
import {
  generateQuarterlyOutcomes,
  getDefaultQuarter,
  formatQuarterlyReportMarkdown,
  quarterlyOutcomesToCsvSummary,
  quarterlyOutcomesToCsvPrograms,
  quarterlyOutcomesToCsvPlacements,
  rowsToCsv,
} from './quarterlyOutcomes';

const ORG_ID = 'org-1';

function makeSpec(q: string, year: number) {
  return { quarter: q as 'Q1' | 'Q2' | 'Q3' | 'Q4', year };
}

function completedProgramCourses() {
  return digitalLiteracyCatalogCourses(DIGITAL_LITERACY_PROGRAM_SLUG).map((course) => ({
    programSlug: DIGITAL_LITERACY_PROGRAM_SLUG,
    courseSlug: course.slug,
    percentComplete: 100,
    completedAt: new Date('2026-02-15'),
  }));
}

function mockMember(opts: {
  id: string;
  enrolledAt?: Date;
  enrolledProgram?: string;
  deletedAt?: Date | null;
  courseProgress?: { percentComplete: number; completedAt?: Date | null; programSlug?: string; courseSlug?: string }[];
  courseEnrollments?: { programSlug: string; enrolledAt: Date }[];
}): any {
  return {
    id: opts.id,
    enrolledAt: opts.enrolledAt ?? new Date('2026-02-01'),
    enrolledProgram: opts.enrolledProgram ?? 'cna',
    deletedAt: opts.deletedAt ?? null,
    courseProgress: (opts.courseProgress ?? []).map((progress) => ({
      programSlug: opts.enrolledProgram ?? 'cna',
      courseSlug: 'course-1',
      completedAt: null,
      ...progress,
    })),
    courseEnrollments: (opts.courseEnrollments ?? [{ programSlug: opts.enrolledProgram ?? 'cna', enrolledAt: opts.enrolledAt ?? new Date('2026-02-01') }]).map((enrollment) => ({
      curriculumVersion: LEGACY_CURRICULUM_VERSION,
      isPrimary: true,
      ...enrollment,
    })),
  };
}

function mockPlacement(opts: {
  userId: string;
  jobTitle?: string;
  employerName?: string;
  salaryOffered?: number | null;
  placedAt?: Date;
  enrolledAt?: Date | null;
  enrolledProgram?: string | null;
  courseEnrollments?: { programSlug: string; enrolledAt: Date }[];
}): any {
  return {
    id: `placement-${opts.userId}`,
    userId: opts.userId,
    jobTitle: opts.jobTitle ?? 'Nurse Assistant',
    employerName: opts.employerName ?? 'Hospital',
    salaryOffered: opts.salaryOffered !== undefined ? opts.salaryOffered : 42000,
    placedAt: opts.placedAt ?? new Date('2026-02-28'),
    user: {
      enrolledAt: opts.enrolledAt ?? new Date('2026-02-01'),
      enrolledProgram: opts.enrolledProgram ?? 'cna',
      courseEnrollments: opts.courseEnrollments ?? [{ programSlug: opts.enrolledProgram ?? 'cna', enrolledAt: opts.enrolledAt ?? new Date('2026-02-01') }],
    },
  };
}

// ─────────────────────────────────────────────
// getDefaultQuarter
// ─────────────────────────────────────────────
describe('getDefaultQuarter', () => {
  it('defaults to Q4 previous year in January', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-15'));
    expect(getDefaultQuarter()).toEqual({ quarter: 'Q4', year: 2025 });
    vi.useRealTimers();
  });

  it('defaults to Q1 current year in April', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-15'));
    expect(getDefaultQuarter()).toEqual({ quarter: 'Q1', year: 2026 });
    vi.useRealTimers();
  });

  it('defaults to Q2 current year in July', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-15'));
    expect(getDefaultQuarter()).toEqual({ quarter: 'Q2', year: 2026 });
    vi.useRealTimers();
  });

  it('defaults to Q3 current year in October', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-15'));
    expect(getDefaultQuarter()).toEqual({ quarter: 'Q3', year: 2026 });
    vi.useRealTimers();
  });
});

// ─────────────────────────────────────────────
// generateQuarterlyOutcomes
// ─────────────────────────────────────────────
describe('generateQuarterlyOutcomes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns zeroed report when no enrolled members', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([]);
    vi.mocked(prisma.courseProgress.findMany).mockResolvedValue([]);
    vi.mocked(prisma.userCertification.findMany).mockResolvedValue([]);
    vi.mocked(prisma.placementRecord.findMany).mockResolvedValue([]);
    vi.mocked(prisma.aIToolResult.findMany).mockResolvedValue([]);

    const report = await generateQuarterlyOutcomes(ORG_ID, makeSpec('Q1', 2026));

    expect(report.metrics.totalEnrolled).toBe(0);
    expect(report.metrics.completions).toBe(0);
    expect(report.metrics.placements).toBe(0);
    expect(report.metrics.activeMembers).toBe(0);
    expect(report.metrics.dropOffs).toBe(0);
    expect(report.metrics.dropOffRate).toBe(0);
    expect(report.metrics.avgDaysToPlacement).toBeNull();
    expect(report.metrics.aiToolUsageRate).toBeNull();
    expect(report.metrics.salaryAvg).toBeNull();
    expect(report.programBreakdown).toHaveLength(0);
    expect(report.placementsList).toHaveLength(0);
    expect(report.quarter).toBe('Q1');
    expect(report.year).toBe(2026);
    expect(report.periodStart).toBe('2026-01-01');
    expect(report.periodEnd).toBe('2026-03-31');
  });

  it('computes basic metrics correctly', async () => {
    // 4 enrolled:
    // - u1: enrolled, started training, placed
    // - u2: enrolled, started training, completed
    // - u3: enrolled, started training, still active
    // - u4: enrolled, never started → drop-off
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      mockMember({ id: 'u1', courseProgress: [{ percentComplete: 50 }] }),
      mockMember({
        id: 'u2',
        enrolledProgram: DIGITAL_LITERACY_PROGRAM_SLUG,
        courseProgress: completedProgramCourses(),
      }),
      mockMember({ id: 'u3', courseProgress: [{ percentComplete: 30 }] }),
      mockMember({ id: 'u4', courseProgress: [] }),
    ]);

    vi.mocked(prisma.courseProgress.findMany).mockResolvedValue([
      { userId: 'u2' },
    ] as any);
    vi.mocked(prisma.userCertification.findMany).mockResolvedValue([]);

    vi.mocked(prisma.placementRecord.findMany).mockResolvedValue([
      mockPlacement({ userId: 'u1', placedAt: new Date('2026-02-28'), enrolledAt: new Date('2026-02-01'), salaryOffered: 45000 }),
    ]);

    vi.mocked(prisma.aIToolResult.findMany).mockResolvedValue([
      { userId: 'u1' },
    ] as any);

    const report = await generateQuarterlyOutcomes(ORG_ID, makeSpec('Q1', 2026));

    expect(report.metrics.totalEnrolled).toBe(4);
    // Official totals are SQL counts, not a length of hydrated rows.
    expect(prisma.user.count).toHaveBeenCalledTimes(1);
    expect(prisma.placementRecord.count).toHaveBeenCalledTimes(1);
    expect(report.metrics.completions).toBe(1);
    expect(report.programBreakdown.find((program) => program.programSlug === DIGITAL_LITERACY_PROGRAM_SLUG)?.completions).toBe(1);
    expect(report.metrics.placements).toBe(1);
    expect(report.metrics.activeMembers).toBe(1); // u3
    expect(report.metrics.dropOffs).toBe(1); // u4
    expect(report.metrics.dropOffRate).toBe(25);
    expect(report.metrics.avgDaysToPlacement).toBe(27); // Feb 1 -> Feb 28 = 27 days
    expect(report.metrics.aiToolUsageRate).toBe(100);
    expect(report.metrics.salaryAvg).toBe(45000);
    expect(report.metrics.salaryMin).toBe(45000);
    expect(report.metrics.salaryMax).toBe(45000);
    expect(report.metrics.salaryMedian).toBe(45000);
  });

  it('does not count certifications or a partial curriculum as program completion', async () => {
    const completedCourses = completedProgramCourses();
    expect(completedCourses.length).toBeGreaterThan(1);
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      mockMember({
        id: 'u1',
        enrolledProgram: DIGITAL_LITERACY_PROGRAM_SLUG,
        courseProgress: completedCourses.slice(0, 1),
      }),
    ]);
    vi.mocked(prisma.courseProgress.findMany).mockResolvedValue([]);
    vi.mocked(prisma.userCertification.findMany).mockResolvedValue([
      { userId: 'u1', user: { enrolledProgram: DIGITAL_LITERACY_PROGRAM_SLUG } },
    ] as any);
    vi.mocked(prisma.placementRecord.findMany).mockResolvedValue([]);
    vi.mocked(prisma.aIToolResult.findMany).mockResolvedValue([]);

    const report = await generateQuarterlyOutcomes(ORG_ID, makeSpec('Q1', 2026));
    expect(report.metrics.completions).toBe(0);
    expect(report.programBreakdown[0].completions).toBe(0);
    expect(report.metrics.activeMembers).toBe(1);
    expect(report.metrics.dropOffs).toBe(0);
    expect(prisma.userCertification.findMany).not.toHaveBeenCalled();
  });

  it('handles multiple programs via courseEnrollments', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      mockMember({
        id: 'u1',
        enrolledProgram: 'it-support',
        courseEnrollments: [
          { programSlug: 'it-support', enrolledAt: new Date('2026-02-01') },
          { programSlug: 'ai-practitioner', enrolledAt: new Date('2026-02-15') },
        ],
        courseProgress: [{ percentComplete: 50 }],
      }),
    ]);
    vi.mocked(prisma.courseProgress.findMany).mockResolvedValue([]);
    vi.mocked(prisma.userCertification.findMany).mockResolvedValue([]);
    vi.mocked(prisma.placementRecord.findMany).mockResolvedValue([
      mockPlacement({
        userId: 'u1',
        enrolledAt: new Date('2026-02-01'),
        enrolledProgram: 'it-support',
        courseEnrollments: [
          { programSlug: 'it-support', enrolledAt: new Date('2026-02-01') },
          { programSlug: 'ai-practitioner', enrolledAt: new Date('2026-02-15') },
        ],
        placedAt: new Date('2026-03-01'),
      }),
    ]);
    vi.mocked(prisma.aIToolResult.findMany).mockResolvedValue([]);

    const report = await generateQuarterlyOutcomes(ORG_ID, makeSpec('Q1', 2026));

    expect(report.programBreakdown).toHaveLength(2);
    const itSupport = report.programBreakdown.find((p) => p.programSlug === 'it-support');
    const aiPractitioner = report.programBreakdown.find((p) => p.programSlug === 'ai-practitioner');
    expect(itSupport?.enrolled).toBe(1);
    expect(aiPractitioner?.enrolled).toBe(1);
    // Placement credited to most recent enrollment before placement (ai-practitioner at 2026-02-15)
    expect(itSupport?.placements).toBe(0);
    expect(aiPractitioner?.placements).toBe(1);
  });

  it('computes salary stats across multiple placements', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      mockMember({ id: 'u1', courseProgress: [{ percentComplete: 50 }] }),
      mockMember({ id: 'u2', courseProgress: [{ percentComplete: 60 }] }),
    ]);
    vi.mocked(prisma.courseProgress.findMany).mockResolvedValue([]);
    vi.mocked(prisma.userCertification.findMany).mockResolvedValue([]);
    vi.mocked(prisma.placementRecord.findMany).mockResolvedValue([
      mockPlacement({ userId: 'u1', salaryOffered: 40000, placedAt: new Date('2026-02-15'), enrolledAt: new Date('2026-02-01') }),
      mockPlacement({ userId: 'u2', salaryOffered: 60000, placedAt: new Date('2026-02-20'), enrolledAt: new Date('2026-02-01') }),
    ]);
    vi.mocked(prisma.aIToolResult.findMany).mockResolvedValue([]);

    const report = await generateQuarterlyOutcomes(ORG_ID, makeSpec('Q1', 2026));

    expect(report.metrics.salaryAvg).toBe(50000);
    expect(report.metrics.salaryMedian).toBe(50000);
    expect(report.metrics.salaryMin).toBe(40000);
    expect(report.metrics.salaryMax).toBe(60000);
  });

  it('returns null salary stats when no salaries', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      mockMember({ id: 'u1', courseProgress: [{ percentComplete: 50 }] }),
    ]);
    vi.mocked(prisma.courseProgress.findMany).mockResolvedValue([]);
    vi.mocked(prisma.userCertification.findMany).mockResolvedValue([]);
    vi.mocked(prisma.placementRecord.findMany).mockResolvedValue([
      mockPlacement({ userId: 'u1', salaryOffered: null, placedAt: new Date('2026-02-15'), enrolledAt: new Date('2026-02-01') }),
    ] as any);
    vi.mocked(prisma.aIToolResult.findMany).mockResolvedValue([]);

    const report = await generateQuarterlyOutcomes(ORG_ID, makeSpec('Q1', 2026));

    expect(report.metrics.salaryAvg).toBeNull();
    expect(report.metrics.salaryMedian).toBeNull();
    expect(report.metrics.salaryMin).toBeNull();
    expect(report.metrics.salaryMax).toBeNull();
  });

  it('excludes deleted members in both the cohort query and enrolled count', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([]);
    vi.mocked(prisma.courseProgress.findMany).mockResolvedValue([]);
    vi.mocked(prisma.userCertification.findMany).mockResolvedValue([]);
    vi.mocked(prisma.placementRecord.findMany).mockResolvedValue([]);
    vi.mocked(prisma.aIToolResult.findMany).mockResolvedValue([]);

    const report = await generateQuarterlyOutcomes(ORG_ID, makeSpec('Q1', 2026));

    expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ organizationId: ORG_ID, deletedAt: null }),
    }));
    expect(prisma.user.count).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ organizationId: ORG_ID, deletedAt: null }),
    }));
    expect(report.metrics.totalEnrolled).toBe(0);
    expect(report.metrics.dropOffs).toBe(0);
    expect(report.metrics.activeMembers).toBe(0);
  });

  it('only counts staff-verified placements toward funder-reported totals', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      mockMember({ id: 'u1', courseProgress: [{ percentComplete: 50 }] }),
    ]);
    vi.mocked(prisma.courseProgress.findMany).mockResolvedValue([]);
    vi.mocked(prisma.userCertification.findMany).mockResolvedValue([]);
    vi.mocked(prisma.placementRecord.findMany).mockResolvedValue([]);
    vi.mocked(prisma.aIToolResult.findMany).mockResolvedValue([]);

    await generateQuarterlyOutcomes(ORG_ID, makeSpec('Q1', 2026));

    // fetchPlacements still hydrates a capped list; retention is groupBy.
    // Employer-side "hired" auto-creates unverified records, so both paths
    // must keep startDateVerified: true for funder-facing totals.
    const placementsCallArgs = vi.mocked(prisma.placementRecord.findMany).mock.calls[0][0];
    expect(placementsCallArgs?.where).toMatchObject({ startDateVerified: true });

    const retentionCallArgs = vi.mocked(prisma.placementRecord.groupBy).mock.calls[0][0];
    expect(retentionCallArgs?.where).toMatchObject({ startDateVerified: true });
  });

  it('computes a 90-day and 180-day retention block from retentionStatus/retentionDecision, keeping pending visible', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([]);
    vi.mocked(prisma.courseProgress.findMany).mockResolvedValue([]);
    vi.mocked(prisma.userCertification.findMany).mockResolvedValue([]);
    vi.mocked(prisma.aIToolResult.findMany).mockResolvedValue([]);

    vi.mocked(prisma.placementRecord.findMany).mockResolvedValueOnce([]);
    vi.mocked(prisma.placementRecord.groupBy)
      .mockResolvedValueOnce([
        { retentionStatus: 'retained_90d', retentionDecision: null, _count: { _all: 1 } },
        { retentionStatus: 'separated', retentionDecision: null, _count: { _all: 1 } },
        { retentionStatus: null, retentionDecision: null, _count: { _all: 1 } },
      ] as any)
      .mockResolvedValueOnce([
        { retentionStatus: null, retentionDecision: 'retained', _count: { _all: 1 } },
        { retentionStatus: 'retained_90d', retentionDecision: null, _count: { _all: 2 } },
        { retentionStatus: 'retained_180d', retentionDecision: null, _count: { _all: 1 } },
        { retentionStatus: 'retained_90d', retentionDecision: 'not_retained', _count: { _all: 1 } },
      ] as any);

    const report = await generateQuarterlyOutcomes(ORG_ID, makeSpec('Q1', 2026));

    expect(report.retention.ninetyDay).toEqual({
      retained: 1,
      notRetainedOrSeparated: 1,
      pendingDecision: 1,
      total: 3,
    });
    expect(report.retention.hundredEightyDay).toEqual({
      retained: 1,
      notRetainedOrSeparated: 1,
      pendingDecision: 3,
      total: 5,
    });
  });
});

// ─────────────────────────────────────────────
// formatQuarterlyReportMarkdown
// ─────────────────────────────────────────────
describe('formatQuarterlyReportMarkdown', () => {
  it('renders a complete markdown report', () => {
    const report = {
      quarter: 'Q1',
      year: 2026,
      periodStart: '2026-01-01',
      periodEnd: '2026-03-31',
      generatedAt: '2026-04-01T00:00:00.000Z',
      metrics: {
        totalEnrolled: 10,
        completions: 5,
        placements: 3,
        activeMembers: 1,
        dropOffs: 1,
        dropOffRate: 10,
        avgDaysToPlacement: 30,
        aiToolUsageRate: 67,
        salaryAvg: 52000,
        salaryMedian: 51000,
        salaryMin: 45000,
        salaryMax: 60000,
      },
      retention: {
        ninetyDay: { retained: 4, notRetainedOrSeparated: 1, pendingDecision: 2, total: 7 },
        hundredEightyDay: { retained: 2, notRetainedOrSeparated: 0, pendingDecision: 1, total: 3 },
      },
      programBreakdown: [
        { programSlug: 'cna', enrolled: 6, completions: 3, placements: 2 },
        { programSlug: 'it-support', enrolled: 4, completions: 2, placements: 1 },
      ],
      placementsList: [
        {
          jobTitle: 'Nurse Assistant',
          employerName: 'Hospital',
          salaryOffered: 50000,
          placedAt: '2026-02-15T00:00:00.000Z',
          daysToPlacement: 20,
          usedAiTools: true,
        },
      ],
    };

    const md = formatQuarterlyReportMarkdown(report as any);

    expect(md).toContain('# WorkforceAP Quarterly Outcomes Report');
    expect(md).toContain('Q1 2026');
    expect(md).toContain('2026-01-01');
    expect(md).toContain('cna');
    expect(md).toContain('Nurse Assistant');
    expect(md).toContain('$50,000');
    expect(md).toContain('Yes');
    expect(md).toContain('## Retention (as of end of quarter)');
    expect(md).toContain('| 90-day | 4 | 1 | 2 | 7 |');
    expect(md).toContain('| 180-day | 2 | 0 | 1 | 3 |');
  });
});

// ─────────────────────────────────────────────
// CSV helpers
// ─────────────────────────────────────────────
describe('CSV helpers', () => {
  it('rowsToCsv escapes commas and quotes', () => {
    const csv = rowsToCsv([
      { name: 'John, Jr.', note: 'He said "hi"' },
    ]);
    expect(csv).toContain('"John, Jr."');
    expect(csv).toContain('"He said ""hi"""');
  });

  it('quarterlyOutcomesToCsvSummary returns single row', () => {
    const report = {
      quarter: 'Q1',
      year: 2026,
      periodStart: '2026-01-01',
      periodEnd: '2026-03-31',
      metrics: {
        totalEnrolled: 10,
        completions: 5,
        placements: 3,
        activeMembers: 1,
        dropOffs: 1,
        dropOffRate: 10,
        avgDaysToPlacement: 30,
        aiToolUsageRate: 67,
        salaryAvg: 52000,
        salaryMedian: 51000,
        salaryMin: 45000,
        salaryMax: 60000,
      },
      retention: {
        ninetyDay: { retained: 2, notRetainedOrSeparated: 1, pendingDecision: 0, total: 3 },
        hundredEightyDay: { retained: 1, notRetainedOrSeparated: 0, pendingDecision: 1, total: 2 },
      },
      programBreakdown: [],
      placementsList: [],
    };

    const rows = quarterlyOutcomesToCsvSummary(report as any);
    expect(rows).toHaveLength(1);
    expect(rows[0].quarter).toBe('Q1 2026');
    expect(rows[0].total_enrolled).toBe(10);
    expect(rows[0].drop_off_rate).toBe('10%');
    expect(rows[0].retention_90d_retained).toBe(2);
    expect(rows[0].retention_90d_not_retained_or_separated).toBe(1);
    expect(rows[0].retention_90d_pending_decision).toBe(0);
    expect(rows[0].retention_180d_retained).toBe(1);
  });

  it('quarterlyOutcomesToCsvPrograms returns program rows', () => {
    const rows = quarterlyOutcomesToCsvPrograms({
      programBreakdown: [
        { programSlug: 'cna', enrolled: 5, completions: 3, placements: 2 },
      ],
    } as any);
    expect(rows).toHaveLength(1);
    expect(rows[0].program_slug).toBe('cna');
  });

  it('quarterlyOutcomesToCsvPlacements returns placement rows', () => {
    const rows = quarterlyOutcomesToCsvPlacements({
      placementsList: [
        {
          jobTitle: 'Dev',
          employerName: 'Tech Co',
          salaryOffered: 70000,
          placedAt: '2026-02-15T00:00:00.000Z',
          daysToPlacement: 14,
          usedAiTools: true,
        },
      ],
    } as any);
    expect(rows).toHaveLength(1);
    expect(rows[0].job_title).toBe('Dev');
    expect(rows[0].used_ai_tools).toBe('Yes');
  });
});
