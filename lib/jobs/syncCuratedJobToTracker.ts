import { prisma } from '@/lib/db/prisma';
import type { JobApplicationStatus, JobApplicationSource } from '@prisma/client';

import { recordApplicationStatusChange } from '@/lib/member/applicationStatusEvent';

type JobForTracker = {
  id: string;
  title: string;
  employer: { companyName: string };
};

/**
 * Keeps the member Application Tracker in sync with curated job board activity.
 */
export async function syncCuratedJobToTracker(
  userId: string,
  job: JobForTracker,
  opts: {
    status: JobApplicationStatus;
    /** When true, sets appliedAt if moving to an applied state */
    markAppliedDate?: boolean;
    source?: JobApplicationSource;
  }
) {
  const existing = await prisma.jobApplication.findFirst({
    where: { userId, curatedJobId: job.id },
  });

  const notes = 'WorkforceAP Job Board';
  const url = `/dashboard/jobs/${job.id}`;
  const source = opts.source ?? 'DIRECT';

  if (existing) {
    const updated = await prisma.jobApplication.update({
      where: { id: existing.id },
      data: {
        status: opts.status,
        company: job.employer.companyName,
        role: job.title,
        url,
        appliedAt:
          opts.markAppliedDate && opts.status === 'APPLIED'
            ? new Date()
            : existing.appliedAt,
      },
    });
    // Job-board activity moves a tracker row the member can also move by hand
    // on /dashboard/job-applications, which logs. This path did not, so
    // "saved a curated job, then applied to it" left no status history at all.
    // Best-effort: a failed log must never fail the apply.
    await recordApplicationStatusChange({
      userId,
      applicationId: updated.id,
      previousStatus: existing.status,
      nextStatus: opts.status,
      sourcePage: `/dashboard/jobs/${job.id}`,
    });
    return updated;
  }

  // A newly created row has no previous status, so it is a creation rather
  // than a transition, and emitting a status change from a status to itself
  // would be noise.
  //
  // It is NOT covered by an existing event, though, and this comment used to
  // claim it was: the apply route's `application_added` carries the
  // `job_postings_applications` id, which is a different table from this
  // tracker row, and `track-curated/route.ts` emits nothing at all. So a
  // tracker row still has no creation event under its own id. That is a real
  // gap in the activity log, left for a follow-up rather than invented here,
  // because it needs a `job_application_added` event name and a decision about
  // the two routes that create these rows.

  return prisma.jobApplication.create({
    data: {
      userId,
      company: job.employer.companyName,
      role: job.title,
      status: opts.status,
      source,
      curatedJobId: job.id,
      url,
      notes,
      appliedAt: opts.status === 'APPLIED' && opts.markAppliedDate ? new Date() : null,
    },
  });
}
