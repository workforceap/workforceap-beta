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

  // A newly created row has no previous status, so it is a creation, not a
  // transition; `application_added` on the apply route is that event. Emitting
  // a status change from a status to itself here would only add noise.

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
