import { Prisma } from '@prisma/client';

import type { B4BGradebookReport } from '@/lib/coursera/b4bClient';
import { centralDateKey, pickGradebookLearningHours } from '@/lib/coursera/learningHoursDaily';
import { prisma } from '@/lib/db/prisma';

/**
 * Writes cumulative Coursera learning-hours readings into
 * `coursera_learning_hours_snapshots`, one row per learner, course and
 * Central-time day. See `lib/coursera/learningHoursDaily.ts` for how daily
 * minutes are read back out.
 *
 * Only gradebook rows carry hours. Enrollment reports do not, and the raw
 * `coursera_course_progress.learning_hours` stays 0 on the B4B path, so it is
 * not a source here.
 */

export type LearningHoursSnapshotInput = {
  organizationId: string;
  userId: string | null;
  externalEmail: string;
  courseraCourseId: string;
  learningHours: number;
  source: 'b4b_gradebook_nightly' | 'b4b_gradebook_user_sync';
};

/** Rows that can be snapshotted from a gradebook page; rows without hours are skipped. */
export function snapshotInputsFromGradebook(
  rows: B4BGradebookReport[],
  resolve: (email: string) => { organizationId: string; userId: string | null } | null,
  source: LearningHoursSnapshotInput['source'],
): { inputs: LearningHoursSnapshotInput[]; skippedNoHours: number; skippedNoIdentity: number } {
  const inputs: LearningHoursSnapshotInput[] = [];
  let skippedNoHours = 0;
  let skippedNoIdentity = 0;
  for (const row of rows) {
    // Our invitations set externalId to the learner's WAP email, so it is a
    // usable identity when Coursera leaves `email` off the row.
    const externalIdEmail = row.externalId?.includes('@') ? row.externalId : undefined;
    const email = (row.email ?? externalIdEmail)?.trim().toLowerCase() ?? '';
    const courseId = row.courseId?.trim() ?? '';
    if (!email || !courseId) {
      skippedNoIdentity += 1;
      continue;
    }
    const hours = pickGradebookLearningHours(row);
    if (hours === null) {
      skippedNoHours += 1;
      continue;
    }
    const owner = resolve(email);
    if (!owner) {
      skippedNoIdentity += 1;
      continue;
    }
    inputs.push({
      organizationId: owner.organizationId,
      userId: owner.userId,
      externalEmail: email,
      courseraCourseId: courseId,
      learningHours: hours,
      source,
    });
  }
  return { inputs, skippedNoHours, skippedNoIdentity };
}

/**
 * Upsert today's reading for each input. A second reading on the same Central
 * day keeps the larger total; a known user id is never replaced by null or by
 * a different user. Returns the number of rows written.
 */
export async function recordLearningHoursSnapshots(
  inputs: LearningHoursSnapshotInput[],
  capturedAt: Date = new Date(),
): Promise<number> {
  // One row per key per statement: Postgres refuses an ON CONFLICT upsert
  // that touches the same row twice. Keep the larger total, like the table.
  const byKey = new Map<string, LearningHoursSnapshotInput>();
  for (const row of inputs) {
    const key = `${row.organizationId}|${row.externalEmail.trim().toLowerCase()}|${row.courseraCourseId}`;
    const prev = byKey.get(key);
    const keep = !prev || row.learningHours > prev.learningHours ? row : prev;
    byKey.set(key, { ...keep, userId: keep.userId ?? row.userId ?? prev?.userId ?? null });
  }
  const rows = [...byKey.values()];
  if (rows.length === 0) return 0;
  const snapshotDate = centralDateKey(capturedAt);
  let written = 0;
  // Small batches keep each statement well under parameter limits.
  for (let i = 0; i < rows.length; i += 200) {
    const batch = rows.slice(i, i + 200);
    const values = batch.map(
      (row) => Prisma.sql`(
        gen_random_uuid()::text,
        ${row.organizationId},
        ${row.userId},
        ${row.externalEmail.trim().toLowerCase()},
        ${row.courseraCourseId},
        ${snapshotDate}::date,
        ${row.learningHours.toFixed(2)}::numeric(8,2),
        ${row.source},
        ${capturedAt},
        ${capturedAt}
      )`,
    );
    written += await prisma.$executeRaw(Prisma.sql`
      INSERT INTO coursera_learning_hours_snapshots (
        id, organization_id, user_id, external_email, coursera_course_id,
        snapshot_date, learning_hours, source, first_captured_at, last_captured_at
      )
      VALUES ${Prisma.join(values)}
      ON CONFLICT (organization_id, external_email, coursera_course_id, snapshot_date)
      DO UPDATE SET
        learning_hours = GREATEST(coursera_learning_hours_snapshots.learning_hours, EXCLUDED.learning_hours),
        user_id = COALESCE(coursera_learning_hours_snapshots.user_id, EXCLUDED.user_id),
        source = EXCLUDED.source,
        last_captured_at = EXCLUDED.last_captured_at
      WHERE coursera_learning_hours_snapshots.user_id IS NULL
        OR EXCLUDED.user_id IS NULL
        OR coursera_learning_hours_snapshots.user_id = EXCLUDED.user_id
    `);
  }
  return written;
}
