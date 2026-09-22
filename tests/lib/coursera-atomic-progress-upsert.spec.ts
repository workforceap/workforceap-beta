import { CourseProgressStatus } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Review 2026-09-22 item 4: a completed row written here (B4B cron, per-user
// sync, CSV promotion, xAPI detail) creates a pending certificate. Mocked so
// the ladder tests stay database-free; the calls are asserted below.
const certificateMocks = vi.hoisted(() => ({ ensurePending: vi.fn(async () => null) }));
vi.mock('@/lib/certifications/pendingFromCompletion', () => ({
  ensurePendingCertificationForCompletionSafely: certificateMocks.ensurePending,
}));

import { upsertMergedCourseProgress } from '@/lib/coursera/upsertMergedCourseProgress';

beforeEach(() => {
  certificateMocks.ensurePending.mockClear();
});

describe('upsertMergedCourseProgress atomic merge ladder', () => {
  it('keeps COMPLETED at the database conflict point during concurrent stale writes', async () => {
    const statements: Array<{ sql: string; values: unknown[] }> = [];
    const db = {
      $executeRaw: vi.fn(async (statement: { sql: string; values: unknown[] }) => {
        statements.push(statement);
        return 1;
      }),
      $queryRaw: vi.fn(async (statement: { sql: string; values: unknown[] }) => {
        statements.push(statement);
        if (statement.sql.includes('SELECT status')) return [];
        const incomingCompleted = statement.values.includes(CourseProgressStatus.COMPLETED);
        return [{
          status: CourseProgressStatus.COMPLETED,
          inserted: incomingCompleted,
        }];
      }),
    };

    const results = await Promise.all([
      upsertMergedCourseProgress(db as never, {
        userId: 'user-1',
        programSlug: 'program-one',
        courseSlug: 'course-one',
        courseId: 'provider-course-1',
        merged: {
          status: CourseProgressStatus.COMPLETED,
          percentComplete: 100,
          lastActivityAt: new Date('2026-08-29T12:00:00.000Z'),
        },
        existing: null,
        completedAt: new Date('2026-08-29T12:00:00.000Z'),
        scoreScaled: 0.9,
        scoreRaw: 90,
        statementCountIncrement: 1,
      }),
      upsertMergedCourseProgress(db as never, {
        userId: 'user-1',
        programSlug: 'program-one',
        courseSlug: 'course-one',
        courseId: 'provider-course-1',
        merged: {
          status: CourseProgressStatus.IN_PROGRESS,
          percentComplete: 20,
          lastActivityAt: new Date('2026-08-29T12:01:00.000Z'),
        },
        existing: null,
        completedAt: null,
      }),
    ]);

    expect(results).toEqual([
      { newlyCompleted: true },
      { newlyCompleted: false },
    ]);
    expect(
      statements.filter((statement) => statement.sql.includes('pg_advisory_xact_lock')),
    ).toHaveLength(2);
    expect(
      statements.filter((statement) => statement.sql.includes('FOR UPDATE')),
    ).toHaveLength(2);
    const writes = statements.filter((statement) =>
      statement.sql.includes('INSERT INTO course_progress'),
    );
    expect(writes).toHaveLength(2);
    for (const statement of writes) {
      const sql = statement.sql;
      expect(sql).toContain('ON CONFLICT (user_id, program_slug, course_slug) DO UPDATE');
      expect(sql).toContain(
        "WHEN course_progress.status = 'COMPLETED'::\"course_progress_status\"",
      );
      expect(sql).toContain(
        "OR EXCLUDED.status = 'COMPLETED'::\"course_progress_status\"",
      );
      expect(sql).toContain('THEN 100');
      expect(sql).toContain(
        'GREATEST(0, course_progress.percent_complete, EXCLUDED.percent_complete)',
      );
      expect(sql).toContain('LEAST(\n          100,');
      expect(sql).toContain('GREATEST(course_progress.score_raw, EXCLUDED.score_raw)');
      expect(sql).toContain('statement_count = course_progress.statement_count +');
    }

    // Both writes left the row COMPLETED, so both hand the completion to the
    // certificate helper (idempotent there), after their own write returned.
    expect(certificateMocks.ensurePending).toHaveBeenCalledTimes(2);
    for (const call of certificateMocks.ensurePending.mock.calls as unknown as Array<[Record<string, unknown>]>) {
      expect(call[0]).toMatchObject({
        userId: 'user-1',
        programSlug: 'program-one',
        courseSlug: 'course-one',
        courseraCourseId: 'provider-course-1',
        source: 'coursera-progress-merge',
      });
    }
    expect((certificateMocks.ensurePending.mock.calls as unknown as Array<[{ completedAt: Date | null }]>)[0][0].completedAt)
      .toEqual(new Date('2026-08-29T12:00:00.000Z'));
    const lastWrite = Math.max(...statements.map((_, index) => index));
    expect(lastWrite).toBeGreaterThanOrEqual(0);
    expect(certificateMocks.ensurePending.mock.invocationCallOrder[0])
      .toBeGreaterThan(db.$queryRaw.mock.invocationCallOrder[0]);
  });

  it('a row that stays IN_PROGRESS creates no certificate', async () => {
    const db = {
      $executeRaw: vi.fn(async () => 1),
      $queryRaw: vi.fn(async (statement: { sql: string }) => {
        if (statement.sql.includes('SELECT status')) return [];
        return [{ status: CourseProgressStatus.IN_PROGRESS, inserted: true }];
      }),
    };

    await upsertMergedCourseProgress(db as never, {
      userId: 'user-1',
      programSlug: 'program-one',
      courseSlug: 'course-one',
      courseId: 'provider-course-1',
      merged: { status: CourseProgressStatus.IN_PROGRESS, percentComplete: 40, lastActivityAt: null },
      existing: null,
      completedAt: null,
    });

    expect(certificateMocks.ensurePending).not.toHaveBeenCalled();
  });

  it('runs the certificate step after the transaction commits when given the root client', async () => {
    const order: string[] = [];
    const tx = {
      $executeRaw: vi.fn(async () => 1),
      $queryRaw: vi.fn(async (statement: { sql: string }) => {
        order.push('query');
        if (statement.sql.includes('SELECT status')) return [];
        return [{ status: CourseProgressStatus.COMPLETED, inserted: true }];
      }),
    };
    const db = {
      ...tx,
      $transaction: vi.fn(async (fn: (client: typeof tx) => Promise<unknown>) => {
        const result = await fn(tx);
        order.push('commit');
        return result;
      }),
    };
    certificateMocks.ensurePending.mockImplementation(async () => {
      order.push('certificate');
      return null;
    });

    const result = await upsertMergedCourseProgress(db as never, {
      userId: 'user-1',
      programSlug: 'program-one',
      courseSlug: 'course-one',
      courseId: null,
      merged: { status: CourseProgressStatus.COMPLETED, percentComplete: 100, lastActivityAt: null },
      existing: null,
      completedAt: null,
    });

    expect(result).toEqual({ newlyCompleted: true });
    expect(order.indexOf('commit')).toBeLessThan(order.indexOf('certificate'));
    expect(certificateMocks.ensurePending).toHaveBeenCalledWith(expect.objectContaining({ courseraCourseId: null, completedAt: null }), {});
  });

  it('hands the certificate step the same client it wrote with, so a caller transaction covers both', async () => {
    const completedRow = async (statement: { sql: string }) => {
      if (statement.sql.includes('SELECT status')) return [];
      return [{ status: CourseProgressStatus.COMPLETED, inserted: true }];
    };
    const args = {
      userId: 'user-1',
      programSlug: 'program-one',
      courseSlug: 'course-one',
      courseId: 'provider-course-1',
      merged: { status: CourseProgressStatus.COMPLETED, percentComplete: 100, lastActivityAt: null },
      existing: null,
      completedAt: null,
    };

    // b4bSync passes its per-row transaction client: no $transaction, but the
    // model delegates are there. The helper must run on it.
    const tx = { $executeRaw: vi.fn(async () => 1), $queryRaw: vi.fn(completedRow), userCertification: {}, user: {}, auditLog: {} };
    await upsertMergedCourseProgress(tx as never, args);
    expect(certificateMocks.ensurePending).toHaveBeenLastCalledWith(expect.objectContaining({ source: 'coursera-progress-merge' }), { db: tx });

    // The root client (has $transaction and the delegates) is passed too: the
    // helper then opens its own transaction after ours committed.
    const root = { ...tx, $transaction: vi.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)) };
    await upsertMergedCourseProgress(root as never, args);
    expect(certificateMocks.ensurePending).toHaveBeenLastCalledWith(expect.anything(), { db: root });

    // A bare raw-SQL client (the ladder tests' shape) cannot carry the
    // certificate write; the helper falls back to the shared client.
    const bare = { $executeRaw: vi.fn(async () => 1), $queryRaw: vi.fn(completedRow) };
    await upsertMergedCourseProgress(bare as never, args);
    expect(certificateMocks.ensurePending).toHaveBeenLastCalledWith(expect.anything(), {});
  });

  it('bounds malformed provider percentages before insert and at the conflict ladder', async () => {
    const statements: Array<{ sql: string; values: unknown[] }> = [];
    const db = {
      $executeRaw: vi.fn(async (statement: { sql: string; values: unknown[] }) => {
        statements.push(statement);
        return 1;
      }),
      $queryRaw: vi.fn(async (statement: { sql: string; values: unknown[] }) => {
        statements.push(statement);
        if (statement.sql.includes('SELECT status')) return [];
        return [{ status: CourseProgressStatus.IN_PROGRESS, inserted: true }];
      }),
    };

    await upsertMergedCourseProgress(db as never, {
      userId: 'user-1',
      programSlug: 'program-one',
      courseSlug: 'course-one',
      courseId: 'provider-course-1',
      merged: {
        status: CourseProgressStatus.IN_PROGRESS,
        percentComplete: 150,
        lastActivityAt: null,
      },
      existing: null,
      completedAt: null,
    });

    const write = statements.find((statement) =>
      statement.sql.includes('INSERT INTO course_progress'),
    );
    expect(write?.values.filter((value) => value === 100)).toHaveLength(2);
    expect(write?.values).not.toContain(150);
    expect(write?.sql).toContain(
      'GREATEST(0, course_progress.percent_complete, EXCLUDED.percent_complete)',
    );
    expect(write?.sql).toContain(
      'GREATEST(0, course_progress.progress_pct, EXCLUDED.progress_pct)',
    );
  });
});
