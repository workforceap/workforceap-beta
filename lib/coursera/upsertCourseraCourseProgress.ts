import { Prisma } from '@prisma/client';

import { adoptLegacyRawCourseProgressRows } from '@/lib/coursera/legacyRawProgressAdoption.server';
import { ensureCourseProgressTenantKeys } from '@/lib/coursera/rawProgressTenantKeys';
import { EXACT_EMAIL_CANDIDATE_LIMIT, pickExactEmailMatch } from '@/lib/db/exactEmailMatch';
import { prisma } from '@/lib/db/prisma';

export type CourseraCourseProgressUpsertInput = {
  externalEmail: string;
  externalName?: string | null;
  courseraCourseId: string;
  courseraCourseSlug?: string | null;
  courseName: string;
  collectionName?: string | null;
  collectionId?: string | null;
  programSlug: string;
  programName?: string | null;
  enrollmentAt?: number | null;
  lastActivityAt?: number | null;
  updatedAt?: number | null;
  overallProgress?: number | null;
  isCompleted: boolean;
  userId: string | null;
  organizationId: string;
  source?: string;
};

function dateFromEpoch(value: number | null | undefined): Date | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? new Date(value)
    : null;
}

function clampPercent(value: number | null | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

/**
 * Persist the source-of-truth B4B row whether or not the learner has a WAP
 * account or the Coursera course is mapped into the canonical curriculum.
 *
 * Identity promotion is deliberately one-way: an unmatched row may become
 * linked once an identity mapping exists, but a later unmatched sync cannot
 * clear that link. A conflicting linked user is rejected instead of silently
 * moving progress between people or tenants.
 */
export async function upsertCourseraCourseProgress(
  input: CourseraCourseProgressUpsertInput,
): Promise<void> {
  const externalEmail = input.externalEmail.trim().toLowerCase();
  const courseraCourseId = input.courseraCourseId.trim();
  const organizationId = input.organizationId.trim();
  if (!externalEmail) throw new Error('Coursera progress requires an external email');
  if (!courseraCourseId) throw new Error('Coursera progress requires a course id');
  if (!organizationId) throw new Error('Coursera progress requires an organization id');

  await ensureCourseProgressTenantKeys();

  await prisma.$transaction(async (tx) => {
    // The still-serving schema also has a global lower(email)+course unique
    // index. The adoption helper serializes that global identity, locks every
    // incoming/existing linked user FOR SHARE through commit, and moves only a
    // safely-owned legacy NULL-org row into this authenticated tenant before
    // the tenant-local upsert runs.
    await adoptLegacyRawCourseProgressRows(tx, {
      organizationId,
      identities: [
        {
          externalEmail,
          courseraCourseId,
          userId: input.userId,
        },
      ],
    });

    // `mode: 'insensitive'` compiles to ILIKE, so `_`/`%` in a Coursera
    // learner email are wildcards: `m_johnson@x.org` also matches
    // `mrjohnson@x.org`. The B4B cron writes unmatched rows with this
    // helper, and an ILIKE hit would merge that learner's progress onto
    // the neighbor (or permanently block the underscore address once it
    // has a WAP user). Collect candidates, then keep only a genuine
    // case-insensitive equality. See lib/db/exactEmailMatch.ts.
    const existingCandidates = await tx.courseraCourseProgress.findMany({
      where: {
        organizationId,
        externalEmail: { equals: externalEmail, mode: 'insensitive' },
        courseraCourseId,
      },
      select: {
        externalEmail: true,
        userId: true,
        organizationId: true,
        overallProgress: true,
        isCompleted: true,
        enrollmentTime: true,
        lastActivityTime: true,
        completionTime: true,
      },
      take: EXACT_EMAIL_CANDIDATE_LIMIT,
    });
    const existing = pickExactEmailMatch(
      existingCandidates.map((row) => ({ ...row, email: row.externalEmail })),
      externalEmail,
    );

    if (existing?.userId && input.userId && existing.userId !== input.userId) {
      throw new Error('Coursera progress identity conflict for existing linked row');
    }

    const effectiveUserId = existing?.userId ?? input.userId;
    const incomingActivity = dateFromEpoch(input.lastActivityAt);
    const incomingEnrollment = dateFromEpoch(input.enrollmentAt);
    const incomingCompletion = input.isCompleted
      ? dateFromEpoch(input.updatedAt) ?? incomingActivity
      : null;
    const lastActivityTime =
      Math.max(existing?.lastActivityTime?.getTime() ?? 0, incomingActivity?.getTime() ?? 0) > 0
        ? new Date(
            Math.max(
              existing?.lastActivityTime?.getTime() ?? 0,
              incomingActivity?.getTime() ?? 0,
            ),
          )
        : null;
    const programSlug = input.programSlug.trim() || 'coursera-unmapped';
    const courseName = input.courseName.trim() || courseraCourseId;
    const persistedEmail = existing?.externalEmail ?? externalEmail;
    const overallProgress = clampPercent(input.overallProgress);
    const source = input.source?.trim() || 'b4b_sync';

    // The database conflict target includes organization_id. The guarded
    // update makes a concurrent attempt to attach the same tenant-local row
    // to another user fail without modifying either identity.
    const written = await tx.$queryRaw<Array<{ userId: string | null }>>(Prisma.sql`
      INSERT INTO coursera_course_progress (
        id,
        user_id,
        organization_id,
        external_email,
        external_name,
        coursera_course_id,
        coursera_course_slug,
        course_name,
        collection_name,
        collection_id,
        program_slug,
        program_name,
        enrollment_time,
        last_activity_time,
        completion_time,
        overall_progress,
        learning_hours,
        is_completed,
        source,
        last_synced_at
      ) SELECT
        gen_random_uuid(),
        ${effectiveUserId},
        ${organizationId},
        ${persistedEmail},
        ${input.externalName?.trim() || null},
        ${courseraCourseId},
        ${input.courseraCourseSlug?.trim() || null},
        ${courseName},
        ${input.collectionName?.trim() || null},
        ${input.collectionId?.trim() || null},
        ${programSlug},
        ${input.programName?.trim() || null},
        ${incomingEnrollment},
        ${lastActivityTime},
        ${incomingCompletion},
        ${overallProgress},
        0,
        ${input.isCompleted},
        ${source},
        now()
      WHERE ${effectiveUserId}::text IS NULL
        OR EXISTS (
          SELECT 1
          FROM users incoming_insert_user
          WHERE incoming_insert_user.id = ${effectiveUserId}::text
            AND incoming_insert_user.organization_id = ${organizationId}::text
            AND incoming_insert_user.deleted_at IS NULL
        )
      ON CONFLICT (
        organization_id,
        LOWER(external_email),
        coursera_course_id
      ) WHERE organization_id IS NOT NULL DO UPDATE SET
        user_id = COALESCE(coursera_course_progress.user_id, EXCLUDED.user_id),
        external_name = COALESCE(
          EXCLUDED.external_name,
          coursera_course_progress.external_name
        ),
        coursera_course_slug = COALESCE(
          EXCLUDED.coursera_course_slug,
          coursera_course_progress.coursera_course_slug
        ),
        course_name = EXCLUDED.course_name,
        collection_name = COALESCE(
          EXCLUDED.collection_name,
          coursera_course_progress.collection_name
        ),
        collection_id = COALESCE(
          EXCLUDED.collection_id,
          coursera_course_progress.collection_id
        ),
        program_slug = EXCLUDED.program_slug,
        program_name = COALESCE(
          EXCLUDED.program_name,
          coursera_course_progress.program_name
        ),
        enrollment_time = COALESCE(
          coursera_course_progress.enrollment_time,
          EXCLUDED.enrollment_time
        ),
        last_activity_time = CASE
          WHEN coursera_course_progress.last_activity_time IS NULL
            THEN EXCLUDED.last_activity_time
          WHEN EXCLUDED.last_activity_time IS NULL
            THEN coursera_course_progress.last_activity_time
          ELSE GREATEST(
            coursera_course_progress.last_activity_time,
            EXCLUDED.last_activity_time
          )
        END,
        completion_time = COALESCE(
          coursera_course_progress.completion_time,
          EXCLUDED.completion_time
        ),
        overall_progress = LEAST(
          100,
          GREATEST(
            0,
            coursera_course_progress.overall_progress,
            EXCLUDED.overall_progress
          )
        ),
        is_completed = (
          coursera_course_progress.is_completed OR EXCLUDED.is_completed
        ),
        source = EXCLUDED.source,
        last_synced_at = now()
      WHERE (
          coursera_course_progress.user_id IS NULL
          OR EXCLUDED.user_id IS NULL
          OR coursera_course_progress.user_id = EXCLUDED.user_id
        )
        AND (
          coursera_course_progress.user_id IS NULL
          OR EXISTS (
            SELECT 1
            FROM users linked_user
            WHERE linked_user.id = coursera_course_progress.user_id
              AND linked_user.organization_id = coursera_course_progress.organization_id
              AND linked_user.deleted_at IS NULL
          )
        )
        AND (
          EXCLUDED.user_id IS NULL
          OR EXISTS (
            SELECT 1
            FROM users incoming_user
            WHERE incoming_user.id = EXCLUDED.user_id
              AND incoming_user.organization_id = EXCLUDED.organization_id
              AND incoming_user.deleted_at IS NULL
          )
        )
      RETURNING user_id AS "userId"
    `);

    if (written.length !== 1) {
      throw new Error('Coursera progress identity conflict for concurrent linked row');
    }
  });
}
