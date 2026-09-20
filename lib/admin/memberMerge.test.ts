import { describe, it, expect } from 'vitest';
import { checkMergeConflicts, executeMemberMerge } from './memberMerge';
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

function makeMockTx() {
  const calls: string[] = [];

  function logCall(name: string, args: unknown) {
    calls.push(`${name}(${JSON.stringify(args)})`);
  }

  return {
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
        return null;
      },
      update: async (args: unknown) => {
        logCall('memberPoints.update', args);
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
      updateMany: async () => ({ count: 0 }),
      create: async (args: unknown) => {
        logCall('workflowDiagnostic.create', args);
        return {};
      },
    },
    emailSendLog: { updateMany: async () => ({ count: 0 }), count: async () => 0 },
    applicationMessage: { updateMany: async () => ({ count: 0 }) },
    message: { updateMany: async () => ({ count: 0 }) },
    memberEvent: { updateMany: async () => ({ count: 0 }) },
    weeklyRecap: { updateMany: async () => ({ count: 0 }) },
    aIToolResult: { updateMany: async () => ({ count: 0 }) },
    goal: { updateMany: async () => ({ count: 0 }) },
    resourceProgress: { updateMany: async () => ({ count: 0 }) },
    pathwayStepProgress: { updateMany: async () => ({ count: 0 }) },
    trainingAccessRequest: { updateMany: async () => ({ count: 0 }) },
    auditLog: { updateMany: async () => ({ count: 0 }) },
    invitation: { updateMany: async () => ({ count: 0 }) },
    programChangeRequest: { updateMany: async () => ({ count: 0 }) },
    partnerReferral: { updateMany: async () => ({ count: 0 }) },
    partnerOutreachLog: { updateMany: async () => ({ count: 0 }) },
    portalWorkflowEvent: { updateMany: async () => ({ count: 0 }) },
    jobPostingApplication: { updateMany: async () => ({ count: 0 }) },
    aIJobMatch: { updateMany: async () => ({ count: 0 }) },
    memberNextBestAction: { updateMany: async () => ({ count: 0 }) },
    jobApplication: { updateMany: async () => ({ count: 0 }) },
    pointsTransaction: { updateMany: async () => ({ count: 0 }) },
    memberSubgroup: { updateMany: async () => ({ count: 0 }) },
    subgroupLeader: { updateMany: async () => ({ count: 0 }) },
    messageThread: { updateMany: async () => ({ count: 0 }) },
    application: { updateMany: async () => ({ count: 0 }) },
    learningProgress: { updateMany: async () => ({ count: 0 }) },
    userCertification: { updateMany: async () => ({ count: 0 }) },
    readinessChecklist: { updateMany: async () => ({ count: 0 }) },
    benefitRequest: { updateMany: async () => ({ count: 0 }) },
    counselorAssignment: { updateMany: async () => ({ count: 0 }) },
    counselorNote: { updateMany: async () => ({ count: 0 }) },
    placementRecord: { updateMany: async () => ({ count: 0 }) },
    placedOutcome: { updateMany: async () => ({ count: 0 }) },
    mentorSession: { updateMany: async () => ({ count: 0 }) },
    userRole: { updateMany: async () => ({ count: 0 }) },
    courseEnrollment: { updateMany: async () => ({ count: 0 }) },
    preScreeningResponse: { updateMany: async () => ({ count: 0 }) },
    preScreeningDraft: { updateMany: async () => ({ count: 0 }) },
    applicationAiFeedback: { updateMany: async () => ({ count: 0 }) },
    atRiskAlert: { updateMany: async () => ({ count: 0 }) },
    placementSurvey: { updateMany: async () => ({ count: 0 }) },
    testimonial: { updateMany: async () => ({ count: 0 }) },
    courseraCourseProgress: { updateMany: async () => ({ count: 0 }) },
    courseraBadgeProgress: { updateMany: async () => ({ count: 0 }) },
    courseraSkillsetProgress: { updateMany: async () => ({ count: 0 }) },
    courseraIdentityMapping: { updateMany: async () => ({ count: 0 }) },
    subgroup: { updateMany: async () => ({ count: 0 }) },
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
