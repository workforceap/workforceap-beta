import { prisma } from '@/lib/db/prisma';

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function effectiveAppActivityAt(appliedAt: Date, statusUpdatedAt: Date | null): Date {
  return statusUpdatedAt ?? appliedAt;
}

export async function getEmployerWorkQueueSlices(employerId: string) {
  const now = new Date();
  const startToday = startOfUtcDay(now);
  const staleCutoff = new Date(now.getTime() - 48 * 60 * 60 * 1000);

  const includeApp = {
    job: { select: { id: true, title: true } },
    student: { select: { id: true, fullName: true, email: true } },
  } as const;

  const needsReviewTodayApps = await prisma.jobPostingApplication.findMany({
    where: {
      job: { employerId },
      status: 'pending',
      appliedAt: { gte: startToday },
    },
    include: includeApp,
    orderBy: { appliedAt: 'desc' },
    take: 50,
  });

  const jobsAwaitingPublish = await prisma.job.findMany({
    where: { employerId, status: { in: ['pending', 'approved'] } },
    select: { id: true, title: true, status: true, updatedAt: true },
    orderBy: { updatedAt: 'desc' },
    take: 30,
  });

  const staleApps = await prisma.jobPostingApplication.findMany({
    where: {
      job: { employerId },
      status: { in: ['pending', 'reviewing'] },
    },
    include: includeApp,
    orderBy: { appliedAt: 'asc' },
    take: 80,
  });

  const staleFiltered = staleApps.filter((a) => {
    const t = effectiveAppActivityAt(a.appliedAt, a.statusUpdatedAt);
    return t < staleCutoff;
  });

  const interviewPending = await prisma.jobPostingApplication.findMany({
    where: { job: { employerId }, status: 'interview' },
    include: includeApp,
    orderBy: { appliedAt: 'desc' },
    take: 50,
  });

  return {
    needsReviewTodayApps,
    jobsAwaitingPublish,
    staleApps: staleFiltered,
    interviewPending,
  };
}

/**
 * Work queue rail badge + notification bell counts. Applications only
 * (WAP-211): jobs awaiting publish are on the work-queue page too, but they
 * already badge the Jobs row (`jobs_pending`), and the bell labels this count
 * "Candidates to review today", so a pending job must not inflate it.
 */
export async function countEmployerQueueBadges(employerId: string) {
  const { needsReviewTodayApps, staleApps, interviewPending } = await getEmployerWorkQueueSlices(employerId);

  return {
    employer_queue_review_today: needsReviewTodayApps.length,
    employer_queue_stale_48h: staleApps.length,
    employer_queue_interview: interviewPending.length,
  };
}
