import { Prisma, type PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { auditLog } from '@/lib/audit';
import { buildDeletedEmail } from './deletedEmail';

/**
 * WAP-169: the one anonymiser behind every member deletion path.
 *
 * Callers today:
 *  - POST /api/member/delete-account  (`member_self_delete`)
 *  - POST /api/gdpr/delete            (`gdpr_account_delete`)
 *  - lib/retention/cleanup.ts         (`retention_purge_blocked`: a soft-deleted
 *    account past the 30-day window that a foreign key still holds)
 *
 * What it does, in one transaction:
 *  1. rewrites `users.email` to the recoverable deleted marker
 *     (lib/member/deletedEmail.ts) unless the row is already soft-deleted,
 *     scrubs the name, phone, workspace email and the assessment / career /
 *     WIOA self-report JSON, and sets `deleted_at` when it is not set yet so
 *     the retention purge picks the row up after DELETED_ACCOUNT_RETENTION_DAYS;
 *  2. nulls every identifying and special-category `profiles` column
 *     (address, date of birth, disability, household income, veteran status,
 *     ethnicity, barriers, work authorisation, school and guardian details,
 *     counsellor notes and file paths). Consent booleans and the role stay;
 *  3. writes one `audit_logs` row (`member_anonymized`) that carries the
 *     reason and field counts only — never the original email or name. The
 *     actor email snapshot is pinned to NULL so `auditLog` cannot copy the
 *     address into the three-year log.
 *
 * `users` cascades to the member tables, `wioa_review_snapshots` and
 * `audit_logs` (actor SET NULL) survive the later hard purge, and
 * `audit_events.actor_user_id` is SET NULL since migration
 * 20260920141800_audit_events_actor_set_null.
 */
export type AnonymizeMemberReason =
  | 'member_self_delete'
  | 'gdpr_account_delete'
  | 'retention_purge_blocked';

export type AnonymizeMemberOptions = {
  reason: AnonymizeMemberReason;
  /**
   * Who performed the deletion. Omit for the member themself; pass `null`
   * for an unattended job (the retention cron). A staff id is snapshotted by
   * `auditLog` as usual.
   */
  actorUserId?: string | null;
  now?: Date;
};

export type AnonymizeMemberResult = {
  userId: string;
  deletedAt: Date;
  /** True when the row was already soft-deleted; the email marker is then kept. */
  alreadyDeleted: boolean;
  profileRowsCleared: number;
};

export const ANONYMIZED_FULL_NAME = 'Deleted User';
export const MEMBER_ANONYMIZED_AUDIT_ACTION = 'member_anonymized';

/** `profiles` columns cleared for every reason. Kept as data so the spec can assert coverage. */
export const ANONYMIZED_PROFILE_DATA = {
  address: null,
  city: null,
  state: null,
  zip: null,
  dob: null,
  profilePhone: null,
  profileAddress: null,
  profileLinkedin: null,
  profileBio: null,
  counselorNotes: null,
  resumeOriginalPath: null,
  resumeEnhancedPath: null,
  profilePhotoPath: null,
  veteranStatus: null,
  employmentStatus: null,
  employmentStatusAtEnroll: null,
  educationLevel: null,
  householdIncome: null,
  financialAidInterest: null,
  usCitizen: null,
  authorizedToWork: null,
  hasDisability: null,
  ethnicity: null,
  hasEmploymentBarrier: false,
  barrierTypes: [],
  parentGuardianName: null,
  parentGuardianEmail: null,
  parentGuardianPhone: null,
  schoolName: null,
  schoolDistrict: null,
  gradeLevel: null,
  studentId: null,
} satisfies Prisma.ProfileUpdateManyMutationInput;

export const ANONYMIZED_PROFILE_FIELDS = Object.keys(ANONYMIZED_PROFILE_DATA) as ReadonlyArray<
  keyof typeof ANONYMIZED_PROFILE_DATA
>;

type AnonymizeDb = Pick<PrismaClient, '$transaction'>;

function scrambledEmail(userId: string, email: string, now: Date): string {
  return (
    buildDeletedEmail(userId, now.getTime(), email) ??
    // Marker without the original when the address would overflow the column.
    `deleted_${userId}_${now.getTime()}@deleted.invalid`
  );
}

/**
 * Returns `null` when no `users` row exists for the id (nothing to anonymise).
 * Throws when any write fails, so callers never report a deletion that did
 * not happen.
 */
export async function anonymizeMember(
  userId: string,
  options: AnonymizeMemberOptions,
  db: AnonymizeDb = prisma,
): Promise<AnonymizeMemberResult | null> {
  const now = options.now ?? new Date();
  const actorUserId = options.actorUserId === undefined ? userId : options.actorUserId;
  const selfActor = actorUserId === userId;

  return db.$transaction(async (tx) => {
    const existing = await tx.user.findUnique({
      where: { id: userId },
      select: { email: true, deletedAt: true },
    });
    if (!existing) return null;

    const alreadyDeleted = existing.deletedAt !== null;
    const deletedAt = existing.deletedAt ?? now;

    await tx.user.update({
      where: { id: userId },
      data: {
        // A row that is already soft-deleted keeps its marker so the original
        // address stays parseable for /admin/users/deleted during the window.
        email: alreadyDeleted ? existing.email : scrambledEmail(userId, existing.email, now),
        fullName: ANONYMIZED_FULL_NAME,
        phone: null,
        workspaceEmail: null,
        assessmentAnswers: Prisma.JsonNull,
        careerRecommendationJson: Prisma.JsonNull,
        wioaQualificationJson: Prisma.JsonNull,
        wioaReviewNotes: null,
        deletedAt,
      },
    });

    const profile = await tx.profile.updateMany({
      where: { userId },
      data: ANONYMIZED_PROFILE_DATA,
    });

    await auditLog(
      {
        actorUserId,
        action: MEMBER_ANONYMIZED_AUDIT_ACTION,
        targetType: 'User',
        targetId: userId,
        metadata: {
          reason: options.reason,
          alreadyDeleted,
          profileRowsCleared: profile.count,
          profileFieldsCleared: ANONYMIZED_PROFILE_FIELDS.length,
        },
        // Never let the actor snapshot copy the address into the 3-year log.
        actorEmailSnapshot: selfActor || actorUserId === null ? null : undefined,
        actorRoleSnapshot: selfActor ? 'member' : actorUserId === null ? 'system' : undefined,
      },
      tx,
    );

    return { userId, deletedAt, alreadyDeleted, profileRowsCleared: profile.count };
  });
}
