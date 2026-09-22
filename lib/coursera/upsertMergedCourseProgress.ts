import { CourseProgressStatus, Prisma } from '@prisma/client';

import { ensurePendingCertificationForCompletionSafely } from '@/lib/certifications/pendingFromCompletion';
import type { ExistingCourseProgress, MergedCourseProgress } from '@/lib/coursera/b4bSync';

type DbClient = Pick<Prisma.TransactionClient, '$queryRaw' | '$executeRaw'> & {
  $transaction?: <T>(
    callback: (tx: Prisma.TransactionClient) => Promise<T>,
  ) => Promise<T>;
};

export type UpsertMergedCourseProgressArgs = {
  userId: string;
  programSlug: string;
  courseSlug: string;
  courseId: string | null;
  merged: MergedCourseProgress;
  existing: ExistingCourseProgress | null;
  /** Stamped on create when merged is COMPLETED; on update only when transitioning into COMPLETED. */
  completedAt: Date | null;
  scoreScaled?: number | null;
  scoreRaw?: number | null;
  startedAt?: Date | null;
  /** When set, applied on update only (B4B enrolledAt re-sync). */
  updateStartedAt?: Date | null;
  /** xAPI/webhook facts increment the observation counter; batch snapshots do not. */
  statementCountIncrement?: number;
};

export type UpsertMergedCourseProgressResult = {
  newlyCompleted: boolean;
};

/**
 * Single database-side monotonic write path for B4B/CSV-sourced progress.
 *
 * The caller's `merged` value may be based on a stale read. The ON CONFLICT
 * ladder therefore compares it with the row visible at write time. This is
 * what prevents a concurrent xAPI COMPLETED write from being demoted by a
 * delayed IN_PROGRESS provider report.
 */
export async function upsertMergedCourseProgress(
  db: DbClient,
  args: UpsertMergedCourseProgressArgs,
): Promise<UpsertMergedCourseProgressResult> {
  const {
    userId,
    programSlug,
    courseSlug,
    courseId,
    merged,
    completedAt,
    scoreScaled,
    scoreRaw,
    startedAt,
    updateStartedAt,
    statementCountIncrement = 0,
  } = args;
  const boundedPercentComplete = merged.status === CourseProgressStatus.COMPLETED
    ? 100
    : Number.isFinite(merged.percentComplete)
      ? Math.max(0, Math.min(100, merged.percentComplete))
      : 0;

  const runAtomicUpsert = async (
    tx: Pick<Prisma.TransactionClient, '$queryRaw' | '$executeRaw'>,
  ): Promise<UpsertMergedCourseProgressResult & { completed: boolean }> => {
    const lockKey = `${userId}:${programSlug}:${courseSlug}`;
    await tx.$executeRaw(Prisma.sql`
      SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))
    `);
    const previousRows = await tx.$queryRaw<
      Array<{ status: CourseProgressStatus }>
    >(Prisma.sql`
      SELECT status
      FROM course_progress
      WHERE user_id = ${userId}
        AND program_slug = ${programSlug}
        AND course_slug = ${courseSlug}
      FOR UPDATE
    `);

    const written = await tx.$queryRaw<
      Array<{ status: CourseProgressStatus; inserted: boolean }>
    >(Prisma.sql`
    INSERT INTO course_progress (
      id,
      user_id,
      program_slug,
      course_slug,
      course_id,
      status,
      percent_complete,
      progress_pct,
      score_scaled,
      score_raw,
      started_at,
      completed_at,
      last_activity_at,
      statement_count,
      last_updated_at,
      created_at
    ) VALUES (
      gen_random_uuid(),
      ${userId},
      ${programSlug},
      ${courseSlug},
      ${courseId},
      ${merged.status}::"course_progress_status",
      ${boundedPercentComplete},
      ${boundedPercentComplete},
      ${scoreScaled ?? null},
      ${scoreRaw ?? null},
      ${startedAt ?? null},
      ${merged.status === CourseProgressStatus.COMPLETED ? completedAt : null},
      ${merged.lastActivityAt},
      ${statementCountIncrement},
      now(),
      now()
    )
    ON CONFLICT (user_id, program_slug, course_slug) DO UPDATE SET
      course_id = COALESCE(EXCLUDED.course_id, course_progress.course_id),
      status = CASE
        WHEN course_progress.status = 'COMPLETED'::"course_progress_status"
          OR EXCLUDED.status = 'COMPLETED'::"course_progress_status"
          THEN 'COMPLETED'::"course_progress_status"
        WHEN course_progress.status = 'IN_PROGRESS'::"course_progress_status"
          OR EXCLUDED.status = 'IN_PROGRESS'::"course_progress_status"
          THEN 'IN_PROGRESS'::"course_progress_status"
        ELSE 'NOT_STARTED'::"course_progress_status"
      END,
      percent_complete = CASE
        WHEN course_progress.status = 'COMPLETED'::"course_progress_status"
          OR EXCLUDED.status = 'COMPLETED'::"course_progress_status"
          THEN 100
        ELSE LEAST(
          100,
          GREATEST(0, course_progress.percent_complete, EXCLUDED.percent_complete)
        )
      END,
      progress_pct = CASE
        WHEN course_progress.status = 'COMPLETED'::"course_progress_status"
          OR EXCLUDED.status = 'COMPLETED'::"course_progress_status"
          THEN 100
        ELSE LEAST(
          100,
          GREATEST(0, course_progress.progress_pct, EXCLUDED.progress_pct)
        )
      END,
      score_scaled = CASE
        WHEN EXCLUDED.score_scaled IS NULL THEN course_progress.score_scaled
        WHEN course_progress.score_scaled IS NULL THEN EXCLUDED.score_scaled
        ELSE GREATEST(course_progress.score_scaled, EXCLUDED.score_scaled)
      END,
      score_raw = CASE
        WHEN EXCLUDED.score_raw IS NULL THEN course_progress.score_raw
        WHEN course_progress.score_raw IS NULL THEN EXCLUDED.score_raw
        ELSE GREATEST(course_progress.score_raw, EXCLUDED.score_raw)
      END,
      started_at = CASE
        WHEN course_progress.started_at IS NULL
          THEN COALESCE(${updateStartedAt ?? null}, EXCLUDED.started_at)
        WHEN COALESCE(${updateStartedAt ?? null}, EXCLUDED.started_at) IS NULL
          THEN course_progress.started_at
        ELSE LEAST(
          course_progress.started_at,
          COALESCE(${updateStartedAt ?? null}, EXCLUDED.started_at)
        )
      END,
      completed_at = CASE
        WHEN course_progress.status = 'COMPLETED'::"course_progress_status"
          THEN COALESCE(course_progress.completed_at, EXCLUDED.completed_at)
        WHEN EXCLUDED.status = 'COMPLETED'::"course_progress_status"
          THEN COALESCE(EXCLUDED.completed_at, course_progress.completed_at)
        ELSE course_progress.completed_at
      END,
      last_activity_at = CASE
        WHEN course_progress.last_activity_at IS NULL THEN EXCLUDED.last_activity_at
        WHEN EXCLUDED.last_activity_at IS NULL THEN course_progress.last_activity_at
        ELSE GREATEST(course_progress.last_activity_at, EXCLUDED.last_activity_at)
      END,
      statement_count = course_progress.statement_count + ${statementCountIncrement},
      last_updated_at = now()
    RETURNING status, (xmax = 0) AS inserted
  `);

    const finalRow = written[0];
    if (!finalRow) {
      throw new Error('Coursera progress merge returned no row');
    }
    const previous = previousRows[0] ?? null;
    const newlyCompleted =
      finalRow.status === CourseProgressStatus.COMPLETED &&
      (previous
        ? previous.status !== CourseProgressStatus.COMPLETED
        : finalRow.inserted);

    return { newlyCompleted, completed: finalRow.status === CourseProgressStatus.COMPLETED };
  };

  const written = await (db.$transaction
    ? db.$transaction((tx) => runAtomicUpsert(tx))
    : runAtomicUpsert(db));

  // Every Coursera-reported completion that lands here (B4B cron, per-user
  // sync, CSV promotion, xAPI statement detail) gets a pending certificate
  // the member can see while staff verify it. Runs after the progress write
  // on the shared client, not inside the caller's transaction: the helper is
  // idempotent on (user, certificate name), so a re-sync of an already
  // completed row is one indexed read, and a certificate that fails to
  // appear is retried by the next report or the backfill script.
  if (written.completed) {
    await ensurePendingCertificationForCompletionSafely({
      userId,
      programSlug,
      courseSlug,
      courseraCourseId: courseId,
      completedAt,
      source: 'coursera-progress-merge',
    });
  }

  return { newlyCompleted: written.newlyCompleted };
}
