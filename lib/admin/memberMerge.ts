import { Prisma, type CourseProgressStatus, type User } from '@prisma/client';

import { getLevelForPoints } from '@/lib/member/pointsConfig';
import {
  MEMBER_MERGE_PREVIEW_ONLY,
  MEMBER_MERGE_REPOINT_PLAN,
  type CollisionResolution,
  type RepointSpec,
  type StrandedImpact,
  type StrengthColumn,
} from './memberMergeRepointPlan';

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
  /**
   * Rows the secondary holds, and what will actually happen to each group.
   * `count` is unchanged (every row on the secondary). `moving` and
   * `keptOnSecondary` split it: a row whose unique key the primary already
   * holds stays on the merged-away account instead of taking the merge down
   * with a duplicate-key abort, and the admin is told so before they confirm.
   */
  relationsToRepoint: {
    model: string;
    field: string;
    count: number;
    moving: number;
    keptOnSecondary: number;
    /**
     * Present only when rows will actually be left behind AND that is worth
     * naming. `weight: 'review'` means a human must decide which record is
     * real — placement, which the product exists to produce.
     */
    stranded?: StrandedImpact;
    /**
     * True for relations the preview counts but the merge never repoints,
     * because a merge whose secondary owns Coursera data is refused outright.
     * Rendering them like movable rows overstates what the merge will do.
     */
    blocked?: boolean;
  }[];
  /**
   * What the merge will do to the Points tile. The counter is recomputed from
   * the ledger, so a merge can move it a long way — and a level with it.
   * Without this the member's total changed with no disclosure anywhere the
   * admin could see before confirming.
   */
  points: {
    primaryTotal: number;
    mergedTotal: number;
    primaryLevel: string;
    mergedLevel: string;
    changes: boolean;
  };
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

/** Prisma delegate shape the repoint planner needs from a transaction client. */
type RepointDelegate = {
  count: (args: { where: Record<string, unknown> }) => Promise<number>;
  findMany: (args: { where: Record<string, unknown>; select: Record<string, true> }) => Promise<Array<Record<string, unknown>>>;
  updateMany: (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => Promise<{ count: number }>;
  update: (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => Promise<unknown>;
};

const KEEP_PRIMARY: CollisionResolution = { strategy: 'keepPrimary' };

export function resolutionFor(spec: RepointSpec): CollisionResolution {
  return spec.resolution ?? KEEP_PRIMARY;
}

/** Comparable value for one strength column. `null` means "has nothing here". */
function strengthOf(column: StrengthColumn, row: Record<string, unknown>): number | null {
  const value = row[column.column];
  switch (column.kind) {
    case 'boolean':
      return value === true ? 1 : 0;
    case 'number':
      return typeof value === 'number' ? value : null;
    case 'date': {
      if (value instanceof Date) return value.getTime();
      if (typeof value === 'string') {
        const parsed = Date.parse(value);
        return Number.isNaN(parsed) ? null : parsed;
      }
      return null;
    }
    case 'rank': {
      const index = column.order.indexOf(String(value));
      // A value outside the declared order never wins: an unrecognised status
      // is not evidence of strength.
      return index === -1 ? null : index;
    }
  }
}

/**
 * True when the secondary's row carries strictly more than the primary's, on
 * the first declared column that distinguishes them. Same shape as the
 * long-standing `courseProgress` rule: a row that is ahead wins, and ties or
 * unknowns leave the primary's row alone.
 */
export function secondaryIsStronger(
  rankBy: StrengthColumn[],
  primaryRow: Record<string, unknown>,
  secondaryRow: Record<string, unknown>,
): boolean {
  for (const column of rankBy) {
    const primaryValue = strengthOf(column, primaryRow);
    const secondaryValue = strengthOf(column, secondaryRow);
    if (primaryValue === secondaryValue) continue;
    if (secondaryValue === null) return false;
    if (primaryValue === null) return true;
    return secondaryValue > primaryValue;
  }
  return false;
}

function repointDelegate(tx: TxClient, model: string): RepointDelegate {
  const delegate = (tx as unknown as Record<string, RepointDelegate | undefined>)[model];
  if (!delegate) {
    // memberMergeRepointPlan.test.ts proves every planned model is a real
    // delegate, so this can only fire if the plan and the client disagree.
    throw new Error(`Member merge plan names "${model}", which is not a Prisma model.`);
  }
  return delegate;
}

/** "New Co, Engineer, 1 Jun 2026" — enough for an admin to tell two records apart. */
function describeRow(columns: string[], row: Record<string, unknown> | undefined): string {
  if (!row) return 'none';
  const parts = columns
    .map((column) => {
      const value = row[column];
      if (value === null || value === undefined || value === '') return null;
      if (value instanceof Date) {
        return value.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
      }
      return String(value);
    })
    .filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join(', ') : 'no details recorded';
}

/** Stable identity for a unique-key tuple, so two rows can be compared in JS. */
function uniqueKeyOf(columns: string[], row: Record<string, unknown>): string {
  return JSON.stringify(columns.map((column) => {
    const value = row[column];
    return value instanceof Date ? value.toISOString() : value;
  }));
}

export type RepointOutcome = {
  /** Rows moved onto the primary. */
  moved: number;
  /**
   * Rows left on the merged-away account because the primary already holds a
   * row with the same unique key. Nothing is deleted: the secondary is
   * soft-deleted, so the row stays recoverable.
   */
  keptOnSecondary: number;
  /**
   * Colliding rows where the secondary's was stronger and its values were
   * lifted onto the primary's row, so nothing the member had is revoked.
   */
  lifted: number;
};

/**
 * Work out which of the secondary's rows can move, then move exactly those.
 *
 * The naive `updateMany` this replaces let PostgreSQL discover duplicates,
 * which is fatal rather than recoverable: a duplicate key aborts the whole
 * transaction, and because the old caller swallowed the error every later
 * statement failed with `25P02` and the merge died naming an unrelated table.
 * The overlap is computed here instead, and it is usually empty — two reads
 * and the same single `updateMany` as before.
 */
export async function repointRelation(
  tx: TxClient,
  spec: RepointSpec,
  primaryId: string,
  secondaryId: string,
): Promise<RepointOutcome> {
  const delegate = repointDelegate(tx, spec.model);
  const moveAll = async (extraWhere: Record<string, unknown> = {}) => {
    const { count } = await delegate.updateMany({
      where: { [spec.field]: secondaryId, ...extraWhere },
      data: { [spec.field]: primaryId },
    });
    return count;
  };

  // No unique constraint touches this column, so no row can collide.
  if (!spec.uniqueWith) {
    return { moved: await moveAll(), keptOnSecondary: 0, lifted: 0 };
  }

  // Unique on the column alone: the secondary can hold at most one row, and it
  // collides exactly when the primary already holds one.
  if (spec.uniqueWith.length === 0) {
    const [secondaryCount, primaryCount] = await Promise.all([
      delegate.count({ where: { [spec.field]: secondaryId } }),
      delegate.count({ where: { [spec.field]: primaryId } }),
    ]);
    if (secondaryCount === 0) return { moved: 0, keptOnSecondary: 0, lifted: 0 };
    if (primaryCount > 0) {
      if (resolutionFor(spec).strategy === 'requireDecision') {
        throw new Error(
          `Member merge needs a human decision on ${spec.model}: both members hold a row and only one can survive. ` +
        `Resolve the duplicate on that record first, then merge.`,
        );
      }
      return { moved: 0, keptOnSecondary: secondaryCount, lifted: 0 };
    }
    return { moved: await moveAll(), keptOnSecondary: 0, lifted: 0 };
  }

  const columns = spec.uniqueWith;
  const resolution = resolutionFor(spec);
  // A preferStronger relation needs the comparable columns too, not just the key.
  const extraColumns =
    resolution.strategy === 'preferStronger'
      ? [...new Set([...resolution.rankBy.map((entry) => entry.column), ...resolution.copy])]
      : [];
  // `id` only where it is actually used, and only where it exists: the
  // preferStronger update addresses the primary's row by id, while `userRole`
  // has a compound primary key and no id column at all.
  const select = Object.fromEntries(
    [...columns, ...extraColumns, ...(resolution.strategy === 'preferStronger' ? ['id'] : [])].map(
      (column) => [column, true as const],
    ),
  );
  const secondaryRows = await delegate.findMany({ where: { [spec.field]: secondaryId }, select });
  if (secondaryRows.length === 0) return { moved: 0, keptOnSecondary: 0, lifted: 0 };

  const primaryRows = await delegate.findMany({ where: { [spec.field]: primaryId }, select });
  const primaryByKey = new Map(primaryRows.map((row) => [uniqueKeyOf(columns, row), row]));
  const colliding = secondaryRows.filter((row) => primaryByKey.has(uniqueKeyOf(columns, row)));
  if (colliding.length === 0) {
    return { moved: await moveAll(), keptOnSecondary: 0, lifted: 0 };
  }

  // Two distinct real-world records where only one can survive. Refusing is
  // the point: `checkMergeConflicts` raises this before an admin confirms, and
  // this throw is the backstop if the executor is ever called without it.
  if (resolution.strategy === 'requireDecision') {
    throw new Error(
      `Member merge needs a human decision on ${spec.model}: both members hold a row and only one can survive. ` +
        `Resolve the duplicate on that record first, then merge.`,
    );
  }

  let lifted = 0;
  if (resolution.strategy === 'preferStronger') {
    // Lift the better values onto the primary's row. Nothing is deleted and
    // nothing the member earned is revoked; the duplicate row simply stays on
    // the archived account as a record of where the values came from.
    for (const secondaryRow of colliding) {
      const primaryRow = primaryByKey.get(uniqueKeyOf(columns, secondaryRow));
      if (!primaryRow) continue;
      if (!secondaryIsStronger(resolution.rankBy, primaryRow, secondaryRow)) continue;
      await delegate.update({
        where: { id: primaryRow.id },
        data: Object.fromEntries(resolution.copy.map((column) => [column, secondaryRow[column]])),
      });
      lifted += 1;
    }
  }

  // The exclusion list is the size of the OVERLAP, not of either member's
  // rows, so it stays small even when both sides have thousands.
  const moved = await moveAll({
    NOT: colliding.map((row) => Object.fromEntries(columns.map((column) => [column, row[column]]))),
  });
  return { moved, keptOnSecondary: colliding.length, lifted };
}

/**
 * Read-only twin of {@link repointRelation}: what the merge would do, without
 * doing it. Sharing the plan (and the collision rule) is what keeps the
 * preview honest.
 */
export async function previewRepoint(
  tx: TxClient,
  spec: RepointSpec,
  primaryId: string,
  secondaryId: string,
): Promise<{ count: number; moving: number; keptOnSecondary: number }> {
  const delegate = repointDelegate(tx, spec.model);
  const count = await delegate.count({ where: { [spec.field]: secondaryId } });
  if (count === 0 || !spec.uniqueWith) {
    return { count, moving: count, keptOnSecondary: 0 };
  }
  if (spec.uniqueWith.length === 0) {
    const primaryCount = await delegate.count({ where: { [spec.field]: primaryId } });
    return primaryCount > 0
      ? { count, moving: 0, keptOnSecondary: count }
      : { count, moving: count, keptOnSecondary: 0 };
  }
  const columns = spec.uniqueWith;
  const select = Object.fromEntries(columns.map((column) => [column, true as const]));
  const [secondaryRows, primaryRows] = await Promise.all([
    delegate.findMany({ where: { [spec.field]: secondaryId }, select }),
    delegate.findMany({ where: { [spec.field]: primaryId }, select }),
  ]);
  const primaryKeys = new Set(primaryRows.map((row) => uniqueKeyOf(columns, row)));
  const keptOnSecondary = secondaryRows.filter((row) => primaryKeys.has(uniqueKeyOf(columns, row))).length;
  return { count, moving: count - keptOnSecondary, keptOnSecondary };
}

/**
 * Says what went wrong without pretending to know that it was a constraint.
 *
 * The blanket `catch` this replaces labelled every failure
 * "constraint conflict", including two Prisma validation errors for columns
 * that do not exist — which is precisely why those two went unnoticed. It also
 * continued after a duplicate-key error had already aborted the transaction,
 * turning a diagnosable fault into a `25P02` on an unrelated statement.
 */
function describeRepointFailure(spec: RepointSpec, error: unknown): string {
  const where = `${spec.model}.${spec.field}`;
  if (error instanceof Prisma.PrismaClientValidationError) {
    return `Member merge cannot repoint ${where}: the plan does not match the Prisma schema (validation error). This is a code fault, not a data conflict.`;
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      return `Member merge hit a duplicate key repointing ${where}, which the collision planner should have prevented. The transaction is aborted and the merge has rolled back.`;
    }
    if (error.code === 'P2034' || error.code === 'P2028') {
      return `Member merge lost its transaction repointing ${where} (Prisma ${error.code}). Nothing was committed; retry the merge.`;
    }
    return `Member merge failed repointing ${where} (Prisma ${error.code}).`;
  }
  // The message matters here: a 25P02 arrives as a plain error, and without it
  // the only clue that the transaction is already dead lives on `.cause`,
  // which the API route drops.
  const detail = error instanceof Error && error.message ? ` — ${error.message}` : '';
  return `Member merge failed repointing ${where}${detail}.`;
}

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

  // Relations where two distinct real-world records collide and only one can
  // survive. The merge is refused rather than letting a rule pick: a placement
  // is the outcome the product exists to produce, and a message thread is a
  // member waiting on a reply. Raised here so the admin sees it in the preview
  // before confirming, not as a failure afterwards.
  for (const spec of MEMBER_MERGE_REPOINT_PLAN) {
    const resolution = resolutionFor(spec);
    if (resolution.strategy !== 'requireDecision') continue;
    const outcome = await previewRepoint(tx, spec, primaryId, secondaryId);
    if (outcome.keptOnSecondary === 0) continue;

    // Name the two records, not just the table. A refusal an admin cannot act
    // on is a dead end; this one tells them exactly what to compare and what
    // to do before they try again.
    const select = Object.fromEntries(resolution.describeBy.map((column) => [column, true as const]));
    const delegate = repointDelegate(tx, spec.model);
    const [primaryRows, secondaryRows] = await Promise.all([
      delegate.findMany({ where: { [spec.field]: primaryId }, select }),
      delegate.findMany({ where: { [spec.field]: secondaryId }, select }),
    ]);
    const label = spec.stranded?.noun ?? `a ${spec.model} row`;
    const primaryDescription = describeRow(resolution.describeBy, primaryRows[0]);
    const secondaryDescription = describeRow(resolution.describeBy, secondaryRows[0]);
    conflicts.push({
      field: `${spec.model}.${spec.field}`,
      primaryValue: primaryDescription,
      secondaryValue: secondaryDescription,
      message:
        `Both members hold ${label} and only one can survive the merge — ` +
        `this member keeps "${primaryDescription}", the duplicate has "${secondaryDescription}". ` +
        `Decide which is real, then delete or correct the one you are not keeping ` +
        `before merging. The merge will go through once only one of them exists.`,
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
  const relationsToRepoint: MergePreview['relationsToRepoint'] = [];

  // Counted from the same plan the executor runs, so the preview can no
  // longer promise a move the executor does not make (it used to name
  // `invitation.invitedById` while the executor asked for a column that does
  // not exist). Each entry also reports the split: a row whose unique key the
  // primary already holds will stay on the merged-away account, which the
  // admin now sees BEFORE confirming instead of discovering as a failed merge.
  const previewOnlyKeys = new Set(MEMBER_MERGE_PREVIEW_ONLY.map((spec) => `${spec.model}.${spec.field}`));
  for (const spec of [...MEMBER_MERGE_REPOINT_PLAN, ...MEMBER_MERGE_PREVIEW_ONLY]) {
    const outcome = await previewRepoint(tx, spec, primaryId, secondaryId);
    if (outcome.count > 0) {
      const blocked = previewOnlyKeys.has(`${spec.model}.${spec.field}`);
      relationsToRepoint.push({
        model: spec.model,
        field: spec.field,
        ...outcome,
        // These are never repointed: the Coursera guard refuses the merge
        // first. Counting them as "moving" promised something untrue.
        ...(blocked ? { blocked: true, moving: 0, keptOnSecondary: 0 } : {}),
        // Only when something is actually left behind: a label on a relation
        // that moves cleanly would be a warning about nothing.
        ...(!blocked && outcome.keptOnSecondary > 0 && spec.stranded ? { stranded: spec.stranded } : {}),
      });
    }
  }

  // What the merge does to the Points tile, computed the same way the executor
  // will: the ledger the primary ends up with, minus the rows that collide.
  const pointsSpec = MEMBER_MERGE_REPOINT_PLAN.find(
    (spec) => spec.model === 'pointsTransaction' && spec.field === 'userId',
  );
  const [primaryPoints, primaryLedger, secondaryLedger] = await Promise.all([
    tx.memberPoints.findUnique({ where: { userId: primaryId }, select: { totalPoints: true } }),
    tx.pointsTransaction.aggregate({ where: { userId: primaryId }, _sum: { points: true } }),
    tx.pointsTransaction.findMany({
      where: { userId: secondaryId },
      select: { event: true, entityId: true, points: true },
    }),
  ]);
  const primaryKeySet = new Set(
    (
      await tx.pointsTransaction.findMany({
        where: { userId: primaryId },
        select: { event: true, entityId: true },
      })
    ).map((row) => `${row.event}\u0000${row.entityId}`),
  );
  const movingPoints = pointsSpec
    ? secondaryLedger
        .filter((row) => !primaryKeySet.has(`${row.event}\u0000${row.entityId}`))
        .reduce((sum, row) => sum + row.points, 0)
    : 0;
  const primaryTotal = primaryPoints?.totalPoints ?? 0;
  const mergedTotal = (primaryLedger._sum.points ?? 0) + movingPoints;
  const points = {
    primaryTotal,
    mergedTotal,
    primaryLevel: getLevelForPoints(primaryTotal).name,
    mergedLevel: getLevelForPoints(mergedTotal).name,
    changes: primaryTotal !== mergedTotal,
  };

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
    points,
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

  // 1. Repoint relations, leaf tables first, from the single plan the merge
  // preview also reads. A relation whose unique key the primary already holds
  // is left on the merged-away account rather than allowed to abort the
  // transaction; nothing is deleted, because the secondary is soft-deleted and
  // the row stays recoverable. Failures are no longer swallowed: a duplicate
  // key has already poisoned the transaction, and a validation error means the
  // plan disagrees with the schema, so both must stop the merge.
  for (const spec of MEMBER_MERGE_REPOINT_PLAN) {
    let outcome: RepointOutcome;
    try {
      outcome = await repointRelation(tx, spec, primaryId, secondaryId);
    } catch (error) {
      throw new Error(describeRepointFailure(spec, error), { cause: error });
    }
    const notes: string[] = [];
    if (outcome.keptOnSecondary > 0) notes.push(`${outcome.keptOnSecondary} kept on the merged account`);
    if (outcome.lifted > 0) notes.push(`${outcome.lifted} lifted onto the primary`);
    if (outcome.moved > 0 || notes.length > 0) {
      repointed.push(
        `${spec.model}.${spec.field}(${outcome.moved}${notes.length ? `, ${notes.join(', ')}` : ''})`,
      );
    }
  }

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

  // 4b. Recompute the points counter from the ledger.
  //
  // `member_points.total_points` is maintained by `awardPoints` as a running
  // `increment`, never recomputed, and step 4 only moves the row when the
  // primary has none. So a merge used to hand the primary every one of the
  // secondary's `points_transactions` rows while leaving the counter alone —
  // a permanent, silent undercount on the number `/dashboard` prints, with
  // the trend line beneath it drawn from the ledger that did move.
  //
  // Recomputing rather than adding is also the only version that is correct
  // if a merge is retried, and it repairs any drift the member already had.
  const ledger = await tx.pointsTransaction.aggregate({
    where: { userId: primaryId },
    _sum: { points: true },
  });
  const ledgerTotal = ledger._sum.points ?? 0;
  const existingPoints = await tx.memberPoints.findUnique({
    where: { userId: primaryId },
    select: { totalPoints: true },
  });
  // Only write when it actually changes. Without this every merge created a
  // memberPoints row for two members who have never earned anything and logged
  // a 0 -> 0 "change".
  if (existingPoints ? existingPoints.totalPoints !== ledgerTotal : ledgerTotal !== 0) {
    await tx.memberPoints.upsert({
      where: { userId: primaryId },
      create: { userId: primaryId, totalPoints: ledgerTotal, level: getLevelForPoints(ledgerTotal).name },
      update: { totalPoints: ledgerTotal, level: getLevelForPoints(ledgerTotal).name },
    });
    mergedFields.push(
      `memberPoints.totalPoints (${existingPoints?.totalPoints ?? 0} -> ${ledgerTotal}, recomputed from the ledger)`,
    );
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
