import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  ensureTenantKeys: vi.fn(),
  rawFindMany: vi.fn(),
  queryRaw: vi.fn(),
  executeRaw: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock('@/lib/coursera/rawProgressTenantKeys', () => ({
  ensureCourseProgressTenantKeys: mocks.ensureTenantKeys,
}));
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    $transaction: mocks.transaction,
  },
}));

import { upsertCourseraCourseProgress } from '@/lib/coursera/upsertCourseraCourseProgress';
import { EXACT_EMAIL_CANDIDATE_LIMIT } from '@/lib/db/exactEmailMatch';

const input = {
  externalEmail: 'Learner@Example.com',
  courseraCourseId: 'course-1',
  courseName: 'Course One',
  programSlug: 'program-one',
  overallProgress: 25,
  isCompleted: false,
  userId: 'user-1',
  organizationId: 'org-1',
};

describe('upsertCourseraCourseProgress tenant identity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ensureTenantKeys.mockResolvedValue(undefined);
    mocks.rawFindMany.mockResolvedValue([]);
    mocks.queryRaw
      .mockReset()
      .mockResolvedValueOnce([]) // no existing linked users
      .mockResolvedValueOnce([{ id: 'user-1' }]) // incoming user FOR SHARE
      .mockResolvedValueOnce([]) // no legacy ownership conflict
      .mockResolvedValueOnce([{ userId: 'user-1' }]); // tenant upsert
    mocks.executeRaw.mockResolvedValue(1);
    mocks.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        courseraCourseProgress: { findMany: mocks.rawFindMany },
        $queryRaw: mocks.queryRaw,
        $executeRaw: mocks.executeRaw,
      }),
    );
  });

  it('rejects a linked user from another organization before writing raw progress', async () => {
    mocks.queryRaw
      .mockReset()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await expect(upsertCourseraCourseProgress(input)).rejects.toThrow(
      'linked-user-outside-organization',
    );
    expect(mocks.rawFindMany).not.toHaveBeenCalled();
    expect(
      mocks.executeRaw.mock.calls.filter(
        ([statement]) => !(statement as { sql?: string }).sql?.includes('pg_advisory_xact_lock'),
      ),
    ).toHaveLength(0);
  });

  it('looks up and conflicts on the organization-local raw identity', async () => {
    await upsertCourseraCourseProgress(input);

    expect(mocks.rawFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: 'org-1',
          externalEmail: { equals: 'learner@example.com', mode: 'insensitive' },
          courseraCourseId: 'course-1',
        },
        take: EXACT_EMAIL_CANDIDATE_LIMIT,
      }),
    );
    const lockStatement = mocks.executeRaw.mock.calls[0]?.[0] as {
      sql?: string;
      values?: unknown[];
    };
    expect(lockStatement.sql).toContain('pg_advisory_xact_lock');
    expect(lockStatement.values).toContain('coursera:raw-email:learner@example.com');

    const linkedUserStatement = mocks.queryRaw.mock.calls[0]?.[0] as {
      sql?: string;
      values?: unknown[];
    };
    expect(linkedUserStatement.sql).toContain('INNER JOIN coursera_course_progress existing');
    expect(linkedUserStatement.values).toEqual(
      expect.arrayContaining(['learner@example.com', 'course-1', 'user-1']),
    );

    const userLockStatement = mocks.queryRaw.mock.calls[1]?.[0] as {
      sql?: string;
      values?: unknown[];
    };
    expect(userLockStatement.sql).toContain('candidate_user.deleted_at IS NULL');
    expect(userLockStatement.sql).toContain('FOR SHARE');
    expect(userLockStatement.values).toEqual(expect.arrayContaining(['user-1', 'org-1']));

    const conflictStatement = mocks.queryRaw.mock.calls[2]?.[0] as {
      sql?: string;
      values?: unknown[];
    };
    expect(conflictStatement.sql).toContain("THEN 'foreign-organization'");
    expect(conflictStatement.sql).toContain('existing_user.organization_id');
    expect(conflictStatement.values).toContain('org-1');

    const adoptionStatement = mocks.executeRaw.mock.calls[1]?.[0] as {
      sql?: string;
      values?: unknown[];
    };
    expect(adoptionStatement.sql).toContain('existing.organization_id IS NULL');
    expect(adoptionStatement.values).toContain('org-1');

    const statement = mocks.queryRaw.mock.calls[3]?.[0] as { sql?: string; values?: unknown[] };
    expect(statement.sql).toContain(
      'ON CONFLICT (\n        organization_id,\n        LOWER(external_email),\n        coursera_course_id',
    );
    expect(statement.sql).toContain('FROM users incoming_insert_user');
    expect(statement.sql).toContain(
      'incoming_insert_user.organization_id =',
    );
    expect(statement.values).toContain('org-1');
  });

  it('rejects a legacy identity already owned by another organization before lookup/upsert', async () => {
    mocks.queryRaw
      .mockReset()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'user-1' }])
      .mockResolvedValueOnce([
        {
          kind: 'foreign-organization',
          externalEmail: 'learner@example.com',
          externalKey: 'course-1',
        },
      ]);

    await expect(upsertCourseraCourseProgress(input)).rejects.toThrow(
      'foreign-organization',
    );
    expect(
      mocks.executeRaw.mock.calls.filter(
        ([statement]) => !(statement as { sql?: string }).sql?.includes('pg_advisory_xact_lock'),
      ),
    ).toHaveLength(0);
    expect(mocks.rawFindMany).not.toHaveBeenCalled();
  });

  it('rejects a concurrent attempt to attach the same tenant row to another user', async () => {
    mocks.queryRaw
      .mockReset()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'user-1' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await expect(upsertCourseraCourseProgress(input)).rejects.toThrow(
      'concurrent linked row',
    );
  });

  it('does not merge unmatched B4B progress onto an ILIKE neighbor email', async () => {
    mocks.queryRaw
      .mockReset()
      .mockResolvedValueOnce([]) // no existing linked users
      .mockResolvedValueOnce([]) // no legacy ownership conflict
      .mockResolvedValueOnce([{ userId: null }]); // tenant upsert
    mocks.rawFindMany.mockResolvedValue([
      {
        externalEmail: 'mrjohnson@example.com',
        userId: 'neighbor-user',
        organizationId: 'org-1',
        overallProgress: 90,
        isCompleted: true,
        enrollmentTime: new Date('2026-01-01T00:00:00.000Z'),
        lastActivityTime: new Date('2026-01-02T00:00:00.000Z'),
        completionTime: new Date('2026-01-02T00:00:00.000Z'),
      },
    ]);

    await upsertCourseraCourseProgress({
      ...input,
      externalEmail: 'm_johnson@example.com',
      userId: null,
      overallProgress: 10,
      isCompleted: false,
    });

    const statement = mocks.queryRaw.mock.calls[2]?.[0] as {
      sql?: string;
      values?: unknown[];
    };
    expect(statement.values).toContain('m_johnson@example.com');
    expect(statement.values).not.toContain('mrjohnson@example.com');
    expect(statement.values).not.toContain('neighbor-user');
  });

  it('does not treat an ILIKE neighbor linked user as an identity conflict', async () => {
    mocks.rawFindMany.mockResolvedValue([
      {
        externalEmail: 'mrjohnson@example.com',
        userId: 'neighbor-user',
        organizationId: 'org-1',
        overallProgress: 90,
        isCompleted: true,
        enrollmentTime: new Date('2026-01-01T00:00:00.000Z'),
        lastActivityTime: new Date('2026-01-02T00:00:00.000Z'),
        completionTime: new Date('2026-01-02T00:00:00.000Z'),
      },
    ]);

    await expect(
      upsertCourseraCourseProgress({
        ...input,
        externalEmail: 'm_johnson@example.com',
      }),
    ).resolves.toBeUndefined();

    const statement = mocks.queryRaw.mock.calls[3]?.[0] as {
      values?: unknown[];
    };
    expect(statement.values).toContain('m_johnson@example.com');
    expect(statement.values).toContain('user-1');
    expect(statement.values).not.toContain('neighbor-user');
  });

  it('still reuses the exact existing row when only case differs', async () => {
    mocks.rawFindMany.mockResolvedValue([
      {
        externalEmail: 'Learner@Example.com',
        userId: 'user-1',
        organizationId: 'org-1',
        overallProgress: 40,
        isCompleted: false,
        enrollmentTime: new Date('2026-01-01T00:00:00.000Z'),
        lastActivityTime: new Date('2026-01-02T00:00:00.000Z'),
        completionTime: null,
      },
    ]);

    await upsertCourseraCourseProgress(input);

    const statement = mocks.queryRaw.mock.calls[3]?.[0] as {
      values?: unknown[];
    };
    expect(statement.values).toContain('Learner@Example.com');
    expect(statement.values).toContain('user-1');
  });
});
