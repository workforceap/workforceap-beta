import { describe, it, expect } from 'vitest';
import { checkMergeConflicts, executeMemberMerge } from './memberMerge';
import { MEMBER_MERGE_PREVIEW_ONLY, MEMBER_MERGE_REPOINT_PLAN } from './memberMergeRepointPlan';
import type { Prisma } from '@prisma/client';

function makeMockUser(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'user-1',
    email: 'a@example.com',
    fullName: 'Alice',
    organizationId: 'org-1',
    phone: null,
    enrolledProgram: null,
    assessmentCompleted: false,
    deletedAt: null,
    assessmentCompletedAt: null,
    assessmentScore: null,
    assessmentScorePct: null,
    programInterest: null,
    enrolledAt: null,
    interviewEligible: false,
    interviewRequestedAt: null,
    interviewCompletedAt: null,
    onboardingCompletedAt: null,
    workspaceEmail: null,
    wioaQualificationJson: null,
    careerRecommendationJson: null,
    assessmentAnswers: null,
    coursesCompleted: null,
    courseraEnrollmentApproved: false,
    courseraEnrollmentApprovedAt: null,
    courseraEnrollmentApprovedById: null,
    wioaReviewStatus: null,
    wioaReviewedAt: null,
    wioaReviewedByUserId: null,
    wioaReviewNotes: null,
    pipelineBoardStage: null,
    programChangedAt: null,
    onboardingPortal: null,
    tourCompletedAt: null,
    workspaceEmailProvisioned: false,
    needsComputerSupportFollowUp: false,
    staleTrainingDetectedAt: null,
    lastCourseraAutoSyncAt: null,
    lastLoginAt: null,
    ...overrides,
  };
}

/** Rows a test wants a model to hold, keyed by delegate name. */
type MockRows = Record<string, Array<Record<string, unknown>>>;

/**
 * A count/findMany/updateMany delegate per planned relation, driven by `rows`.
 * `updateMany` honours the `NOT` exclusion list the collision planner builds,
 * so a unit test sees the same arithmetic production does.
 */
function planDelegates(rows: MockRows) {
  const delegates: Record<string, unknown> = {};
  for (const spec of [...MEMBER_MERGE_REPOINT_PLAN, ...MEMBER_MERGE_PREVIEW_ONLY]) {
    // One delegate per MODEL, and two specs can share a model
    // (pointsTransaction.userId and .awardedBy), so the filter reads the
    // `where` it is given rather than closing over a single column.
    if (delegates[spec.model]) continue;
    const all = () => rows[spec.model] ?? [];
    const matching = (where: Record<string, unknown>) =>
      all().filter((row) =>
        Object.entries(where).every(([column, value]) => column === 'NOT' || row[column] === value),
      );
    delegates[spec.model] = {
      count: async ({ where }: { where: Record<string, unknown> }) => matching(where).length,
      findMany: async ({ where }: { where: Record<string, unknown> }) => matching(where),
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        const excluded = (where.NOT as Array<Record<string, unknown>> | undefined) ?? [];
        const moving = matching(where).filter(
          (row) => !excluded.some((tuple) => Object.entries(tuple).every(([key, value]) => row[key] === value)),
        );
        for (const row of moving) Object.assign(row, data);
        return { count: moving.length };
      },
    };
  }
  return delegates as Record<string, { count: (args: never) => Promise<number> }>;
}

function makeMockTx(options: { rows?: MockRows; memberPointsRow?: { totalPoints: number } | null } = {}) {
  const rows: MockRows = options.rows ?? {};
  const memberPointsRow = options.memberPointsRow ?? null;
  const calls: string[] = [];

  function logCall(name: string, args: unknown) {
    calls.push(`${name}(${JSON.stringify(args)})`);
  }

  const generated = planDelegates(rows);

  return {
    // Delegates are generated from the repoint plan rather than listed by
    // hand: the old hand-written copy is exactly the kind of second list that
    // let the two broken column names survive. `rows` lets a test give a
    // model real data to collide on. Specials below override these.
    ...generated,
    pointsTransaction: {
      ...generated.pointsTransaction,
      aggregate: async ({ where }: { where: Record<string, unknown> }) => {
        const owned = (rows.pointsTransaction ?? []).filter((row) => row.userId === where.userId);
        return { _sum: { points: owned.reduce((sum, row) => sum + Number(row.points ?? 0), 0) } };
      },
    },
    emailSendLog: { ...generated.emailSendLog, count: async () => 0 },
    calls,
    $queryRaw: async (query: Prisma.Sql) => {
      const sql = query.sql;
      logCall('$queryRaw', sql);
      if (sql.includes('FOR UPDATE')) {
        const ids = (query.values ?? []).filter((value): value is string => typeof value === 'string');
        return [
          { id: ids[0] ?? 'primary', organizationId: 'org-1', deletedAt: null },
          { id: ids[1] ?? 'secondary', organizationId: 'org-1', deletedAt: null },
        ];
      }
      return [];
    },
    user: {
      findUnique: async ({ where }: { where: Record<string, unknown> }) => {
        logCall('user.findUnique', where);
        if (where.id === 'primary') return makeMockUser({ id: 'primary', email: 'primary@example.com', fullName: 'Primary', enrolledProgram: 'tech' });
        if (where.id === 'secondary') return makeMockUser({ id: 'secondary', email: 'secondary@example.com', fullName: 'Secondary', enrolledProgram: 'tech' });
        if (where.id === 'conflict-secondary') return makeMockUser({ id: 'conflict-secondary', email: 'conflict@example.com', fullName: 'Conflict', enrolledProgram: 'health' });
        if (where.id === 'deleted') return makeMockUser({ id: 'deleted', email: 'deleted@example.com', deletedAt: new Date() });
        return null;
      },
      update: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        logCall('user.update', { where, data });
        return { id: where.id, ...data };
      },
    },
    counselor: {
      findUnique: async ({ where }: { where: Record<string, unknown> }) => {
        logCall('counselor.findUnique', where);
        return null;
      },
    },
    mentor: {
      findUnique: async ({ where }: { where: Record<string, unknown> }) => {
        logCall('mentor.findUnique', where);
        return null;
      },
    },
    partnerUser: {
      findUnique: async ({ where }: { where: Record<string, unknown> }) => {
        logCall('partnerUser.findUnique', where);
        return null;
      },
    },
    employer: {
      findUnique: async ({ where }: { where: Record<string, unknown> }) => {
        logCall('employer.findUnique', where);
        return null;
      },
    },
    profile: {
      findUnique: async ({ where }: { where: Record<string, unknown> }) => {
        logCall('profile.findUnique', where);
        return null;
      },
      update: async (args: unknown) => {
        logCall('profile.update', args);
        return {};
      },
    },
    memberPoints: {
      findUnique: async ({ where }: { where: Record<string, unknown> }) => {
        logCall('memberPoints.findUnique', where);
        return memberPointsRow;
      },
      update: async (args: unknown) => {
        logCall('memberPoints.update', args);
        return {};
      },
      upsert: async (args: unknown) => {
        logCall('memberPoints.upsert', args);
        return {};
      },
    },
    courseProgress: {
      findMany: async () => {
        logCall('courseProgress.findMany', {});
        return [];
      },
    },
    memberProgramProgress: {
      findMany: async () => {
        logCall('memberProgramProgress.findMany', {});
        return [];
      },
    },
    workflowDiagnostic: {
      ...generated.workflowDiagnostic,
      create: async (args: unknown) => {
        logCall('workflowDiagnostic.create', args);
        return {};
      },
    },
  } as unknown as Prisma.TransactionClient;
}

type MockTxExtras = {
  calls: string[];
  user: {
    findUnique: (args: { where: Record<string, unknown> }) => Promise<ReturnType<typeof makeMockUser> | null>;
  };
};

describe('checkMergeConflicts', () => {
  it('returns empty when both users have same enrolledProgram', async () => {
    const tx = makeMockTx();
    const conflicts = await checkMergeConflicts(tx, 'primary', 'secondary');
    expect(conflicts.length).toBe(0);
  });

  it('detects different enrolledProgram', async () => {
    const tx = makeMockTx();
    const conflicts = await checkMergeConflicts(tx, 'primary', 'conflict-secondary');
    expect(conflicts.length).toBe(1);
    expect(conflicts[0].field).toBe('enrolledProgram');
    expect(conflicts[0].message).toContain('tech vs health');
  });
});

describe('executeMemberMerge', () => {
  it('throws when primary not found', async () => {
    const tx = makeMockTx();
    await expect(executeMemberMerge(tx, 'missing', 'secondary', 'admin-1')).rejects.toThrow('One or both members not found');
  });

  it('throws when secondary is deleted', async () => {
    const tx = makeMockTx();
    await expect(executeMemberMerge(tx, 'primary', 'deleted', 'admin-1')).rejects.toThrow('Cannot merge deleted members');
  });

  it('throws when conflicts exist', async () => {
    const tx = makeMockTx();
    await expect(executeMemberMerge(tx, 'primary', 'conflict-secondary', 'admin-1')).rejects.toThrow('Merge blocked by 1 conflict');
  });

  it('fails closed before merge mutations when the secondary owns Coursera data', async () => {
    const tx = makeMockTx();
    let queryCount = 0;
    (tx as any).$queryRaw = async () => {
      queryCount += 1;
      return queryCount === 1
        ? [
            { id: 'primary', organizationId: 'org-1', deletedAt: null },
            { id: 'secondary', organizationId: 'org-1', deletedAt: null },
          ]
        : [{ source: 'course' }];
    };

    await expect(
      executeMemberMerge(tx, 'primary', 'secondary', 'admin-1'),
    ).rejects.toThrow('secondary member has Coursera progress or identity mappings');

    const calls = (tx as unknown as MockTxExtras & { calls: string[] }).calls;
    expect(calls.some((call) => call.startsWith('user.update'))).toBe(false);
  });

  it('soft-deletes secondary and logs merge', async () => {
    const tx = makeMockTx();
    const result = await executeMemberMerge(tx, 'primary', 'secondary', 'admin-1');
    expect(result.primaryId).toBe('primary');
    expect(result.secondaryId).toBe('secondary');
    expect(result.repointed).toEqual([]);

    // Should have updated secondary user with deletedAt + email suffix
    const calls = (tx as unknown as MockTxExtras).calls;
    const userUpdateCall = calls.find((c) => c.startsWith('user.update({"where":{"id":"secondary"}'));
    expect(userUpdateCall).toBeDefined();
    expect(userUpdateCall).toContain('deletedAt');
    expect(userUpdateCall).toContain('.merged-secondary');

    // Should have logged merge
    const logCall = calls.find((c) => c.startsWith('workflowDiagnostic.create'));
    expect(logCall).toBeDefined();
    expect(logCall).toContain('member_merge');
  });

  it('merges scalar fields when secondary has values primary lacks', async () => {
    const tx = makeMockTx();
    // Override primary to have null phone, secondary to have phone
    (tx as unknown as MockTxExtras).user.findUnique = async ({ where }: { where: Record<string, unknown> }) => {
      if (where.id === 'primary') return makeMockUser({ id: 'primary', phone: null, email: 'primary@example.com' });
      if (where.id === 'secondary') return makeMockUser({ id: 'secondary', phone: '555-1234', email: 'secondary@example.com' });
      return null;
    };

    const result = await executeMemberMerge(tx, 'primary', 'secondary', 'admin-1');
    expect(result.mergedFields).toContain('phone');
  });
});


describe('collision planning (the duplicate key never reaches PostgreSQL)', () => {
  function pointsRows() {
    return {
      pointsTransaction: [
        // both members completed the assessment: same (event, entityId)
        { userId: 'primary', event: 'assessment_completed', entityId: '', points: 100 },
        { userId: 'secondary', event: 'assessment_completed', entityId: '', points: 100 },
        { userId: 'secondary', event: 'course_completed', entityId: 'intro', points: 75 },
        { userId: 'secondary', event: 'job_application', entityId: 'app-1', points: 25 },
      ],
    };
  }

  it('moves the rows that do not collide and leaves the one that does', async () => {
    const rows = pointsRows();
    const tx = makeMockTx({ rows });
    const result = await executeMemberMerge(tx, 'primary', 'secondary', 'admin-1');

    const moved = rows.pointsTransaction.filter((row) => row.userId === 'primary');
    const stranded = rows.pointsTransaction.filter((row) => row.userId === 'secondary');
    expect(moved).toHaveLength(3);
    expect(stranded).toHaveLength(1);
    expect(stranded[0].event).toBe('assessment_completed');
    // Exactly one assessment award on the merged member — not two, not zero.
    expect(moved.filter((row) => row.event === 'assessment_completed')).toHaveLength(1);

    const report = result.repointed.find((entry) => entry.startsWith('pointsTransaction.userId'));
    expect(report).toBe('pointsTransaction.userId(2, 1 kept on the merged account)');
  });

  it('recomputes the points counter from the ledger that resulted', async () => {
    const rows = pointsRows();
    const tx = makeMockTx({ rows, memberPointsRow: { totalPoints: 100 } });
    const result = await executeMemberMerge(tx, 'primary', 'secondary', 'admin-1');

    const upsert = (tx as unknown as MockTxExtras).calls.find((call) => call.startsWith('memberPoints.upsert'));
    expect(upsert).toBeDefined();
    // 100 kept + 75 + 25 moved. The stranded duplicate is not counted.
    expect(upsert).toContain('"totalPoints":200');
    expect(result.mergedFields.some((field) => field.startsWith('memberPoints.totalPoints'))).toBe(true);
  });

  it('leaves the counter alone when the ledger already agrees with it', async () => {
    const rows = { pointsTransaction: [{ userId: 'primary', event: 'daily_study', entityId: 'd1', points: 5 }] };
    const tx = makeMockTx({ rows, memberPointsRow: { totalPoints: 5 } });
    const result = await executeMemberMerge(tx, 'primary', 'secondary', 'admin-1');
    const upsert = (tx as unknown as MockTxExtras).calls.find((call) => call.startsWith('memberPoints.upsert'));
    expect(upsert).toBeUndefined();
    expect(result.mergedFields.some((field) => field.startsWith('memberPoints.totalPoints'))).toBe(false);
  });

  it('moves everything when nothing collides', async () => {
    const rows = {
      pointsTransaction: [
        { userId: 'primary', event: 'resume_uploaded', entityId: 'first-upload', points: 50 },
        { userId: 'secondary', event: 'course_completed', entityId: 'intro', points: 75 },
      ],
    };
    const tx = makeMockTx({ rows, memberPointsRow: { totalPoints: 50 } });
    const result = await executeMemberMerge(tx, 'primary', 'secondary', 'admin-1');
    expect(rows.pointsTransaction.every((row) => row.userId === 'primary')).toBe(true);
    expect(result.repointed).toContain('pointsTransaction.userId(1)');
    const upsert = (tx as unknown as MockTxExtras).calls.find((call) => call.startsWith('memberPoints.upsert'));
    expect(upsert).toContain('"totalPoints":125');
  });

  it('keeps a singly-unique row on the merged account rather than failing', async () => {
    // placedOutcome.userId is unique on its own: the primary already has one.
    const rows = {
      placedOutcome: [
        { userId: 'primary', id: 'po-primary' },
        { userId: 'secondary', id: 'po-secondary' },
      ],
    };
    const tx = makeMockTx({ rows });
    const result = await executeMemberMerge(tx, 'primary', 'secondary', 'admin-1');
    expect(rows.placedOutcome.find((row) => row.id === 'po-secondary')?.userId).toBe('secondary');
    expect(result.repointed).toContain('placedOutcome.userId(0, 1 kept on the merged account)');
  });

  it('reports which relation failed instead of calling everything a constraint conflict', async () => {
    const tx = makeMockTx();
    (tx as unknown as Record<string, unknown>).userCertification = {
      count: async () => 1,
      findMany: async () => {
        throw new Error('boom');
      },
      updateMany: async () => ({ count: 0 }),
    };
    await expect(executeMemberMerge(tx, 'primary', 'secondary', 'admin-1')).rejects.toThrow(
      /repointing userCertification\.userId/,
    );
    // The old code swallowed this and kept going on an aborted transaction.
    await expect(executeMemberMerge(tx, 'primary', 'secondary', 'admin-1')).rejects.not.toThrow(
      /constraint conflict/,
    );
  });
});
