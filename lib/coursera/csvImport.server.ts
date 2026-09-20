import 'server-only';

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { ensureCourseraMappingTables } from '@/lib/xapi/mappings';
import { resolveUserIdByCourseraEmail } from '@/lib/coursera/resolveUserIdByEmail';
import { loadCanonicalMappingsForCourseraIds } from '@/lib/coursera/canonicalMapping';
import { DISCOVERED_COURSERA_PROGRAMS } from '@/lib/content/courseraDiscoveredCatalog';
import { getProgramBySlug } from '@/lib/content/programs';
import { upsertMergedCourseProgress } from '@/lib/coursera/upsertMergedCourseProgress';
import { refreshMemberProgramProgressRollup } from '@/lib/member/courseProgress';
import { isLearningPathProgressRow, planCourseraProgressPromotion } from '@/lib/coursera/progressPromotion';
import {
  ensureBadgeProgressTenantKeys,
  ensureCourseProgressTenantKeys,
} from '@/lib/coursera/rawProgressTenantKeys';
import {
  adoptLegacyRawBadgeProgressRows,
  adoptLegacyRawCourseProgressRows,
  lockLegacyRawCourseraEmails,
} from '@/lib/coursera/legacyRawProgressAdoption.server';

import {
  clampCourseraPercent,
  type BadgeIngestResult,
  type IngestResult,
  type ParsedBadgeRow,
  type ParsedCourseActivityRow,
} from './csvImport';

async function resolveUserIdByEmail(
  email: string,
  organizationId: string,
): Promise<string | null> {
  return resolveUserIdByCourseraEmail(email, { organizationId });
}

const CSV_UPSERT_CHUNK = 100;

function chunkCsvRows<T>(arr: T[], size = CSV_UPSERT_CHUNK): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

async function assertRawWriterUsersBelongToOrganization(
  db: Pick<Prisma.TransactionClient, '$queryRaw' | '$executeRaw'>,
  organizationId: string,
  userIds: Array<string | null>,
): Promise<void> {
  const normalizedOrganizationId = organizationId.trim();
  if (!normalizedOrganizationId) {
    throw new Error('Coursera raw progress requires an organization id');
  }

  const expectedUserIds = [...new Set(userIds.filter((id): id is string => Boolean(id)))].sort();
  if (expectedUserIds.length === 0) return;

  const matchedUsers = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT candidate_user.id
    FROM users AS candidate_user
    WHERE candidate_user.id IN (${Prisma.join(expectedUserIds)})
      AND candidate_user.organization_id = ${normalizedOrganizationId}
      AND candidate_user.deleted_at IS NULL
    ORDER BY candidate_user.id
    FOR SHARE
  `);
  if (matchedUsers.length !== expectedUserIds.length) {
    throw new Error('Coursera raw progress user does not belong to the importing organization');
  }
}

async function bulkUpsertCourseProgressChunk(
  items: Array<{
    row: ParsedCourseActivityRow;
    lowerEmail: string;
    userId: string | null;
    source: string;
  }>,
  organizationId: string,
): Promise<{ inserted: number; updated: number }> {
  if (items.length === 0) return { inserted: 0, updated: 0 };
  const normalizedOrganizationId = organizationId.trim();
  if (!normalizedOrganizationId) {
    throw new Error('Coursera raw progress requires an organization id');
  }

  const tuples = items.map(({ row, lowerEmail, userId, source }) =>
    Prisma.sql`(
      gen_random_uuid(),
      ${userId}::text,
      ${normalizedOrganizationId}::text,
      ${lowerEmail}::text,
      ${row.name || null}::text,
      ${row.courseId}::text,
      ${row.courseSlug}::text,
      ${row.course}::text,
      ${row.university}::text,
      ${row.collectionName}::text,
      ${row.collectionId}::text,
      ${row.programSlug}::text,
      ${row.programName}::text,
      ${row.enrollmentTime}::timestamptz,
      ${row.classStartTime}::timestamptz,
      ${row.classEndTime}::timestamptz,
      ${row.lastActivityTime}::timestamptz,
      ${row.completionTime}::timestamptz,
      ${clampCourseraPercent(row.overallProgress)}::numeric,
      ${row.learningHours}::numeric,
      ${row.completed}::boolean,
      ${row.removedFromProgram}::boolean,
      ${row.courseGrade}::text,
      ${row.courseCertificateUrl}::text,
      ${row.contractName}::text,
      ${row.isEnterpriseContractActive}::boolean,
      ${source}::text,
      now()
    )`,
  );

  return prisma.$transaction(async (tx) => {
    await adoptLegacyRawCourseProgressRows(tx, {
      organizationId: normalizedOrganizationId,
      identities: items.map(({ row, lowerEmail, userId }) => ({
        externalEmail: lowerEmail,
        courseraCourseId: row.courseId,
        userId,
      })),
    });
    await assertRawWriterUsersBelongToOrganization(
      tx,
      normalizedOrganizationId,
      items.map((item) => item.userId),
    );

    const rows = await tx.$queryRaw<Array<{ inserted: boolean }>>`
    INSERT INTO coursera_course_progress (
      id,
      user_id,
      organization_id,
      external_email,
      external_name,
      coursera_course_id,
      coursera_course_slug,
      course_name,
      university,
      collection_name,
      collection_id,
      program_slug,
      program_name,
      enrollment_time,
      class_start_time,
      class_end_time,
      last_activity_time,
      completion_time,
      overall_progress,
      learning_hours,
      is_completed,
      is_removed_from_program,
      course_grade,
      certificate_url,
      contract_name,
      contract_active,
      source,
      last_synced_at
    )
    SELECT
      incoming.id,
      incoming.user_id,
      incoming.organization_id,
      incoming.external_email,
      incoming.external_name,
      incoming.coursera_course_id,
      incoming.coursera_course_slug,
      incoming.course_name,
      incoming.university,
      incoming.collection_name,
      incoming.collection_id,
      incoming.program_slug,
      incoming.program_name,
      incoming.enrollment_time,
      incoming.class_start_time,
      incoming.class_end_time,
      incoming.last_activity_time,
      incoming.completion_time,
      incoming.overall_progress,
      incoming.learning_hours,
      incoming.is_completed,
      incoming.is_removed_from_program,
      incoming.course_grade,
      incoming.certificate_url,
      incoming.contract_name,
      incoming.contract_active,
      incoming.source,
      incoming.last_synced_at
    FROM (VALUES ${Prisma.join(tuples, ', ')}) AS incoming (
      id,
      user_id,
      organization_id,
      external_email,
      external_name,
      coursera_course_id,
      coursera_course_slug,
      course_name,
      university,
      collection_name,
      collection_id,
      program_slug,
      program_name,
      enrollment_time,
      class_start_time,
      class_end_time,
      last_activity_time,
      completion_time,
      overall_progress,
      learning_hours,
      is_completed,
      is_removed_from_program,
      course_grade,
      certificate_url,
      contract_name,
      contract_active,
      source,
      last_synced_at
    )
    WHERE incoming.user_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM users incoming_insert_user
        WHERE incoming_insert_user.id = incoming.user_id
          AND incoming_insert_user.organization_id = incoming.organization_id
          AND incoming_insert_user.deleted_at IS NULL
      )
    ON CONFLICT (
      organization_id,
      LOWER(external_email),
      coursera_course_id
    ) WHERE organization_id IS NOT NULL DO UPDATE SET
      user_id = COALESCE(coursera_course_progress.user_id, EXCLUDED.user_id),
      external_name = COALESCE(EXCLUDED.external_name, coursera_course_progress.external_name),
      coursera_course_slug = COALESCE(EXCLUDED.coursera_course_slug, coursera_course_progress.coursera_course_slug),
      course_name = EXCLUDED.course_name,
      university = COALESCE(EXCLUDED.university, coursera_course_progress.university),
      collection_name = COALESCE(EXCLUDED.collection_name, coursera_course_progress.collection_name),
      collection_id = COALESCE(EXCLUDED.collection_id, coursera_course_progress.collection_id),
      program_slug = EXCLUDED.program_slug,
      program_name = COALESCE(EXCLUDED.program_name, coursera_course_progress.program_name),
      enrollment_time = COALESCE(coursera_course_progress.enrollment_time, EXCLUDED.enrollment_time),
      class_start_time = COALESCE(coursera_course_progress.class_start_time, EXCLUDED.class_start_time),
      class_end_time = COALESCE(EXCLUDED.class_end_time, coursera_course_progress.class_end_time),
      last_activity_time = CASE
        WHEN coursera_course_progress.last_activity_time IS NULL THEN EXCLUDED.last_activity_time
        WHEN EXCLUDED.last_activity_time IS NULL THEN coursera_course_progress.last_activity_time
        ELSE GREATEST(coursera_course_progress.last_activity_time, EXCLUDED.last_activity_time)
      END,
      completion_time = COALESCE(coursera_course_progress.completion_time, EXCLUDED.completion_time),
      overall_progress = LEAST(
        100,
        GREATEST(0, coursera_course_progress.overall_progress, EXCLUDED.overall_progress)
      ),
      learning_hours = GREATEST(coursera_course_progress.learning_hours, EXCLUDED.learning_hours),
      is_completed = (coursera_course_progress.is_completed OR EXCLUDED.is_completed),
      is_removed_from_program = EXCLUDED.is_removed_from_program,
      course_grade = COALESCE(EXCLUDED.course_grade, coursera_course_progress.course_grade),
      certificate_url = COALESCE(EXCLUDED.certificate_url, coursera_course_progress.certificate_url),
      contract_name = COALESCE(EXCLUDED.contract_name, coursera_course_progress.contract_name),
      contract_active = EXCLUDED.contract_active,
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
    RETURNING (xmax = 0) AS inserted
  `;

    if (rows.length !== items.length) {
      throw new Error('Coursera course identity conflicts with an existing linked learner');
    }

    let inserted = 0;
    let updated = 0;
    for (const row of rows) {
      if (row.inserted) inserted += 1;
      else updated += 1;
    }
    return { inserted, updated };
  });
}

/**
 * Upsert each parsed row into `coursera_course_progress`. Resolves `user_id`
 * from agreeing direct-email and explicit-mapping evidence, failing closed on
 * an ownership conflict.
 *
 * Idempotent inside the reviewed tenant on
 * (organization_id, lower(external_email), coursera_course_id).
 */
export async function ingestCourseActivityRows(
  rows: ParsedCourseActivityRow[],
  options: { source?: string; organizationId: string }
): Promise<IngestResult> {
  // Ensure the identity mapping tables exist (xAPI module manages those at runtime).
  await ensureCourseraMappingTables();
  await ensureCourseProgressTenantKeys();

  const source = options.source?.trim() || 'csv_import';
  const organizationId = options.organizationId;

  let inserted = 0;
  let updated = 0;
  let resolvedToUsers = 0;
  let unresolved = 0;
  const errors: string[] = [];
  const unresolvedRows: IngestResult['unresolvedRows'] = [];

  // Cache lookups within a single ingest batch — a typical CSV has many rows
  // per learner across courses.
  const userIdCache = new Map<string, string | null>();

  type PreparedCourseRow = {
    row: ParsedCourseActivityRow;
    lowerEmail: string;
    userId: string | null;
    source: string;
  };

  const pending: PreparedCourseRow[] = [];

  for (const row of rows) {
    const lowerEmail = row.email.toLowerCase();

    let userId: string | null;
    if (userIdCache.has(lowerEmail)) {
      userId = userIdCache.get(lowerEmail) ?? null;
    } else {
      try {
        userId = await resolveUserIdByEmail(row.email, organizationId);
      } catch (error) {
        userId = null;
        errors.push(
          `Failed to resolve user for ${row.email}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
      userIdCache.set(lowerEmail, userId);
    }

    if (userId) {
      resolvedToUsers += 1;
    } else {
      unresolved += 1;
      unresolvedRows.push({
        email: row.email,
        name: row.name,
        courseId: row.courseId,
        course: row.course,
      });
    }

    pending.push({ row, lowerEmail, userId, source });
  }

  const upsertPreparedChunk = async (chunk: PreparedCourseRow[]) => {
    try {
      const sums = await bulkUpsertCourseProgressChunk(chunk, organizationId);
      inserted += sums.inserted;
      updated += sums.updated;
    } catch {
      for (const item of chunk) {
        try {
          const sums = await bulkUpsertCourseProgressChunk([item], organizationId);
          inserted += sums.inserted;
          updated += sums.updated;
        } catch (error) {
          errors.push(
            `Upsert failed for ${item.row.email} / ${item.row.courseId}: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    }
  };

  for (const chunk of chunkCsvRows(pending)) {
    await upsertPreparedChunk(chunk);
  }

  const promotion = await promoteCsvProgressToCanonical({ organizationId });
  if (promotion.errors > 0) {
    errors.push(`Promotion to course_progress failed for ${promotion.errors} batch — see server logs`);
  }
  return {
    inserted,
    updated,
    resolvedToUsers,
    unresolved,
    errors,
    unresolvedRows,
    promoted: promotion.upserted,
    promotionErrors: promotion.errors,
  };
}

type BadgeAggregate = {
  name: string;
  email: string;
  badgeTitle: string;
  badgeSlug: string;
  badgeLink: string | null;
  numberOfCourses: number;
  progressPercent: number;
  coursesCompleted: number;
  currentCourseName: string | null;
  badgeCompleted: boolean;
  badgeCompletionTime: Date | null;
  lastActivityTime: Date | null;
  totalLearningHours: number;
  collectionId: string | null;
  collectionName: string | null;
};

async function bulkUpsertBadgeProgressChunk(
  items: Array<{
    row: BadgeAggregate;
    lowerEmail: string;
    userId: string | null;
    source: string;
  }>,
  organizationId: string,
): Promise<{ inserted: number; updated: number }> {
  if (items.length === 0) return { inserted: 0, updated: 0 };
  const normalizedOrganizationId = organizationId.trim();
  if (!normalizedOrganizationId) {
    throw new Error('Coursera raw progress requires an organization id');
  }

  const tuples = items.map(({ row, lowerEmail, userId, source }) =>
    Prisma.sql`(
      gen_random_uuid(),
      ${userId}::text,
      ${normalizedOrganizationId}::text,
      ${lowerEmail}::text,
      ${row.name || null}::text,
      ${row.badgeSlug}::text,
      ${row.badgeTitle}::text,
      ${row.badgeLink}::text,
      ${row.numberOfCourses}::integer,
      ${clampCourseraPercent(row.progressPercent)}::numeric,
      ${row.coursesCompleted}::integer,
      ${row.currentCourseName}::text,
      ${row.badgeCompleted}::boolean,
      ${row.badgeCompletionTime}::timestamptz,
      ${row.lastActivityTime}::timestamptz,
      ${row.totalLearningHours}::numeric,
      ${row.collectionId}::text,
      ${row.collectionName}::text,
      ${source}::text,
      now()
    )`,
  );

  return prisma.$transaction(async (tx) => {
    await adoptLegacyRawBadgeProgressRows(tx, {
      organizationId: normalizedOrganizationId,
      identities: items.map(({ row, lowerEmail, userId }) => ({
        externalEmail: lowerEmail,
        badgeSlug: row.badgeSlug,
        userId,
      })),
    });
    await assertRawWriterUsersBelongToOrganization(
      tx,
      normalizedOrganizationId,
      items.map((item) => item.userId),
    );

    const upsertRows = await tx.$queryRaw<Array<{ inserted: boolean }>>`
    INSERT INTO coursera_badge_progress (
      id,
      user_id,
      organization_id,
      external_email,
      external_name,
      badge_slug,
      badge_title,
      badge_link,
      number_of_courses,
      progress_percent,
      courses_completed,
      current_course_name,
      badge_completed,
      badge_completion_time,
      last_activity_time,
      total_learning_hours,
      collection_id,
      collection_name,
      source,
      last_synced_at
    )
    SELECT
      incoming.id,
      incoming.user_id,
      incoming.organization_id,
      incoming.external_email,
      incoming.external_name,
      incoming.badge_slug,
      incoming.badge_title,
      incoming.badge_link,
      incoming.number_of_courses,
      incoming.progress_percent,
      incoming.courses_completed,
      incoming.current_course_name,
      incoming.badge_completed,
      incoming.badge_completion_time,
      incoming.last_activity_time,
      incoming.total_learning_hours,
      incoming.collection_id,
      incoming.collection_name,
      incoming.source,
      incoming.last_synced_at
    FROM (VALUES ${Prisma.join(tuples, ', ')}) AS incoming (
      id,
      user_id,
      organization_id,
      external_email,
      external_name,
      badge_slug,
      badge_title,
      badge_link,
      number_of_courses,
      progress_percent,
      courses_completed,
      current_course_name,
      badge_completed,
      badge_completion_time,
      last_activity_time,
      total_learning_hours,
      collection_id,
      collection_name,
      source,
      last_synced_at
    )
    WHERE incoming.user_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM users incoming_insert_user
        WHERE incoming_insert_user.id = incoming.user_id
          AND incoming_insert_user.organization_id = incoming.organization_id
          AND incoming_insert_user.deleted_at IS NULL
      )
    ON CONFLICT (
      organization_id,
      LOWER(external_email),
      badge_slug
    ) WHERE organization_id IS NOT NULL DO UPDATE SET
      user_id = COALESCE(coursera_badge_progress.user_id, EXCLUDED.user_id),
      external_name = COALESCE(EXCLUDED.external_name, coursera_badge_progress.external_name),
      badge_title = EXCLUDED.badge_title,
      badge_link = COALESCE(EXCLUDED.badge_link, coursera_badge_progress.badge_link),
      number_of_courses = EXCLUDED.number_of_courses,
      progress_percent = LEAST(
        100,
        GREATEST(0, coursera_badge_progress.progress_percent, EXCLUDED.progress_percent)
      ),
      courses_completed = GREATEST(coursera_badge_progress.courses_completed, EXCLUDED.courses_completed),
      current_course_name = COALESCE(EXCLUDED.current_course_name, coursera_badge_progress.current_course_name),
      badge_completed = (coursera_badge_progress.badge_completed OR EXCLUDED.badge_completed),
      badge_completion_time = COALESCE(
        coursera_badge_progress.badge_completion_time,
        EXCLUDED.badge_completion_time
      ),
      last_activity_time = CASE
        WHEN coursera_badge_progress.last_activity_time IS NULL THEN EXCLUDED.last_activity_time
        WHEN EXCLUDED.last_activity_time IS NULL THEN coursera_badge_progress.last_activity_time
        ELSE GREATEST(coursera_badge_progress.last_activity_time, EXCLUDED.last_activity_time)
      END,
      total_learning_hours = GREATEST(
        coursera_badge_progress.total_learning_hours,
        EXCLUDED.total_learning_hours
      ),
      collection_id = COALESCE(EXCLUDED.collection_id, coursera_badge_progress.collection_id),
      collection_name = COALESCE(EXCLUDED.collection_name, coursera_badge_progress.collection_name),
      source = EXCLUDED.source,
      last_synced_at = now()
    WHERE (
        coursera_badge_progress.user_id IS NULL
        OR EXCLUDED.user_id IS NULL
        OR coursera_badge_progress.user_id = EXCLUDED.user_id
      )
      AND (
        coursera_badge_progress.user_id IS NULL
        OR EXISTS (
          SELECT 1
          FROM users linked_user
          WHERE linked_user.id = coursera_badge_progress.user_id
            AND linked_user.organization_id = coursera_badge_progress.organization_id
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
    RETURNING (xmax = 0) AS inserted
  `;

    if (upsertRows.length !== items.length) {
      throw new Error('Coursera badge identity conflicts with an existing linked learner');
    }

    let inserted = 0;
    let updated = 0;
    for (const row of upsertRows) {
      if (row.inserted) inserted += 1;
      else updated += 1;
    }
    return { inserted, updated };
  });
}

/**
 * Group the per-(learner, course-within-badge) rows from the CSV into one
 * record per (learner, badgeSlug). For each group:
 *   - take the first row's badge-level fields (identical across rows)
 *   - count rows where Is Course Completed = "Yes" → coursesCompleted
 *   - pick currentCourseName from the most recently active in-progress course
 *     (max courseEnrollmentDate among isCourseCompleted=false rows; falls back
 *     to the latest row in the group if all are completed)
 *   - take MAX(lastActivityTime) across the group
 */
function aggregateBadgeRows(rows: ParsedBadgeRow[]): BadgeAggregate[] {
  const groups = new Map<string, ParsedBadgeRow[]>();

  for (const row of rows) {
    const key = `${row.email.toLowerCase()}::${row.badgeSlug}`;
    const list = groups.get(key);
    if (list) {
      list.push(row);
    } else {
      groups.set(key, [row]);
    }
  }

  const aggregates: BadgeAggregate[] = [];

  for (const groupRows of groups.values()) {
    const first = groupRows[0];

    let coursesCompleted = 0;
    let lastActivityTime: Date | null = null;
    let inProgressCandidate: { name: string; ts: number } | null = null;
    let fallbackCandidate: { name: string; ts: number } | null = null;

    for (const row of groupRows) {
      if (row.isCourseCompleted) coursesCompleted += 1;

      if (row.lastActivityTime) {
        const t = row.lastActivityTime.getTime();
        if (!lastActivityTime || t > lastActivityTime.getTime()) {
          lastActivityTime = row.lastActivityTime;
        }
      }

      const enrollmentTs = row.courseEnrollmentDate ? row.courseEnrollmentDate.getTime() : 0;
      if (row.courseName) {
        if (!row.isCourseCompleted) {
          if (!inProgressCandidate || enrollmentTs > inProgressCandidate.ts) {
            inProgressCandidate = { name: row.courseName, ts: enrollmentTs };
          }
        }
        if (!fallbackCandidate || enrollmentTs > fallbackCandidate.ts) {
          fallbackCandidate = { name: row.courseName, ts: enrollmentTs };
        }
      }
    }

    const currentCourseName =
      inProgressCandidate?.name ?? fallbackCandidate?.name ?? null;

    aggregates.push({
      name: first.name,
      email: first.email,
      badgeTitle: first.badgeTitle,
      badgeSlug: first.badgeSlug,
      badgeLink: first.badgeLink,
      numberOfCourses: first.numberOfCourses,
      progressPercent: first.progressPercent,
      coursesCompleted,
      currentCourseName,
      badgeCompleted: first.badgeCompleted,
      badgeCompletionTime: first.badgeCompletionTime,
      lastActivityTime,
      totalLearningHours: first.totalLearningHours,
      collectionId: first.collectionId,
      collectionName: first.collectionName,
    });
  }

  return aggregates;
}

/**
 * Upsert each (learner, badge) aggregate into `coursera_badge_progress`.
 * Resolves `user_id` by direct email match first, then falls back to
 * coursera_identity_mappings.
 *
 * Idempotent inside the reviewed tenant on
 * (organization_id, lower(external_email), badge_slug).
 */
export async function ingestLearningPathActivityRows(
  rows: ParsedBadgeRow[],
  options: { source?: string; organizationId: string }
): Promise<BadgeIngestResult> {
  await ensureCourseraMappingTables();
  await ensureBadgeProgressTenantKeys();

  const source = options.source?.trim() || 'csv_import';
  const organizationId = options.organizationId;

  let inserted = 0;
  let updated = 0;
  let resolvedToUsers = 0;
  let unresolved = 0;
  const errors: string[] = [];
  const unresolvedRows: BadgeIngestResult['unresolvedRows'] = [];

  const aggregates = aggregateBadgeRows(rows);

  const userIdCache = new Map<string, string | null>();

  type PreparedBadgeRow = {
    row: BadgeAggregate;
    lowerEmail: string;
    userId: string | null;
    source: string;
  };

  const pending: PreparedBadgeRow[] = [];

  for (const row of aggregates) {
    const lowerEmail = row.email.toLowerCase();

    let userId: string | null;
    if (userIdCache.has(lowerEmail)) {
      userId = userIdCache.get(lowerEmail) ?? null;
    } else {
      try {
        userId = await resolveUserIdByEmail(row.email, organizationId);
      } catch (error) {
        userId = null;
        errors.push(
          `Failed to resolve user for ${row.email}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
      userIdCache.set(lowerEmail, userId);
    }

    if (userId) {
      resolvedToUsers += 1;
    } else {
      unresolved += 1;
      unresolvedRows.push({
        email: row.email,
        name: row.name,
        badgeSlug: row.badgeSlug,
        badgeTitle: row.badgeTitle,
      });
    }

    pending.push({ row, lowerEmail, userId, source });
  }

  const upsertPreparedChunk = async (chunk: PreparedBadgeRow[]) => {
    try {
      const sums = await bulkUpsertBadgeProgressChunk(chunk, organizationId);
      inserted += sums.inserted;
      updated += sums.updated;
    } catch {
      for (const item of chunk) {
        try {
          const sums = await bulkUpsertBadgeProgressChunk([item], organizationId);
          inserted += sums.inserted;
          updated += sums.updated;
        } catch (error) {
          errors.push(
            `Upsert failed for ${item.row.email} / ${item.row.badgeSlug}: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    }
  };

  for (const chunk of chunkCsvRows(pending)) {
    await upsertPreparedChunk(chunk);
  }

  return { inserted, updated, resolvedToUsers, unresolved, errors, unresolvedRows };
}

type CourseraRawAttachmentDb = Pick<
  Prisma.TransactionClient,
  '$queryRaw' | '$executeRaw'
>;

export type CourseraRawProgressAttachment = {
  courseRowsUpdated: number;
  badgeRowsUpdated: number;
};

/**
 * Lock every identity key touched by a mapping operation. Email locks are
 * global because the serving raw-progress indexes are global. Actor locks are
 * tenant-qualified because actor-only mappings do not touch the raw email
 * tables. Every caller acquires email before actor to avoid lock inversion.
 */
export async function lockCourseraIdentityForAttachment(
  db: Pick<Prisma.TransactionClient, '$queryRaw' | '$executeRaw'>,
  args: {
    organizationId: string;
    courseraEmail?: string | null;
    actorIdentifier?: string | null;
    actorHomePage?: string | null;
  },
): Promise<void> {
  const organizationId = args.organizationId.trim();
  if (!organizationId) {
    throw new Error('Coursera identity mapping requires an organization id');
  }

  const courseraEmail = args.courseraEmail?.trim().toLowerCase() || null;
  if (courseraEmail) {
    await lockLegacyRawCourseraEmails(db, [courseraEmail]);
  }

  const actorIdentifier = args.actorIdentifier?.trim() || null;
  if (actorIdentifier) {
    const actorHomePage = args.actorHomePage?.trim() || '';
    const actorLockKey = `${organizationId}:coursera-actor:${actorHomePage}:${actorIdentifier}`;
    await db.$executeRaw(Prisma.sql`
      SELECT pg_advisory_xact_lock(hashtextextended(${actorLockKey}, 0))
    `);
  }
}

/**
 * Attach every raw course and badge row for one email inside the caller's
 * transaction. The target user is locked FOR SHARE, so organization/deletion
 * changes cannot race the ownership decision before commit. Canonical
 * promotion happens only after this ownership transaction commits.
 */
export async function attachRawCourseraProgressToUser(
  args: {
    courseraEmail: string;
    userId: string;
    expectedOrganizationId: string;
  },
  db: CourseraRawAttachmentDb,
): Promise<CourseraRawProgressAttachment> {
  const lower = args.courseraEmail.trim().toLowerCase();
  if (!lower) return { courseRowsUpdated: 0, badgeRowsUpdated: 0 };

  const userId = args.userId.trim();
  const targetOrganizationId = args.expectedOrganizationId.trim();
  if (!userId || !targetOrganizationId) {
    throw new Error('Coursera mapping target requires a user and organization');
  }

  await lockLegacyRawCourseraEmails(db, [lower]);

  const targetUsers = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT target_user.id
    FROM users AS target_user
    WHERE target_user.id = ${userId}
      AND target_user.organization_id = ${targetOrganizationId}
      AND target_user.deleted_at IS NULL
    FOR SHARE
  `);
  if (targetUsers.length !== 1) {
    throw new Error('Coursera mapping target must be an active member of the expected organization');
  }

  const conflicts = await db.$queryRaw<Array<{ source: string }>>(Prisma.sql`
      SELECT 'course'::text AS source
      FROM coursera_course_progress AS progress
      LEFT JOIN users AS linked_user ON linked_user.id = progress.user_id
      WHERE LOWER(progress.external_email) = ${lower}
        AND (
          (
            progress.organization_id IS NOT NULL
            AND progress.organization_id <> ${targetOrganizationId}
          )
          OR (
            progress.user_id IS NOT NULL
            AND progress.user_id <> ${userId}
          )
          OR (
            progress.user_id IS NOT NULL
            AND (
              linked_user.id IS NULL
              OR linked_user.organization_id <> ${targetOrganizationId}
              OR linked_user.deleted_at IS NOT NULL
            )
          )
        )
      UNION ALL
      SELECT 'badge'::text AS source
      FROM coursera_badge_progress AS progress
      LEFT JOIN users AS linked_user ON linked_user.id = progress.user_id
      WHERE LOWER(progress.external_email) = ${lower}
        AND (
          (
            progress.organization_id IS NOT NULL
            AND progress.organization_id <> ${targetOrganizationId}
          )
          OR (
            progress.user_id IS NOT NULL
            AND progress.user_id <> ${userId}
          )
          OR (
            progress.user_id IS NOT NULL
            AND (
              linked_user.id IS NULL
              OR linked_user.organization_id <> ${targetOrganizationId}
              OR linked_user.deleted_at IS NOT NULL
            )
          )
        )
      LIMIT 1
  `);
  if (conflicts.length > 0) {
    throw new Error('Coursera raw progress belongs to a different user or organization');
  }

  const courseRowsUpdated = await db.$executeRaw(Prisma.sql`
    UPDATE coursera_course_progress
    SET
      user_id = COALESCE(user_id, ${userId}),
      organization_id = COALESCE(organization_id, ${targetOrganizationId})
    WHERE LOWER(external_email) = ${lower}
      AND (user_id IS NULL OR user_id = ${userId})
      AND (organization_id IS NULL OR organization_id = ${targetOrganizationId})
      AND (user_id IS NULL OR organization_id IS NULL)
  `);

  const badgeRowsUpdated = await db.$executeRaw(Prisma.sql`
    UPDATE coursera_badge_progress
    SET
      user_id = COALESCE(user_id, ${userId}),
      organization_id = COALESCE(organization_id, ${targetOrganizationId})
    WHERE LOWER(external_email) = ${lower}
      AND (user_id IS NULL OR user_id = ${userId})
      AND (organization_id IS NULL OR organization_id = ${targetOrganizationId})
      AND (user_id IS NULL OR organization_id IS NULL)
  `);

  return {
    courseRowsUpdated: Number(courseRowsUpdated) || 0,
    badgeRowsUpdated: Number(badgeRowsUpdated) || 0,
  };
}

export async function backfillUserIdForCourseraEmail(
  courseraEmail: string,
  userId: string,
  expectedOrganizationId: string,
): Promise<{
  courseRowsUpdated: number;
  badgeRowsUpdated: number;
  promotion: CourseraProgressPromotionResult;
}> {
  const lower = courseraEmail.trim().toLowerCase();
  if (!lower) {
    return {
      courseRowsUpdated: 0,
      badgeRowsUpdated: 0,
      promotion: emptyCourseraProgressPromotionResult(),
    };
  }

  const attachment = await prisma.$transaction(async (tx) => {
    await lockCourseraIdentityForAttachment(tx, {
      organizationId: expectedOrganizationId,
      courseraEmail: lower,
    });
    return attachRawCourseraProgressToUser(
      { courseraEmail: lower, userId, expectedOrganizationId },
      tx,
    );
  });

  // Process every raw row for this identity through the same read-before-write
  // merge ladder as live B4B sync. Scoping by email is important: a WAP user
  // can have more than one historic provider identity, and this action may
  // only promote the identity the admin just reviewed.
  const promotion = await promoteCsvProgressToCanonical({
    organizationId: expectedOrganizationId,
    userId,
    courseraEmail: lower,
  });

  return {
    ...attachment,
    promotion,
  };
}

/**
 * One-time backfill: for every coursera_identity_mappings row, find orphaned
 * coursera_course_progress / coursera_badge_progress rows with NULL user_id
 * and link them. Then promote into course_progress.
 *
 * Idempotent — safe to re-run. Each individual email backfill is the same
 * as `backfillUserIdForCourseraEmail`, so re-running does not duplicate
 * course_progress rows (ON CONFLICT upsert) and does not send completion
 * emails (promoteCsvProgressToCanonical never triggers emails).
 */
export async function backfillAllOrphanedCourseraProgress(
  organizationId: string,
): Promise<{
  mappingsProcessed: number;
  totalCourseRowsUpdated: number;
  totalBadgeRowsUpdated: number;
  errors: string[];
}> {
  const normalizedOrganizationId = organizationId.trim();
  if (!normalizedOrganizationId) {
    throw new Error('Coursera orphan backfill requires an organization id');
  }

  const mappings = await prisma.$queryRaw<
    Array<{ userId: string; courseraEmail: string; organizationId: string }>
  >`
    SELECT
      mapping.user_id AS "userId",
      mapping.coursera_email AS "courseraEmail",
      target_user.organization_id AS "organizationId"
    FROM coursera_identity_mappings AS mapping
    JOIN users AS target_user
      ON target_user.id = mapping.user_id
      AND target_user.deleted_at IS NULL
    WHERE mapping.coursera_email IS NOT NULL
      AND target_user.organization_id = ${normalizedOrganizationId}
      AND (
        mapping.organization_id IS NULL
        OR mapping.organization_id = ${normalizedOrganizationId}
      )
    ORDER BY mapping.updated_at DESC
  `;

  let totalCourseRowsUpdated = 0;
  let totalBadgeRowsUpdated = 0;
  const errors: string[] = [];

  for (const mapping of mappings) {
    try {
      const result = await backfillUserIdForCourseraEmail(
        mapping.courseraEmail,
        mapping.userId,
        mapping.organizationId,
      );
      totalCourseRowsUpdated += result.courseRowsUpdated;
      totalBadgeRowsUpdated += result.badgeRowsUpdated;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      errors.push(
        `Backfill failed for ${mapping.courseraEmail} (${mapping.userId}): ${message}`
      );
    }
  }

  return {
    mappingsProcessed: mappings.length,
    totalCourseRowsUpdated,
    totalBadgeRowsUpdated,
    errors,
  };
}

/**
 * Promote all `coursera_course_progress` rows that have a resolved `user_id`
 * into the canonical `course_progress` table that feeds the member training
 * dashboard. Idempotent — safe to call on every CSV import and after every
 * identity mapping. Every write goes through `computeCourseProgressUpdate`
 * (via `planCourseraProgressPromotion`) and `upsertMergedCourseProgress`, so
 * an existing COMPLETED/xAPI-ahead row is never demoted by a delayed report.
 *
 * Unknown provider courses remain losslessly available in
 * `coursera_course_progress`; they are not promoted under guessed/sluggified
 * curriculum keys. A DB-curated mapping wins, followed by a unique static
 * Coursera-id mapping. Ambiguous static ids remain raw-only until staff map
 * them.
 */
const COURSERA_PROMOTION_BATCH_SIZE = 500;

export type CourseraProgressPromotionResult = {
  upserted: number;
  unmapped: number;
  /** Learning Path rows (program-level progress) left in the raw table, never promoted to a course. */
  learningPaths: number;
  rollupsRefreshed: number;
  errors: number;
};

function emptyCourseraProgressPromotionResult(): CourseraProgressPromotionResult {
  return { upserted: 0, unmapped: 0, learningPaths: 0, rollupsRefreshed: 0, errors: 0 };
}

type CanonicalPair = { programSlug: string; courseSlug: string };

let staticMappingsByCourseId: Map<string, CanonicalPair[]> | null = null;

function getStaticMappingsByCourseId(): Map<string, CanonicalPair[]> {
  if (staticMappingsByCourseId) return staticMappingsByCourseId;

  const result = new Map<string, CanonicalPair[]>();
  for (const [programSlug, discovered] of Object.entries(DISCOVERED_COURSERA_PROGRAMS)) {
    const canonicalProgram = getProgramBySlug(programSlug);
    if (!canonicalProgram) continue;

    for (const course of discovered.courses) {
      const current = result.get(course.courseId) ?? [];
      current.push({ programSlug: canonicalProgram.slug, courseSlug: course.slug });
      result.set(course.courseId, current);
    }
  }
  staticMappingsByCourseId = result;
  return result;
}

function uniqueStaticMappingForCourseId(courseId: string): CanonicalPair | null {
  const candidates = getStaticMappingsByCourseId().get(courseId) ?? [];
  const distinct = Array.from(
    new Map(candidates.map((candidate) => [
      `${candidate.programSlug}|${candidate.courseSlug}`,
      candidate,
    ])).values(),
  );
  return distinct.length === 1 ? distinct[0] : null;
}

export async function promoteCsvProgressToCanonical(
  options: { organizationId: string; userId?: string; courseraEmail?: string },
): Promise<CourseraProgressPromotionResult> {
  const result = emptyCourseraProgressPromotionResult();
  const affectedRollups = new Set<string>();
  const normalizedEmail = options.courseraEmail?.trim().toLowerCase() || null;
  let cursor: string | undefined;

  for (;;) {
    let rows;
    try {
      rows = await prisma.courseraCourseProgress.findMany({
        take: COURSERA_PROMOTION_BATCH_SIZE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        where: {
          organizationId: options.organizationId,
          userId: options.userId ?? { not: null },
          isRemovedFromProgram: false,
          ...(normalizedEmail
            ? { externalEmail: { equals: normalizedEmail, mode: 'insensitive' as const } }
            : {}),
        },
        orderBy: { id: 'asc' },
        select: {
          id: true,
          userId: true,
          courseraCourseId: true,
          overallProgress: true,
          isCompleted: true,
          enrollmentTime: true,
          classStartTime: true,
          lastActivityTime: true,
          completionTime: true,
          courseGrade: true,
        },
      });
    } catch (error) {
      console.error('[promoteCsvProgressToCanonical] raw progress read failed', error);
      result.errors += 1;
      break;
    }

    if (rows.length === 0) break;
    cursor = rows[rows.length - 1].id;

    const rawUserIds = Array.from(
      new Set(rows.map((row) => row.userId).filter((id): id is string => Boolean(id))),
    );
    const activeUsers = rawUserIds.length > 0
      ? await prisma.user.findMany({
          where: {
            id: { in: rawUserIds },
            organizationId: options.organizationId,
            deletedAt: null,
          },
          select: { id: true },
          take: COURSERA_PROMOTION_BATCH_SIZE,
        })
      : [];
    const activeUserIds = new Set(activeUsers.map((user) => user.id));

    const mappingIndex = await loadCanonicalMappingsForCourseraIds(
      rows.map((row) => row.courseraCourseId),
    );
    const promotable = rows.flatMap((row) => {
      if (!row.userId) return [];
      if (isLearningPathProgressRow(row)) {
        // Coursera's path percentage stays a raw row; a stale canonical
        // mapping must not turn it into progress on a synthetic course slot.
        result.learningPaths += 1;
        return [];
      }
      if (!activeUserIds.has(row.userId)) {
        result.errors += 1;
        console.error(
          `[promoteCsvProgressToCanonical] raw row ${row.id} is linked outside organization ${options.organizationId}`,
        );
        return [];
      }
      const mapping = mappingIndex.byCourseraCourseId.get(row.courseraCourseId)
        ?? uniqueStaticMappingForCourseId(row.courseraCourseId);
      if (!mapping) {
        result.unmapped += 1;
        return [];
      }
      return [{ row, mapping }];
    });

    const existingRows = promotable.length > 0
      ? await prisma.courseProgress.findMany({
          take: COURSERA_PROMOTION_BATCH_SIZE,
          where: {
            OR: promotable.map(({ row, mapping }) => ({
              userId: row.userId!,
              programSlug: getProgramBySlug(mapping.programSlug)?.slug ?? mapping.programSlug,
              courseSlug: mapping.courseSlug,
            })),
          },
          select: {
            userId: true,
            programSlug: true,
            courseSlug: true,
            status: true,
            percentComplete: true,
            lastActivityAt: true,
          },
        })
      : [];
    const existingByKey = new Map(
      existingRows.map((row) => [
        `${row.userId}|${row.programSlug}|${row.courseSlug}`,
        row,
      ]),
    );

    for (const { row, mapping } of promotable) {
      const userId = row.userId!;
      try {
        const canonicalProgramSlug = getProgramBySlug(mapping.programSlug)?.slug ?? mapping.programSlug;
        const key = `${userId}|${canonicalProgramSlug}|${mapping.courseSlug}`;
        const existing = existingByKey.get(key) ?? null;
        const planned = planCourseraProgressPromotion({
          row: {
            ...row,
            overallProgress: Number(row.overallProgress),
          },
          mapping,
          existing,
        });

        await upsertMergedCourseProgress(prisma, {
          userId,
          programSlug: planned.programSlug,
          courseSlug: planned.courseSlug,
          courseId: planned.courseId,
          merged: planned.merged,
          existing: planned.existing,
          completedAt: planned.completedAt,
          scoreScaled: planned.scoreScaled,
          startedAt: planned.startedAt,
          updateStartedAt: planned.updateStartedAt,
        });

        // A second raw Coursera id may map to the same canonical course. Feed
        // the first merge back into the in-memory ladder so the later row can
        // never undo it within this promotion pass.
        existingByKey.set(key, {
          userId,
          programSlug: planned.programSlug,
          courseSlug: planned.courseSlug,
          ...planned.merged,
        });
        affectedRollups.add(`${userId}|${planned.programSlug}`);
        result.upserted += 1;
      } catch (error) {
        result.errors += 1;
        console.error(
          `[promoteCsvProgressToCanonical] row ${row.id} (${row.courseraCourseId}) failed`,
          error,
        );
      }
    }

    if (rows.length < COURSERA_PROMOTION_BATCH_SIZE) break;
  }

  for (const key of affectedRollups) {
    const separator = key.indexOf('|');
    const userId = key.slice(0, separator);
    const programSlug = key.slice(separator + 1);
    try {
      await refreshMemberProgramProgressRollup(userId, programSlug);
      result.rollupsRefreshed += 1;
    } catch (error) {
      result.errors += 1;
      console.error(
        `[promoteCsvProgressToCanonical] rollup failed for ${userId}/${programSlug}`,
        error,
      );
    }
  }

  return result;
}
