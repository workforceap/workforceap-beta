/**
 * Every foreign key a member merge repoints, in one list.
 *
 * ## Why this exists
 *
 * The executor and the merge preview each carried their own hand-written copy
 * of this list, and they had drifted: the preview promised to move
 * `invitation.invitedById` and `memberSubgroup.memberId` while the executor
 * asked for `invitation.inviterId` and `memberSubgroup.userId`, neither of
 * which is a column. Those two repoints had therefore never moved a row, and
 * the blanket `catch` in the executor reported the resulting Prisma
 * validation error as "constraint conflict", which is how it stayed hidden.
 * One list, two readers, and `memberMergeRepointPlan.test.ts` re-derives every
 * claim below from the Prisma schema rather than trusting it.
 *
 * ## `uniqueWith`
 *
 * Present exactly when `field` participates in a unique constraint (or a
 * compound primary key), and it names the *other* columns of that constraint.
 * `uniqueWith: []` means the field is unique on its own, so the primary having
 * any row at all collides.
 *
 * A collision is not an error and must not be left to the database. Postgres
 * aborts the whole transaction on a duplicate key, so a single `updateMany`
 * that trips one takes the entire merge down with an error naming whatever
 * statement happened to run next. The executor pre-computes the overlap and
 * moves only the rows that do not collide; see `repointRelation`.
 */

/** One foreign key to move from the secondary member to the primary. */
export type RepointSpec = {
  /** Prisma client delegate name, e.g. `pointsTransaction`. */
  model: string;
  /** The FK column holding the member id. */
  field: string;
  /**
   * The other columns of the unique constraint `field` belongs to. Omitted
   * when the field is in no unique constraint, so no row can ever collide.
   */
  uniqueWith?: string[];
};

/**
 * Ordered leaf-first, matching the order the executor has always used. The
 * order is not load-bearing for correctness (every move is inside one
 * transaction) but keeping it stable keeps the audit trail comparable.
 */
export const MEMBER_MERGE_REPOINT_PLAN: RepointSpec[] = [
  { model: 'applicationMessage', field: 'authorId' },
  { model: 'message', field: 'authorId' },
  { model: 'memberEvent', field: 'userId' },
  { model: 'weeklyRecap', field: 'userId', uniqueWith: ['weekStartDate'] },
  { model: 'aIToolResult', field: 'userId' },
  { model: 'goal', field: 'userId' },
  { model: 'resourceProgress', field: 'userId', uniqueWith: ['resourceId'] },
  { model: 'pathwayStepProgress', field: 'userId', uniqueWith: ['pathwayId', 'stepIndex'] },
  { model: 'trainingAccessRequest', field: 'userId', uniqueWith: ['providerKey'] },
  { model: 'workflowDiagnostic', field: 'actorUserId' },
  { model: 'emailSendLog', field: 'userId' },
  { model: 'auditLog', field: 'actorUserId' },
  { model: 'invitation', field: 'invitedById' },
  { model: 'invitation', field: 'acceptedById' },
  { model: 'programChangeRequest', field: 'userId' },
  { model: 'programChangeRequest', field: 'reviewedById' },
  { model: 'partnerReferral', field: 'memberId', uniqueWith: ['partnerId'] },
  { model: 'partnerReferral', field: 'assignedPartnerUserId' },
  { model: 'partnerOutreachLog', field: 'memberId' },
  { model: 'partnerOutreachLog', field: 'createdByUserId' },
  { model: 'portalWorkflowEvent', field: 'actorUserId' },
  { model: 'jobPostingApplication', field: 'studentId', uniqueWith: ['jobId'] },
  { model: 'aIJobMatch', field: 'studentId', uniqueWith: ['jobId'] },
  { model: 'memberNextBestAction', field: 'memberId' },
  { model: 'jobApplication', field: 'userId' },
  { model: 'pointsTransaction', field: 'userId', uniqueWith: ['event', 'entityId'] },
  { model: 'pointsTransaction', field: 'awardedBy' },
  { model: 'memberSubgroup', field: 'memberId', uniqueWith: ['subgroupId'] },
  { model: 'memberSubgroup', field: 'assignedBy' },
  { model: 'subgroupLeader', field: 'userId', uniqueWith: ['subgroupId'] },
  { model: 'messageThread', field: 'memberId', uniqueWith: [] },
  { model: 'messageThread', field: 'counselorUserId' },
  { model: 'messageThread', field: 'staffUserId' },
  { model: 'application', field: 'userId' },
  { model: 'learningProgress', field: 'userId', uniqueWith: ['pathwayId'] },
  { model: 'userCertification', field: 'userId', uniqueWith: ['certName'] },
  { model: 'readinessChecklist', field: 'userId', uniqueWith: ['itemKey'] },
  { model: 'benefitRequest', field: 'userId', uniqueWith: ['benefit'] },
  { model: 'counselorAssignment', field: 'memberId', uniqueWith: ['counselorId'] },
  { model: 'counselorNote', field: 'memberId' },
  { model: 'counselorNote', field: 'authorId' },
  { model: 'placementRecord', field: 'userId', uniqueWith: [] },
  { model: 'placedOutcome', field: 'userId', uniqueWith: [] },
  { model: 'mentorSession', field: 'memberId' },
  { model: 'userRole', field: 'userId', uniqueWith: ['roleId'] },
  { model: 'courseEnrollment', field: 'userId', uniqueWith: ['programSlug'] },
  { model: 'courseEnrollment', field: 'enrolledByAdminId' },
  { model: 'preScreeningResponse', field: 'userId', uniqueWith: [] },
  { model: 'preScreeningDraft', field: 'userId', uniqueWith: [] },
  { model: 'applicationAiFeedback', field: 'userId' },
  { model: 'atRiskAlert', field: 'userId' },
  { model: 'placementSurvey', field: 'userId', uniqueWith: ['wave'] },
  { model: 'testimonial', field: 'memberId' },
  { model: 'testimonial', field: 'reviewedBy' },
  { model: 'courseraSkillsetProgress', field: 'userId', uniqueWith: ['skillsetId'] },
  { model: 'subgroup', field: 'leaderId' },
  { model: 'subgroup', field: 'createdBy' },];

/**
 * Counted in the preview but never repointed: a merge whose secondary owns any
 * Coursera row is refused outright by `assertNoCourseraOwnershipForMemberMerge`
 * before any write happens. The preview counts them so an admin can see *why*
 * the merge is about to be blocked, rather than being told the merge is clean
 * and then hitting the guard.
 */
export const MEMBER_MERGE_PREVIEW_ONLY: RepointSpec[] = [
  { model: 'courseraCourseProgress', field: 'userId' },
  { model: 'courseraBadgeProgress', field: 'userId' },
  { model: 'courseraIdentityMapping', field: 'userId' },
];
