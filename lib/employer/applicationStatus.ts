import type { JobPostingApplicationStatus } from '@prisma/client';

/**
 * The moves an employer can make on a JobPostingApplication. Both employer
 * writers (app/api/employer/applications/[id]/route.ts and
 * app/api/employer/jobs/[id]/applicants/route.ts) refuse anything else with a
 * 409, and the employer status controls offer only these moves.
 */
const ALLOWED: Record<JobPostingApplicationStatus, JobPostingApplicationStatus[]> = {
  // 'interview' keeps the shipped work-queue "Move to interview" button
  // (components/employer/EmployerWorkQueueClient.tsx) working on new applications.
  pending: ['reviewing', 'interview', 'rejected'],
  reviewing: ['interview', 'pending', 'rejected'],
  interview: ['offered', 'reviewing', 'rejected'],
  offered: ['hired', 'interview', 'rejected'],
  hired: [],
  rejected: ['pending'],
};

export function canTransitionJobApplicationStatus(
  from: JobPostingApplicationStatus,
  to: JobPostingApplicationStatus
): boolean {
  if (from === to) return true;
  return ALLOWED[from]?.includes(to) ?? false;
}

/** The statuses an application can move to from `from` (a copy; excludes `from`). */
export function allowedNextJobApplicationStatuses(from: JobPostingApplicationStatus): JobPostingApplicationStatus[] {
  return [...(ALLOWED[from] ?? [])];
}
