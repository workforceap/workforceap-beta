import { Prisma, type CourseProgressStatus, type User } from '@prisma/client';

type TxClient = Prisma.TransactionClient;

export interface MergeConflict {
  field: string;
  primaryValue: unknown;
  secondaryValue: unknown;
  message: string;
}

export interface MergePreview {
  primary: Pick<User, 'id' | 'fullName' | 'email' | 'phone' | 'enrolledProgram' | 'assessmentCompleted'>;
  secondary: Pick<User, 'id' | 'fullName' | 'email' | 'phone' | 'enrolledProgram' | 'assessmentCompleted'>;
  conflicts: MergeConflict[];
  relationsToRepoint: { model: string; field: string; count: number }[];
  scalarFieldsToMerge: string[];
}

export interface MergeResult {
  primaryId: string;
  secondaryId: string;
  repointed: string[];
  mergedFields: string[];
}

const STATUS_RANK: Record<CourseProgressStatus, number> = {
  NOT_STARTED: 0,
  IN_PROGRESS: 1,
  COMPLETED: 2,
};

/**
 * Stage A deliberately blocks merging a member that owns any Coursera raw or
 * identity rows. Raw writers and guarded mapping flows take FOR SHARE on the
 * target user after their identity advisory lock; this deterministic FOR
 * UPDATE lock therefore makes the absence check stable until the merge
 * transaction soft-deletes the secondary member.
 */
export async function assertNoCourseraOwnershipForMemberMerge(
  tx: TxClient,
  primaryId: string,
  secondaryId: string,
  expectedOrganizationId: string,
): Promise<void> {
  const lockedUsers = await tx.$queryRaw<Array<{
    id: string;
    organizationId: string;
    deletedAt: Date | null;
  }>>(Prisma.sql`
    SELECT
      merge_user.id,
      merge_user.organization_id AS "organizationId",
      merge_user.deleted_at AS "deletedAt"
    FROM users AS merge_user
    WHERE merge_user.id IN (${Prisma.join([primaryId, secondaryId])})
    ORDER BY merge_user.id
    FOR UPDATE
  `);

  const expectedUserIds = new Set([primaryId, secondaryId]);
  if (
    lockedUsers.length !== 2
    || lockedUsers.some(
      (user) =>
        !expectedUserIds.has(user.id)
        || user.deletedAt !== null
        || user.organizationId !== expectedOrganizationId,
    )
  ) {
    throw new Error('Member merge users changed or are outside the expected organization');
  }

  const ownership = await tx.$queryRaw<Array<{ source: string }>>(Prisma.sql`
    SELECT ownership.source
    FROM (
      SELECT 'course'::text AS source
      FROM coursera_course_progress
      WHERE user_id = ${secondaryId}
      UNION ALL
      SELECT 'badge'::text AS source
      FROM coursera_badge_progress
      WHERE user_id = ${secondaryId}
      UNION ALL
      SELECT 'mapping'::text AS source
      FROM coursera_identity_mappings
      WHERE user_id = ${secondaryId}
    ) AS ownership
    LIMIT 1
  `);

  if (ownership.length > 0) {
    throw new Error(
      'Member merge blocked: secondary member has Coursera progress or identity mappings',
    );
  }
}

/**
 * Check for unresolvable conflicts before merging.
 * Returns empty array if safe to proceed.
 */
export async function checkMergeConflicts(
  tx: TxClient,
  primaryId: string,
  secondaryId: string,
): Promise<MergeConflict[]> {
  const conflicts: MergeConflict[] = [];

  const [primary, secondary] = await Promise.all([
    tx.user.findUnique({ where: { id: primaryId } }),
    tx.user.findUnique({ where: { id: secondaryId } }),
  ]);

  if (!primary || !secondary) return conflicts;

  // Critical scalar conflicts
  if (primary.enrolledProgram && secondary.enrolledProgram && primary.enrolledProgram !== secondary.enrolledProgram) {
    conflicts.push({
      field: 'enrolledProgram',
      primaryValue: primary.enrolledProgram,
      secondaryValue: secondary.enrolledProgram,
      message: `Both members are enrolled in different programs (${primary.enrolledProgram} vs ${secondary.enrolledProgram})`,
    });
  }

  if (primary.workspaceEmail && secondary.workspaceEmail && primary.workspaceEmail !== secondary.workspaceEmail) {
    conflicts.push({
      field: 'workspaceEmail',
      primaryValue: primary.workspaceEmail,
      secondaryValue: secondary.workspaceEmail,
      message: 'Both members have different workspace emails',
    });
  }

  // Unique-constrained persona conflicts (both have one — can't merge)
  const [primaryCounselor, secondaryCounselor, primaryMentor, secondaryMentor, primaryPartnerUser, secondaryPartnerUser, primaryEmployer, secondaryEmployer] =
    await Promise.all([
      tx.counselor.findUnique({ where: { userId: primaryId } }),
      tx.counselor.findUnique({ where: { userId: secondaryId } }),
      tx.mentor.findUnique({ where: { userId: primaryId } }),
      tx.mentor.findUnique({ where: { userId: secondaryId } }),
      tx.partnerUser.findUnique({ where: { userId: primaryId } }),
      tx.partnerUser.findUnique({ where: { userId: secondaryId } }),
      tx.employer.findUnique({ where: { userId: primaryId } }),
      tx.employer.findUnique({ where: { userId: secondaryId } }),
    ]);

  if (primaryCounselor && secondaryCounselor) {
    conflicts.push({ field: 'counselorProfile', primaryValue: true, secondaryValue: true, message: 'Both members have counselor profiles' });
  }
  if (primaryMentor && secondaryMentor) {
    conflicts.push({ field: 'mentorProfile', primaryValue: true, secondaryValue: true, message: 'Both members have mentor profiles' });
  }
  if (primaryPartnerUser && secondaryPartnerUser) {
    conflicts.push({ field: 'partnerUser', primaryValue: true, secondaryValue: true, message: 'Both members have partner user profiles' });
  }
  if (primaryEmployer && secondaryEmployer) {
    conflicts.push({ field: 'employer', primaryValue: true, secondaryValue: true, message: 'Both members have employer profiles' });
  }

  return conflicts;
}

/**
 * Build a preview of what will happen during a merge without mutating anything.
 */
export async function buildMergePreview(
  tx: TxClient,
  primaryId: string,
  secondaryId: string,
): Promise<MergePreview> {
  const [primary, secondary] = await Promise.all([
    tx.user.findUnique({ where: { id: primaryId } }),
    tx.user.findUnique({ where: { id: secondaryId } }),
  ]);

  if (!primary || !secondary) {
    throw new Error('One or both members not found');
  }

  const conflicts = await checkMergeConflicts(tx, primaryId, secondaryId);

  // Count relations that would be repointed (read-only check)
  const relationsToRepoint: { model: string; field: string; count: number }[] = [];

  const countQueries: Array<{ model: string; field: string; promise: Promise<number> }> = [
    { model: 'applicationMessage', field: 'authorId', promise: tx.applicationMessage.count({ where: { authorId: secondaryId } }) },
    { model: 'message', field: 'authorId', promise: tx.message.count({ where: { authorId: secondaryId } }) },
    { model: 'memberEvent', field: 'userId', promise: tx.memberEvent.count({ where: { userId: secondaryId } }) },
    { model: 'weeklyRecap', field: 'userId', promise: tx.weeklyRecap.count({ where: { userId: secondaryId } }) },
    { model: 'aiToolResult', field: 'userId', promise: tx.aIToolResult.count({ where: { userId: secondaryId } }) },
    { model: 'goal', field: 'userId', promise: tx.goal.count({ where: { userId: secondaryId } }) },
    { model: 'resourceProgress', field: 'userId', promise: tx.resourceProgress.count({ where: { userId: secondaryId } }) },
    { model: 'pathwayStepProgress', field: 'userId', promise: tx.pathwayStepProgress.count({ where: { userId: secondaryId } }) },
    { model: 'trainingAccessRequest', field: 'userId', promise: tx.trainingAccessRequest.count({ where: { userId: secondaryId } }) },
    { model: 'workflowDiagnostic', field: 'actorUserId', promise: tx.workflowDiagnostic.count({ where: { actorUserId: secondaryId } }) },
    { model: 'emailSendLog', field: 'userId', promise: tx.emailSendLog.count({ where: { userId: secondaryId } }) },
    { model: 'auditLog', field: 'actorUserId', promise: tx.auditLog.count({ where: { actorUserId: secondaryId } }) },
    { model: 'invitation', field: 'invitedById', promise: tx.invitation.count({ where: { invitedById: secondaryId } }) },
    { model: 'invitation', field: 'acceptedById', promise: tx.invitation.count({ where: { acceptedById: secondaryId } }) },
    { model: 'programChangeRequest', field: 'userId', promise: tx.programChangeRequest.count({ where: { userId: secondaryId } }) },
    { model: 'programChangeRequest', field: 'reviewedById', promise: tx.programChangeRequest.count({ where: { reviewedById: secondaryId } }) },
    { model: 'partnerReferral', field: 'memberId', promise: tx.partnerReferral.count({ where: { memberId: secondaryId } }) },
    { model: 'partnerReferral', field: 'assignedPartnerUserId', promise: tx.partnerReferral.count({ where: { assignedPartnerUserId: secondaryId } }) },
    { model: 'partnerOutreachLog', field: 'memberId', promise: tx.partnerOutreachLog.count({ where: { memberId: secondaryId } }) },
    { model: 'partnerOutreachLog', field: 'createdByUserId', promise: tx.partnerOutreachLog.count({ where: { createdByUserId: secondaryId } }) },
    { model: 'portalWorkflowEvent', field: 'actorUserId', promise: tx.portalWorkflowEvent.count({ where: { actorUserId: secondaryId } }) },
    { model: 'jobPostingApplication', field: 'studentId', promise: tx.jobPostingApplication.count({ where: { studentId: secondaryId } }) },
    { model: 'aIJobMatch', field: 'studentId', promise: tx.aIJobMatch.count({ where: { studentId: secondaryId } }) },
    { model: 'memberNextBestAction', field: 'memberId', promise: tx.memberNextBestAction.count({ where: { memberId: secondaryId } }) },
    { model: 'jobApplication', field: 'userId', promise: tx.jobApplication.count({ where: { userId: secondaryId } }) },
    { model: 'pointsTransaction', field: 'userId', promise: tx.pointsTransaction.count({ where: { userId: secondaryId } }) },
    { model: 'pointsTransaction', field: 'awardedBy', promise: tx.pointsTransaction.count({ where: { awardedBy: secondaryId } }) },
    { model: 'memberSubgroup', field: 'memberId', promise: tx.memberSubgroup.count({ where: { memberId: secondaryId } }) },
    { model: 'memberSubgroup', field: 'assignedBy', promise: tx.memberSubgroup.count({ where: { assignedBy: secondaryId } }) },
    { model: 'subgroupLeader', field: 'userId', promise: tx.subgroupLeader.count({ where: { userId: secondaryId } }) },
    { model: 'messageThread', field: 'memberId', promise: tx.messageThread.count({ where: { memberId: secondaryId } }) },
    { model: 'messageThread', field: 'counselorUserId', promise: tx.messageThread.count({ where: { counselorUserId: secondaryId } }) },
    { model: 'application', field: 'userId', promise: tx.application.count({ where: { userId: secondaryId } }) },
    { model: 'learningProgress', field: 'userId', promise: tx.learningProgress.count({ where: { userId: secondaryId } }) },
    { model: 'userCertification', field: 'userId', promise: tx.userCertification.count({ where: { userId: secondaryId } }) },
    { model: 'readinessChecklist', field: 'userId', promise: tx.readinessChecklist.count({ where: { userId: secondaryId } }) },
    { model: 'benefitRequest', field: 'userId', promise: tx.benefitRequest.count({ where: { userId: secondaryId } }) },
    { model: 'counselorAssignment', field: 'memberId', promise: tx.counselorAssignment.count({ where: { memberId: secondaryId } }) },
    { model: 'counselorNote', field: 'memberId', promise: tx.counselorNote.count({ where: { memberId: secondaryId } }) },
    { model: 'counselorNote', field: 'authorId', promise: tx.counselorNote.count({ where: { authorId: secondaryId } }) },
    { model: 'placementRecord', field: 'userId', promise: tx.placementRecord.count({ where: { userId: secondaryId } }) },
    { model: 'placedOutcome', field: 'userId', promise: tx.placedOutcome.count({ where: { userId: secondaryId } }) },
    { model: 'mentorSession', field: 'memberId', promise: tx.mentorSession.count({ where: { memberId: secondaryId } }) },
    { model: 'userRole', field: 'userId', promise: tx.userRole.count({ where: { userId: secondaryId } }) },
    { model: 'courseEnrollment', field: 'userId', promise: tx.courseEnrollment.count({ where: { userId: secondaryId } }) },
    { model: 'courseEnrollment', field: 'enrolledByAdminId', promise: tx.courseEnrollment.count({ where: { enrolledByAdminId: secondaryId } }) },
    { model: 'preScreeningResponse', field: 'userId', promise: tx.preScreeningResponse.count({ where: { userId: secondaryId } }) },
    { model: 'preScreeningDraft', field: 'userId', promise: tx.preScreeningDraft.count({ where: { userId: secondaryId } }) },
    { model: 'applicationAiFeedback', field: 'userId', promise: tx.applicationAiFeedback.count({ where: { userId: secondaryId } }) },
    { model: 'atRiskAlert', field: 'userId', promise: tx.atRiskAlert.count({ where: { userId: secondaryId } }) },
    { model: 'placementSurvey', field: 'userId', promise: tx.placementSurvey.count({ where: { userId: secondaryId } }) },
    { model: 'testimonial', field: 'memberId', promise: tx.testimonial.count({ where: { memberId: secondaryId } }) },
    { model: 'testimonial', field: 'reviewedBy', promise: tx.testimonial.count({ where: { reviewedBy: secondaryId } }) },
    { model: 'courseraCourseProgress', field: 'userId', promise: tx.courseraCourseProgress.count({ where: { userId: secondaryId } }) },
    { model: 'courseraBadgeProgress', field: 'userId', promise: tx.courseraBadgeProgress.count({ where: { userId: secondaryId } }) },
    { model: 'courseraSkillsetProgress', field: 'userId', promise: tx.courseraSkillsetProgress.count({ where: { userId: secondaryId } }) },
    { model: 'courseraIdentityMapping', field: 'userId', promise: tx.courseraIdentityMapping.count({ where: { userId: secondaryId } }) },
  ];

  const counts = await Promise.all(countQueries.map((q) => q.promise));
  for (let i = 0; i < countQueries.length; i++) {
    if (counts[i] > 0) {
      relationsToRepoint.push({ model: countQueries[i].model, field: countQueries[i].field, count: counts[i] });
    }
  }

  // Scalar fields that would be merged
  const scalarFieldsToMerge: string[] = [];
  const scalarCandidates = [
    'phone',
    'assessmentCompleted',
    'assessmentCompletedAt',
    'assessmentScore',
    'assessmentScorePct',
    'programInterest',
    'enrolledProgram',
    'enrolledAt',
    'interviewEligible',
    'interviewRequestedAt',
    'interviewCompletedAt',
    'onboardingCompletedAt',
    'workspaceEmail',
    'wioaQualificationJson',
    'careerRecommendationJson',
    'assessmentAnswers',
    'coursesCompleted',
    'courseraEnrollmentApproved',
    'courseraEnrollmentApprovedAt',
    'courseraEnrollmentApprovedById',
    'wioaReviewStatus',
    'wioaReviewedAt',
    'wioaReviewedByUserId',
    'wioaReviewNotes',
    'pipelineBoardStage',
    'programChangedAt',
    'onboardingPortal',
    'tourCompletedAt',
    'workspaceEmailProvisioned',
    'needsComputerSupportFollowUp',
    'staleTrainingDetectedAt',
    'lastCourseraAutoSyncAt',
    'lastLoginAt',
  ] as const;

  for (const key of scalarCandidates) {
    const pVal = primary[key as keyof User];
    const sVal = secondary[key as keyof User];
    if (pVal == null && sVal != null) {
      scalarFieldsToMerge.push(key);
    }
  }

  return {
    primary: {
      id: primary.id,
      fullName: primary.fullName,
      email: primary.email,
      phone: primary.phone,
      enrolledProgram: primary.enrolledProgram,
      assessmentCompleted: primary.assessmentCompleted,
    },
    secondary: {
      id: secondary.id,
      fullName: secondary.fullName,
      email: secondary.email,
      phone: secondary.phone,
      enrolledProgram: secondary.enrolledProgram,
      assessmentCompleted: secondary.assessmentCompleted,
    },
    conflicts,
    relationsToRepoint,
    scalarFieldsToMerge,
  };
}

/**
 * Execute the member merge. Must be run inside a transaction.
 */
export async function executeMemberMerge(
  tx: TxClient,
  primaryId: string,
  secondaryId: string,
  actorUserId: string,
): Promise<MergeResult> {
  const [primary, secondary] = await Promise.all([
    tx.user.findUnique({ where: { id: primaryId } }),
    tx.user.findUnique({ where: { id: secondaryId } }),
  ]);

  if (!primary || !secondary) {
    throw new Error('One or both members not found');
  }
  if (primary.deletedAt || secondary.deletedAt) {
    throw new Error('Cannot merge deleted members');
  }
  if (primary.organizationId !== secondary.organizationId) {
    throw new Error('Cannot merge members from different organizations');
  }

  await assertNoCourseraOwnershipForMemberMerge(
    tx,
    primaryId,
    secondaryId,
    primary.organizationId,
  );

  const conflicts = await checkMergeConflicts(tx, primaryId, secondaryId);
  if (conflicts.length > 0) {
    throw new Error(
      `Merge blocked by ${conflicts.length} conflict(s): ${conflicts.map((c) => c.message).join('; ')}`,
    );
  }

  const repointed: string[] = [];
  const mergedFields: string[] = [];

  // Helper: update a model's FK from secondary → primary
  async function repoint(model: string, field: string, extraWhere?: Record<string, unknown>) {
    try {
      const delegate = (tx as any)[model] as { updateMany: (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => Promise<{ count: number }> };
      const count = await delegate.updateMany({
        where: { [field]: secondaryId, ...(extraWhere ?? {}) },
        data: { [field]: primaryId },
      });
      if (count.count > 0) repointed.push(`${model}(${count.count})`);
    } catch {
      repointed.push(`${model}(skipped — constraint conflict)`);
    }
  }

  // 1. Repoint relations (leaf tables first)
  await repoint('applicationMessage', 'authorId');
  await repoint('message', 'authorId');
  await repoint('memberEvent', 'userId');
  await repoint('weeklyRecap', 'userId');
  await repoint('aIToolResult', 'userId');
  await repoint('goal', 'userId');
  await repoint('resourceProgress', 'userId');
  await repoint('pathwayStepProgress', 'userId');
  await repoint('trainingAccessRequest', 'userId');
  await repoint('workflowDiagnostic', 'actorUserId');
  await repoint('emailSendLog', 'userId');
  await repoint('auditLog', 'actorUserId');
  await repoint('invitation', 'inviterId');
  await repoint('invitation', 'acceptedById');
  await repoint('programChangeRequest', 'userId');
  await repoint('programChangeRequest', 'reviewedById');
  await repoint('partnerReferral', 'memberId');
  await repoint('partnerReferral', 'assignedPartnerUserId');
  await repoint('partnerOutreachLog', 'memberId');
  await repoint('partnerOutreachLog', 'createdByUserId');
  await repoint('portalWorkflowEvent', 'actorUserId');
  await repoint('jobPostingApplication', 'studentId');
  await repoint('aIJobMatch', 'studentId');
  await repoint('memberNextBestAction', 'memberId');
  await repoint('jobApplication', 'userId');
  await repoint('pointsTransaction', 'userId');
  await repoint('pointsTransaction', 'awardedBy');
  await repoint('memberSubgroup', 'userId');
  await repoint('memberSubgroup', 'assignedBy');
  await repoint('subgroupLeader', 'userId');
  await repoint('messageThread', 'memberId');
  await repoint('messageThread', 'counselorUserId');
  await repoint('messageThread', 'staffUserId');
  await repoint('application', 'userId');
  await repoint('learningProgress', 'userId');
  await repoint('userCertification', 'userId');
  await repoint('readinessChecklist', 'userId');
  await repoint('benefitRequest', 'userId');
  await repoint('counselorAssignment', 'memberId');
  await repoint('counselorNote', 'memberId');
  await repoint('counselorNote', 'authorId');
  await repoint('placementRecord', 'userId');
  await repoint('placedOutcome', 'userId');
  await repoint('mentorSession', 'memberId');
  await repoint('userRole', 'userId');
  await repoint('courseEnrollment', 'userId');
  await repoint('courseEnrollment', 'enrolledByAdminId');
  await repoint('preScreeningResponse', 'userId');
  await repoint('preScreeningDraft', 'userId');
  await repoint('applicationAiFeedback', 'userId');
  await repoint('atRiskAlert', 'userId');
  await repoint('placementSurvey', 'userId');
  await repoint('testimonial', 'memberId');
  await repoint('testimonial', 'reviewedBy');
  await repoint('courseraSkillsetProgress', 'userId');

  // Subgroup leader / creator (unique constraints on leaderId / createdBy are not unique per se,
  // but a Subgroup can only have one leader. Repoint is safe unless primary already leads the same
  // subgroup name, which would create a logical conflict but not a DB constraint violation.
  // We repoint and let the caller resolve semantics later.)
  await repoint('subgroup', 'leaderId');
  await repoint('subgroup', 'createdBy');

  // 2. CourseProgress — merge intelligently
  const secondaryCourseProgress = await tx.courseProgress.findMany({
    where: { userId: secondaryId },
    take: 500,
  });
  let mergedCourseProgress = 0;
  for (const row of secondaryCourseProgress) {
    const existing = await tx.courseProgress.findUnique({
      where: {
        userId_programSlug_courseSlug: {
          userId: primaryId,
          programSlug: row.programSlug,
          courseSlug: row.courseSlug,
        },
      },
    });
    if (!existing) {
      await tx.courseProgress.update({ where: { id: row.id }, data: { userId: primaryId } });
      mergedCourseProgress += 1;
      continue;
    }

    const rowWins =
      STATUS_RANK[row.status] > STATUS_RANK[existing.status] ||
      row.percentComplete > existing.percentComplete ||
      (row.completedAt != null && (existing.completedAt == null || row.completedAt > existing.completedAt));
    if (rowWins) {
      await tx.courseProgress.update({
        where: { id: existing.id },
        data: {
          status: row.status,
          percentComplete: Math.max(existing.percentComplete, row.percentComplete),
          scoreScaled: existing.scoreScaled ?? row.scoreScaled,
          scoreRaw: existing.scoreRaw ?? row.scoreRaw,
          startedAt: existing.startedAt ?? row.startedAt,
          completedAt: existing.completedAt && row.completedAt
            ? (existing.completedAt > row.completedAt ? existing.completedAt : row.completedAt)
            : existing.completedAt ?? row.completedAt,
        },
      });
    }
    await tx.courseProgress.delete({ where: { id: row.id } });
    mergedCourseProgress += 1;
  }
  if (mergedCourseProgress > 0) repointed.push(`courseProgress(${mergedCourseProgress})`);

  // 3. MemberProgramProgress — merge or repoint
  const secondaryRollups = await tx.memberProgramProgress.findMany({ take: 500, where: { userId: secondaryId } });
  let mergedRollups = 0;
  for (const row of secondaryRollups) {
    const existing = await tx.memberProgramProgress.findUnique({
      where: { userId_programSlug: { userId: primaryId, programSlug: row.programSlug } },
    });
    if (existing) {
      await tx.memberProgramProgress.update({
        where: { id: existing.id },
        data: {
          coursesCompleted: Math.max(existing.coursesCompleted, row.coursesCompleted),
          averagePercent: Math.max(existing.averagePercent, row.averagePercent),
        },
      });
      await tx.memberProgramProgress.delete({ where: { id: row.id } });
    } else {
      await tx.memberProgramProgress.update({ where: { id: row.id }, data: { userId: primaryId } });
    }
    mergedRollups += 1;
  }
  if (mergedRollups > 0) repointed.push(`memberProgramProgress(${mergedRollups})`);

  // 4. Unique-constrained relations — move only if primary lacks one
  const uniqueMoves: Array<{ model: string; field: string; name: string }> = [
    { model: 'profile', field: 'userId', name: 'profile' },
    { model: 'memberPoints', field: 'userId', name: 'memberPoints' },
    { model: 'counselor', field: 'userId', name: 'counselor' },
    { model: 'mentor', field: 'userId', name: 'mentor' },
    { model: 'partnerUser', field: 'userId', name: 'partnerUser' },
    { model: 'employer', field: 'userId', name: 'employer' },
  ];

  for (const { model, field, name } of uniqueMoves) {
    const primaryRow = await ((tx as any)[model] as { findUnique: (args: any) => Promise<any> }).findUnique({
      where: { [field]: primaryId },
    });
    const secondaryRow = await ((tx as any)[model] as { findUnique: (args: any) => Promise<any> }).findUnique({
      where: { [field]: secondaryId },
    });
    if (!primaryRow && secondaryRow) {
      await ((tx as any)[model] as { update: (args: any) => Promise<any> }).update({
        where: { [field]: secondaryId },
        data: { [field]: primaryId },
      });
      repointed.push(`${name}(1)`);
    }
  }

  // 5. Merge scalar fields (secondary fills gaps where primary is null)
  const scalarFieldDefs: Array<{ key: string; merge: (p: User, s: User) => unknown }> = [
    { key: 'phone', merge: (p, s) => p.phone ?? s.phone },
    { key: 'assessmentCompleted', merge: (p, s) => p.assessmentCompleted || s.assessmentCompleted },
    { key: 'assessmentCompletedAt', merge: (p, s) => p.assessmentCompletedAt ?? s.assessmentCompletedAt },
    { key: 'assessmentScore', merge: (p, s) => p.assessmentScore ?? s.assessmentScore },
    { key: 'assessmentScorePct', merge: (p, s) => p.assessmentScorePct ?? s.assessmentScorePct },
    { key: 'programInterest', merge: (p, s) => p.programInterest ?? s.programInterest },
    { key: 'enrolledProgram', merge: (p, s) => p.enrolledProgram ?? s.enrolledProgram },
    { key: 'enrolledAt', merge: (p, s) => p.enrolledAt ?? s.enrolledAt },
    { key: 'interviewEligible', merge: (p, s) => p.interviewEligible || s.interviewEligible },
    { key: 'interviewRequestedAt', merge: (p, s) => p.interviewRequestedAt ?? s.interviewRequestedAt },
    { key: 'interviewCompletedAt', merge: (p, s) => p.interviewCompletedAt ?? s.interviewCompletedAt },
    { key: 'onboardingCompletedAt', merge: (p, s) => p.onboardingCompletedAt ?? s.onboardingCompletedAt },
    { key: 'workspaceEmail', merge: (p, s) => p.workspaceEmail ?? s.workspaceEmail },
    { key: 'wioaQualificationJson', merge: (p, s) => p.wioaQualificationJson ?? s.wioaQualificationJson },
    { key: 'careerRecommendationJson', merge: (p, s) => p.careerRecommendationJson ?? s.careerRecommendationJson },
    { key: 'assessmentAnswers', merge: (p, s) => p.assessmentAnswers ?? s.assessmentAnswers },
    { key: 'coursesCompleted', merge: (p, s) => p.coursesCompleted ?? s.coursesCompleted },
    { key: 'courseraEnrollmentApproved', merge: (p, s) => p.courseraEnrollmentApproved || s.courseraEnrollmentApproved },
    { key: 'courseraEnrollmentApprovedAt', merge: (p, s) => p.courseraEnrollmentApprovedAt ?? s.courseraEnrollmentApprovedAt },
    { key: 'courseraEnrollmentApprovedById', merge: (p, s) => p.courseraEnrollmentApprovedById ?? s.courseraEnrollmentApprovedById },
    { key: 'wioaReviewStatus', merge: (p, s) => p.wioaReviewStatus ?? s.wioaReviewStatus },
    { key: 'wioaReviewedAt', merge: (p, s) => p.wioaReviewedAt ?? s.wioaReviewedAt },
    { key: 'wioaReviewedByUserId', merge: (p, s) => p.wioaReviewedByUserId ?? s.wioaReviewedByUserId },
    { key: 'wioaReviewNotes', merge: (p, s) => p.wioaReviewNotes ?? s.wioaReviewNotes },
    { key: 'pipelineBoardStage', merge: (p, s) => p.pipelineBoardStage ?? s.pipelineBoardStage },
    { key: 'programChangedAt', merge: (p, s) => p.programChangedAt ?? s.programChangedAt },
    { key: 'onboardingPortal', merge: (p, s) => p.onboardingPortal ?? s.onboardingPortal },
    { key: 'tourCompletedAt', merge: (p, s) => p.tourCompletedAt ?? s.tourCompletedAt },
    { key: 'workspaceEmailProvisioned', merge: (p, s) => p.workspaceEmailProvisioned || s.workspaceEmailProvisioned },
    { key: 'needsComputerSupportFollowUp', merge: (p, s) => p.needsComputerSupportFollowUp || s.needsComputerSupportFollowUp },
    { key: 'staleTrainingDetectedAt', merge: (p, s) => p.staleTrainingDetectedAt ?? s.staleTrainingDetectedAt },
    { key: 'lastCourseraAutoSyncAt', merge: (p, s) => p.lastCourseraAutoSyncAt ?? s.lastCourseraAutoSyncAt },
    { key: 'lastLoginAt', merge: (p, s) => p.lastLoginAt ?? s.lastLoginAt },
  ];

  const updateData: Record<string, unknown> = {};
  for (const { key, merge } of scalarFieldDefs) {
    const value = merge(primary, secondary);
    if (value !== null && value !== undefined && value !== primary[key as keyof User]) {
      updateData[key] = value;
      mergedFields.push(key);
    }
  }

  if (Object.keys(updateData).length > 0) {
    await tx.user.update({ where: { id: primaryId }, data: updateData });
  }

  // 6. Soft-delete secondary
  await tx.user.update({
    where: { id: secondaryId },
    data: { deletedAt: new Date(), email: `${secondary.email}.merged-${secondaryId}` },
  });

  // 7. Log merge
  await tx.workflowDiagnostic.create({
    data: {
      workflow: 'member_merge',
      status: 'ok',
      actorUserId,
      method: 'manual_merge',
      summary: `Merged member ${secondaryId} into ${primaryId}`,
      metadata: {
        primaryId,
        secondaryId,
        repointed,
        mergedFields,
        secondaryEmail: secondary.email,
        primaryEmail: primary.email,
      },
    },
  });

  return { primaryId, secondaryId, repointed, mergedFields };
}
