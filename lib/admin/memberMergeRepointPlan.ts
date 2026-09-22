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

/**
 * What it means for one row of this relation to be left on the merged-away
 * account, when the primary already holds a row with the same unique key.
 *
 * A flat "12 kept" tells an admin nothing they can act on. Naming the thing
 * that stays behind is what turns stranding from an accident into a decision,
 * which is the only reason stranding is an acceptable answer at all.
 */
export type StrandedImpact = {
  /** Singular noun phrase for one stranded row, e.g. 'an approved certification'. */
  noun: string;
  /** Plural form, e.g. 'approved certifications'. */
  plural: string;
  /**
   * `state` — the stranded row carries progress or a status the merged member
   * will not have, so the admin should know before confirming.
   *
   * `review` — a human has to decide which record is real; the merge must not
   * pick silently. Reserved for placement, the outcome the product exists to
   * produce and the thing funders count.
   */
  weight: 'state' | 'review';
};

/**
 * One comparable column used to decide which of two colliding rows is stronger.
 *
 * `rank` exists for status columns whose order is real but not derivable from
 * the schema. A column whose values cannot be enumerated safely is simply not
 * listed: the winner is then decided by the columns that CAN be compared, and
 * the status is carried along by `copy` so the surviving row stays internally
 * consistent rather than half-updated.
 */
export type StrengthColumn =
  | { column: string; kind: 'boolean' }
  | { column: string; kind: 'number' }
  /** Non-null beats null; later beats earlier. */
  | { column: string; kind: 'date' }
  /** Later in `order` wins. Values outside `order` never win. */
  | { column: string; kind: 'rank'; order: readonly string[] };

/**
 * What to do when the primary already holds a row with the same unique key.
 *
 * The default is `keepPrimary`, and it is only correct for rows that are
 * genuinely equivalent — the same award, the same membership, the same role.
 * For anything that carries progress or a granted status it silently revokes
 * what the member had, which is why every state-bearing relation declares one
 * of the other two.
 *
 * The precedent is `courseProgress`, which this merge has always resolved as
 * best-of-both (`memberMerge.ts`: rank by status, `Math.max` the percent, keep
 * the earliest start and latest completion) rather than keep-primary.
 */
export type CollisionResolution =
  /** The rows say the same thing; the duplicate stays on the archived account. */
  | { strategy: 'keepPrimary' }
  /**
   * Lift the stronger values onto the primary's row. Nothing is deleted and
   * nothing is revoked: the merged member ends up with the better of the two.
   */
  | { strategy: 'preferStronger'; rankBy: StrengthColumn[]; copy: string[] }
  /**
   * Two distinct real-world records, only one of which can survive. The merge
   * is refused with a named conflict so a human decides, rather than a rule
   * picking one and discarding the other's meaning.
   *
   * `describeBy` names the columns that let the conflict message identify the
   * two records concretely — "Old Co, Intern, Jun 2024" against "New Co,
   * Engineer, Jun 2026". A refusal that does not say WHICH records compete
   * leaves the admin with no way to act on it, which would make the refusal a
   * dead end rather than a decision point.
   */
  | { strategy: 'requireDecision'; describeBy: string[] };

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
  /**
   * Declared when a stranded row of this relation is worth telling the admin
   * about. Only meaningful alongside `uniqueWith`, since a row that cannot
   * collide cannot strand. Relations left undeclared are listed with their
   * reason in `STRANDING_NOT_SURFACED`.
   */
  stranded?: StrandedImpact;
  /**
   * How a collision on this relation is resolved. Omitted means `keepPrimary`,
   * which `memberMergeRepointPlan.test.ts` only permits for relations listed
   * in {@link STRANDING_NOT_SURFACED} — a state-bearing relation cannot reach
   * the default by omission.
   */
  resolution?: CollisionResolution;
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
  { model: 'resourceProgress', field: 'userId', uniqueWith: ['resourceId'], stranded: { noun: 'progress on a resource', plural: 'resources with progress', weight: 'state' }, resolution: { strategy: 'preferStronger', rankBy: [{ column: 'completedAt', kind: 'date' }, { column: 'viewCount', kind: 'number' }], copy: ['completionStatus', 'completedAt', 'viewCount', 'downloadedAt', 'savedAt'] } },
  { model: 'pathwayStepProgress', field: 'userId', uniqueWith: ['pathwayId', 'stepIndex'], stranded: { noun: 'a completed pathway step', plural: 'completed pathway steps', weight: 'state' }, resolution: { strategy: 'preferStronger', rankBy: [{ column: 'completedAt', kind: 'date' }], copy: ['status', 'completedAt'] } },
  { model: 'trainingAccessRequest', field: 'userId', uniqueWith: ['providerKey'], stranded: { noun: 'a training access request', plural: 'training access requests', weight: 'state' }, resolution: { strategy: 'preferStronger', rankBy: [{ column: 'status', kind: 'rank', order: ['REJECTED', 'PENDING', 'NEEDS_ATTENTION', 'APPROVED', 'ACTIVE', 'IN_PROGRESS', 'COMPLETED'] }, { column: 'activatedAt', kind: 'date' }, { column: 'approvedAt', kind: 'date' }], copy: ['status', 'approvedAt', 'activatedAt', 'rejectedAt'] } },
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
  { model: 'jobPostingApplication', field: 'studentId', uniqueWith: ['jobId'], stranded: { noun: 'an application to a job', plural: 'applications to jobs', weight: 'state' }, resolution: { strategy: 'keepPrimary' } },
  { model: 'aIJobMatch', field: 'studentId', uniqueWith: ['jobId'] },
  { model: 'memberNextBestAction', field: 'memberId' },
  { model: 'jobApplication', field: 'userId' },
  { model: 'pointsTransaction', field: 'userId', uniqueWith: ['event', 'entityId'] },
  { model: 'pointsTransaction', field: 'awardedBy' },
  { model: 'memberSubgroup', field: 'memberId', uniqueWith: ['subgroupId'] },
  { model: 'memberSubgroup', field: 'assignedBy' },
  { model: 'subgroupLeader', field: 'userId', uniqueWith: ['subgroupId'] },
  { model: 'messageThread', field: 'memberId', uniqueWith: [], stranded: { noun: 'a message thread', plural: 'message threads', weight: 'review' }, resolution: { strategy: 'requireDecision', describeBy: ['updatedAt'] } },
  { model: 'messageThread', field: 'counselorUserId' },
  { model: 'messageThread', field: 'staffUserId' },
  { model: 'application', field: 'userId' },
  { model: 'learningProgress', field: 'userId', uniqueWith: ['pathwayId'], stranded: { noun: 'progress on a learning pathway', plural: 'learning pathways with progress', weight: 'state' }, resolution: { strategy: 'preferStronger', rankBy: [{ column: 'completed', kind: 'boolean' }, { column: 'progress', kind: 'number' }], copy: ['completed', 'progress'] } },
  { model: 'userCertification', field: 'userId', uniqueWith: ['certName'], stranded: { noun: 'a certification', plural: 'certifications', weight: 'state' }, resolution: { strategy: 'preferStronger', rankBy: [{ column: 'status', kind: 'rank', order: ['rejected', 'pending', 'approved'] }, { column: 'earnedAt', kind: 'date' }], copy: ['status', 'earnedAt', 'proofUrl', 'submittedAt', 'reviewedAt', 'reviewedById'] } },
  { model: 'readinessChecklist', field: 'userId', uniqueWith: ['itemKey'], stranded: { noun: 'a completed readiness item', plural: 'completed readiness items', weight: 'state' }, resolution: { strategy: 'preferStronger', rankBy: [{ column: 'completed', kind: 'boolean' }, { column: 'completedAt', kind: 'date' }], copy: ['completed', 'completedAt', 'completedBy', 'notes', 'valueText'] } },
  { model: 'benefitRequest', field: 'userId', uniqueWith: ['benefit'], stranded: { noun: 'a benefit request', plural: 'benefit requests', weight: 'state' }, resolution: { strategy: 'preferStronger', rankBy: [{ column: 'status', kind: 'rank', order: ['DENIED', 'PENDING', 'APPROVED'] }], copy: ['status'] } },
  { model: 'counselorAssignment', field: 'memberId', uniqueWith: ['counselorId'], stranded: { noun: 'a counselor assignment', plural: 'counselor assignments', weight: 'state' }, resolution: { strategy: 'keepPrimary' } },
  { model: 'counselorNote', field: 'memberId' },
  { model: 'counselorNote', field: 'authorId' },
  { model: 'placementRecord', field: 'userId', uniqueWith: [], stranded: { noun: 'a placement record', plural: 'placement records', weight: 'review' }, resolution: { strategy: 'requireDecision', describeBy: ['employerName', 'jobTitle', 'startDate'] } },
  { model: 'placedOutcome', field: 'userId', uniqueWith: [], stranded: { noun: 'a recorded placement outcome', plural: 'recorded placement outcomes', weight: 'review' }, resolution: { strategy: 'requireDecision', describeBy: ['employerName', 'jobTitle', 'placedAt'] } },
  { model: 'mentorSession', field: 'memberId' },
  { model: 'userRole', field: 'userId', uniqueWith: ['roleId'] },
  { model: 'courseEnrollment', field: 'userId', uniqueWith: ['programSlug'], stranded: { noun: 'an enrollment in a program', plural: 'program enrollments', weight: 'state' }, resolution: { strategy: 'keepPrimary' } },
  { model: 'courseEnrollment', field: 'enrolledByAdminId' },
  { model: 'preScreeningResponse', field: 'userId', uniqueWith: [], stranded: { noun: 'a submitted pre-screening response', plural: 'submitted pre-screening responses', weight: 'review' }, resolution: { strategy: 'requireDecision', describeBy: ['primaryGoal', 'createdAt'] } },
  { model: 'preScreeningDraft', field: 'userId', uniqueWith: [] },
  { model: 'applicationAiFeedback', field: 'userId' },
  { model: 'atRiskAlert', field: 'userId' },
  { model: 'placementSurvey', field: 'userId', uniqueWith: ['wave'], stranded: { noun: 'a placement survey response', plural: 'placement survey responses', weight: 'state' }, resolution: { strategy: 'keepPrimary' } },
  { model: 'testimonial', field: 'memberId' },
  { model: 'testimonial', field: 'reviewedBy' },
  { model: 'courseraSkillsetProgress', field: 'userId', uniqueWith: ['skillsetId'], stranded: { noun: 'progress on a Coursera skillset', plural: 'Coursera skillsets with progress', weight: 'state' }, resolution: { strategy: 'preferStronger', rankBy: [{ column: 'progressPct', kind: 'number' }], copy: ['progressPct', 'lastSyncedAt'] } },
  { model: 'subgroup', field: 'leaderId' },
  { model: 'subgroup', field: 'createdBy' },];

/**
 * Collidable relations whose stranded rows are deliberately NOT surfaced, and
 * why. A collidable relation must appear either here or with a `stranded`
 * label; `memberMergeRepointPlan.test.ts` fails on one that is in neither, so
 * a relation added later cannot quietly default to silence.
 */
export const STRANDING_NOT_SURFACED: Record<string, string> = {
  'weeklyRecap.userId': 'a generated weekly snapshot; regenerated by the recap cron, nothing a member or admin acts on',
  'aIJobMatch.studentId': 'a recomputed match score, not a record of anything the member did',
  'pointsTransaction.userId': 'the same one-off award on both accounts; the counter is recomputed from the surviving ledger, so no points are lost',
  'partnerReferral.memberId': 'the same partner referring the same member twice; the surviving row says the same thing',
  'memberSubgroup.memberId': 'membership of a subgroup the primary is already in',
  'subgroupLeader.userId': 'leadership of a subgroup the primary already leads',
  'userRole.userId': 'a role the primary already holds',
  'preScreeningDraft.userId': 'an unsubmitted draft, superseded by the submitted response, which is surfaced',
};

/**
 * `User` foreign keys the merge deliberately does NOT move, and why.
 *
 * `memberMergeRepointPlan.test.ts` asserts that every `User` FK column in the
 * schema is either repointed, handled bespokely, or listed here — so a column
 * cannot be missed by omission the way these were. The plan being
 * schema-derived is the thesis of this module; proving only that the plan is a
 * subset of the schema would leave the direction that actually matters
 * unchecked.
 *
 * Two groups. The first records **who acted** — repointing those would rewrite
 * history, saying the surviving member approved something the duplicate
 * account approved. The second is member-owned data that arguably SHOULD move
 * and does not; each is a real gap, not a decision, and they are called out in
 * the PR rather than quietly accepted.
 */
export const USER_FK_NOT_REPOINTED: Record<string, string> = {
  // --- who acted: moving these would rewrite the audit trail ---
  'user.wioaReviewedByUserId': 'records which staff member reviewed a WIOA application',
  'auditEvent.actorUserId': 'the actor on an audit record; rewriting it would falsify the audit trail',
  'wioaReviewSnapshot.actorUserId': 'the staff actor on a review snapshot',
  'employer.approvedById': 'the staff member who approved an employer',
  'job.approvedById': 'the staff member who approved a job posting',
  'trainingBillingPacket.signedById': 'who signed the billing packet',
  'courseraCanonicalCourseMapping.createdById': 'who created a catalog mapping',
  'advisorSessionNote.authorId': 'who wrote the note; the member side is advisorSessionNote.memberId',
  'chapter.leaderId': 'who leads a chapter — a staff role, not member data',

  // --- member-owned and NOT moved today: gaps, listed so they are visible ---
  'referralCode.userId':
    'UNIQUE on userId. The merged member keeps the primary account code and the duplicate code stays on a soft-deleted user, ' +
    'and referralRewardEligibility requires deletedAt: null — so referrals through the stranded link silently stop paying out. ' +
    'The sharpest of these gaps; needs its own change.',
  'referralConversion.referrerUserId': 'a recorded conversion; moving it would re-attribute who referred whom',
  'referralConversion.refereeUserId': 'UNIQUE on refereeUserId; would collide and needs the same treatment as referralCode',
  'applyEligibilityScreening.userId': 'UNIQUE on userId; not moved today',
  'chapterMember.userId': 'chapter membership is not moved today',
  'memberLabDraft.userId': 'lab drafts are not moved today',
  'trainingStudyPlan.userId': 'study plans are not moved today',
  'trainingCourseWork.userId': 'coursework is not moved today',
  'trainingBillingPacket.memberId': 'billing packets are not moved today',
  'coachMemory.userId': 'AI coach memory is not moved today',
  'advisorSessionNote.memberId': 'advisor notes about the member are not moved today',
  'employerSubscription.userId': 'an employer-side subscription, not member data',
  'memberNudgeLog.userId': 'nudge history is not moved today',
  'milestoneCascade.userId': 'milestone cascades are not moved today',
  'memberFeedback.userId': 'submitted feedback is not moved today',
  'notification.userId': 'notifications are not moved today; the duplicate account keeps its unread items',
  'pushSubscription.userId': 'a push subscription is bound to a device and login, not worth moving',
  'savedJob.userId': 'saved jobs are not moved today',
  'userTourState.userId': 'product-tour state is per account and not worth moving',
};

/**
 * Handled by bespoke code elsewhere in `executeMemberMerge` rather than by the
 * generic repoint loop, so absent from the plan on purpose.
 */
export const USER_FK_HANDLED_ELSEWHERE: Record<string, string> = {
  'profile.userId': 'uniqueMoves — moved only when the primary has none',
  'memberPoints.userId': 'uniqueMoves, then the total is recomputed from the ledger',
  'counselor.userId': 'uniqueMoves',
  'mentor.userId': 'uniqueMoves',
  'partnerUser.userId': 'uniqueMoves',
  'employer.userId': 'uniqueMoves',
  'courseProgress.userId': 'bespoke best-of-both merge (status rank, max percent, earliest start, latest completion)',
  'memberProgramProgress.userId': 'bespoke rollup merge (max of each counter)',
};

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
