import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CourseProgressStatus } from '@prisma/client';

const mocks = vi.hoisted(() => ({
  rawFindMany: vi.fn(),
  rawFindFirst: vi.fn(),
  badgeFindFirst: vi.fn(),
  canonicalFindMany: vi.fn(),
  userFindMany: vi.fn(),
  userFindFirst: vi.fn(),
  executeRaw: vi.fn(),
  queryRaw: vi.fn(),
  transaction: vi.fn(),
  loadMappings: vi.fn(),
  upsertMerged: vi.fn(),
  refreshRollup: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db/prisma', () => {
  const db = {
    courseraCourseProgress: {
      findMany: mocks.rawFindMany,
      findFirst: mocks.rawFindFirst,
    },
    courseraBadgeProgress: {
      findFirst: mocks.badgeFindFirst,
    },
    courseProgress: {
      findMany: mocks.canonicalFindMany,
      upsert: vi.fn(),
    },
    user: {
      findMany: mocks.userFindMany,
      findFirst: mocks.userFindFirst,
    },
    $executeRaw: mocks.executeRaw,
    $queryRaw: mocks.queryRaw,
    $transaction: mocks.transaction,
  };
  return { prisma: db };
});
vi.mock('@/lib/coursera/canonicalMapping', () => ({
  loadCanonicalMappingsForCourseraIds: mocks.loadMappings,
}));
vi.mock('@/lib/coursera/upsertMergedCourseProgress', () => ({
  upsertMergedCourseProgress: mocks.upsertMerged,
}));
vi.mock('@/lib/member/courseProgress', () => ({
  refreshMemberProgramProgressRollup: mocks.refreshRollup,
}));

import {
  backfillUserIdForCourseraEmail,
  promoteCsvProgressToCanonical,
} from '@/lib/coursera/csvImport.server';

describe('promoteCsvProgressToCanonical', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rawFindMany
      .mockReset()
      .mockResolvedValueOnce([
        {
          id: 'raw-1',
          userId: 'user-1',
          courseraCourseId: 'coursera-course-1',
          overallProgress: 24,
          isCompleted: false,
          enrollmentTime: new Date('2026-08-01T00:00:00.000Z'),
          classStartTime: null,
          lastActivityTime: new Date('2026-08-22T00:00:00.000Z'),
          completionTime: null,
          courseGrade: null,
        },
      ])
      .mockResolvedValueOnce([]);
    mocks.loadMappings.mockResolvedValue({
      byCourseraCourseId: new Map([
        [
          'coursera-course-1',
          {
            programSlug: 'comptia-a-plus',
            courseSlug: 'hardware-fundamentals',
          },
        ],
      ]),
      byCourseraCourseSlug: new Map(),
    });
    mocks.userFindMany.mockResolvedValue([{ id: 'user-1' }]);
    mocks.userFindFirst.mockResolvedValue({ id: 'user-1' });
    mocks.rawFindFirst.mockResolvedValue(null);
    mocks.badgeFindFirst.mockResolvedValue(null);
    mocks.executeRaw.mockResolvedValue(0);
    mocks.queryRaw.mockReset();
    mocks.transaction.mockImplementation(async (callback) => {
      const { prisma } = await import('@/lib/db/prisma');
      return callback(prisma as never);
    });
    mocks.canonicalFindMany.mockResolvedValue([
      {
        userId: 'user-1',
        programSlug: 'comptia-a-professional-certificate',
        courseSlug: 'hardware-fundamentals',
        status: CourseProgressStatus.COMPLETED,
        percentComplete: 100,
        lastActivityAt: new Date('2026-08-21T00:00:00.000Z'),
      },
    ]);
    mocks.upsertMerged.mockResolvedValue({ newlyCompleted: false });
    mocks.refreshRollup.mockResolvedValue(undefined);
  });

  it('scopes the mapped email, uses the merge helper, and preserves COMPLETED', async () => {
    const result = await promoteCsvProgressToCanonical({
      organizationId: 'org-1',
      userId: 'user-1',
      courseraEmail: ' Learner@Example.com ',
    });

    expect(mocks.rawFindMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org-1',
          userId: 'user-1',
          externalEmail: { equals: 'learner@example.com', mode: 'insensitive' },
        }),
      }),
    );
    expect(mocks.upsertMerged).toHaveBeenCalledTimes(1);
    expect(mocks.upsertMerged).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId: 'user-1',
        programSlug: 'comptia-a-professional-certificate',
        courseSlug: 'hardware-fundamentals',
        merged: expect.objectContaining({
          status: CourseProgressStatus.COMPLETED,
          percentComplete: 100,
        }),
      }),
    );
    expect(mocks.refreshRollup).toHaveBeenCalledWith(
      'user-1',
      'comptia-a-professional-certificate',
    );
    expect(result).toEqual({
      upserted: 1,
      unmapped: 0,
      learningPaths: 0,
      rollupsRefreshed: 1,
      errors: 0,
    });
  });

  it('leaves a raw row linked to a foreign organization untouched', async () => {
    mocks.userFindMany.mockResolvedValue([]);

    const result = await promoteCsvProgressToCanonical({
      organizationId: 'org-1',
      userId: 'user-1',
    });

    expect(mocks.rawFindMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: 'org-1' }),
      }),
    );
    expect(mocks.userFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: ['user-1'] },
          organizationId: 'org-1',
        }),
      }),
    );
    expect(mocks.upsertMerged).not.toHaveBeenCalled();
    expect(mocks.refreshRollup).not.toHaveBeenCalled();
    expect(result).toMatchObject({ upserted: 0, errors: 1 });
  });

  it('adopts NULL-org raw rows only for the reviewed organization and user', async () => {
    mocks.rawFindMany.mockReset().mockResolvedValue([]);
    mocks.queryRaw
      .mockResolvedValueOnce([{ id: 'user-1' }]) // active target, FOR SHARE
      .mockResolvedValueOnce([]); // no foreign raw ownership
    // Two advisory locks (reviewed identity + attachment) then the two updates.
    mocks.executeRaw
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1);

    const result = await backfillUserIdForCourseraEmail(
      ' Learner@Example.com ',
      'user-1',
      'org-1',
    );

    expect(result.courseRowsUpdated).toBe(2);
    expect(result.badgeRowsUpdated).toBe(1);
    expect(result.promotion).toEqual({
      upserted: 0,
      unmapped: 0,
      learningPaths: 0,
      rollupsRefreshed: 0,
      errors: 0,
    });
    expect(mocks.queryRaw).toHaveBeenCalledTimes(2);
    const lockCalls = mocks.executeRaw.mock.calls.filter(([statement]) =>
      (statement as { sql?: string }).sql?.includes('pg_advisory_xact_lock'),
    );
    expect(lockCalls).toHaveLength(2);
    for (const lockCall of lockCalls) {
      const lock = lockCall[0] as { sql: string; values: unknown[] };
      expect(lock.values).toContain('coursera:raw-email:learner@example.com');
    }
    const targetUserQuery = mocks.queryRaw.mock.calls[0]?.[0] as {
      sql: string;
      values: unknown[];
    };
    expect(targetUserQuery.sql).toContain('FOR SHARE');
    expect(targetUserQuery.values).toEqual(
      expect.arrayContaining(['user-1', 'org-1']),
    );
    const conflictQuery = mocks.queryRaw.mock.calls[1]?.[0] as {
      sql: string;
      values: unknown[];
    };
    expect(conflictQuery.sql).toContain('FROM coursera_course_progress');
    expect(conflictQuery.sql).toContain('UNION ALL');
    expect(conflictQuery.sql).toContain('FROM coursera_badge_progress');
    expect(conflictQuery.values).toEqual(
      expect.arrayContaining(['learner@example.com', 'user-1', 'org-1']),
    );
    expect(mocks.rawFindMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org-1',
          userId: 'user-1',
          externalEmail: { equals: 'learner@example.com', mode: 'insensitive' },
        }),
      }),
    );
    const writes = mocks.executeRaw.mock.calls.filter(
      ([statement]) => !(statement as { sql?: string }).sql?.includes('pg_advisory_xact_lock'),
    );
    expect(writes).toHaveLength(2);
    for (const [statement] of writes) {
      const sql = (statement as { sql: string }).sql;
      const values = (statement as { values: unknown[] }).values;
      expect(sql).toContain('organization_id IS NULL OR organization_id =');
      expect(sql).toContain('user_id IS NULL OR user_id =');
      expect(values).toContain('org-1');
    }
  });

  it('rejects reviewed attachment when the email has raw progress owned elsewhere', async () => {
    mocks.rawFindMany.mockReset().mockResolvedValue([]);
    mocks.queryRaw
      .mockResolvedValueOnce([{ id: 'user-1' }])
      .mockResolvedValueOnce([{ source: 'course' }]);

    await expect(
      backfillUserIdForCourseraEmail('learner@example.com', 'user-1', 'org-1'),
    ).rejects.toThrow('different user or organization');
    expect(mocks.queryRaw).toHaveBeenCalledTimes(2);
    expect(
      mocks.executeRaw.mock.calls.filter(
        ([statement]) => !(statement as { sql?: string }).sql?.includes('pg_advisory_xact_lock'),
      ),
    ).toHaveLength(0);
    expect(mocks.rawFindMany).not.toHaveBeenCalled();
  });

  it('rejects a map target outside the reviewed organization before any raw write', async () => {
    mocks.queryRaw.mockResolvedValueOnce([]);

    await expect(
      backfillUserIdForCourseraEmail('learner@example.com', 'foreign-user', 'org-1'),
    ).rejects.toThrow('active member of the expected organization');
    // Only the target-user lookup reads; the advisory locks are writes now.
    expect(mocks.queryRaw).toHaveBeenCalledTimes(1);
    expect(
      mocks.executeRaw.mock.calls.filter(
        ([statement]) => !(statement as { sql?: string }).sql?.includes('pg_advisory_xact_lock'),
      ),
    ).toHaveLength(0);
    expect(mocks.rawFindMany).not.toHaveBeenCalled();
  });
});
