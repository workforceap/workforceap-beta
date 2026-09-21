/**
 * One writer for the `application_status_changed` member event.
 *
 * Four code paths move a `job_applications.status` and, before this module,
 * only `app/api/member/job-applications/[id]` logged the move. The member
 * activity log was therefore missing every status change made through the
 * sibling PATCH route, the job board, and placement confirmation — the paths
 * the product actually uses. Routing all four through here keeps one event
 * shape instead of four that drift.
 *
 * ## What the metadata carries, and why it carries the status twice
 *
 * `previousStatus` / `nextStatus` are **kanban stages**, unchanged from the
 * event rows the one logging route has already written, so nothing that reads
 * the existing log has to learn a new vocabulary.
 *
 * Stages are lossy in exactly the places that matter: `getJobApplicationStage`
 * folds `SAVED` and `APPLIED` into `APPLIED`, and `OFFER` and `ACCEPTED` into
 * `OFFER`. So a stage-only log records the member's most important two moves
 * — actually applying, and accepting an offer — as a transition from a stage
 * to itself. `previousDbStatus` / `nextDbStatus` are therefore written
 * alongside: additive keys, no existing reader affected, and the only form
 * that can reconstruct a count later, because the "Active jobs" tile is
 * defined over database statuses (`ACTIVE_APPLICATION_STATUSES`), not stages.
 *
 * This does **not** make the past recoverable. Every status change before this
 * ships is gone; it closes the hole going forward.
 */
import type { Prisma } from '@prisma/client';

import { persistEvent, trackEvent } from '@/lib/events/track';
import {
  getJobApplicationStage,
  type JobApplicationDbStatus,
} from '@/lib/member/jobApplicationKanban';

export type ApplicationStatusChange = {
  userId: string;
  /** `job_applications.id` — the member's tracker row, not a `job_postings_applications` row. */
  applicationId: string;
  previousStatus: JobApplicationDbStatus;
  nextStatus: JobApplicationDbStatus;
  /** Member-facing surface the change was made from. */
  sourcePage?: string;
};

export function applicationStatusChangeMetadata(
  previousStatus: JobApplicationDbStatus,
  nextStatus: JobApplicationDbStatus,
): Record<string, unknown> {
  return {
    previousStatus: getJobApplicationStage(previousStatus),
    nextStatus: getJobApplicationStage(nextStatus),
    previousDbStatus: previousStatus,
    nextDbStatus: nextStatus,
  };
}

/**
 * Record a status change, or nothing at all when the status did not move.
 *
 * Without `db` this is best-effort analytics (`trackEvent` swallows its own
 * errors), which is what an API route wants: a failed log must not fail the
 * member's update. Pass `db` — a transaction client or the Prisma client — to
 * use the durable `persistEvent` writer whose errors propagate, for callers
 * already inside a transaction that should roll back with it.
 */
export async function recordApplicationStatusChange(
  change: ApplicationStatusChange,
  db?: Pick<Prisma.TransactionClient, 'memberEvent'>,
): Promise<void> {
  if (change.previousStatus === change.nextStatus) return;
  const params = {
    userId: change.userId,
    eventName: 'application_status_changed' as const,
    entityType: 'job_application',
    entityId: change.applicationId,
    sourcePage: change.sourcePage,
    metadata: applicationStatusChangeMetadata(change.previousStatus, change.nextStatus),
  };
  if (db) {
    await persistEvent(params, db);
    return;
  }
  await trackEvent(params);
}
