import type { BadgeVariant } from '@/components/portal/StatusBadge';
import type { JobPostingApplicationStatus } from '@prisma/client';
import { jobApplicationStatusLabel } from '@/lib/status/jobApplicationStatusVocabulary';

/**
 * Pipeline label for employer-facing UI: the `employer` audience of
 * lib/status/jobApplicationStatusVocabulary.ts ("New" / "Reviewing" /
 * "Interviewing" / "Offer extended" / "Hired" / "Not selected").
 */
export function employerJobPostingApplicationStatusLabel(
  status: JobPostingApplicationStatus | string,
): string {
  return jobApplicationStatusLabel(String(status), 'employer');
}

/** Maps hiring pipeline stage to shared portal badge semantics. */
export function employerJobPostingApplicationStatusBadgeVariant(
  status: JobPostingApplicationStatus | string,
): BadgeVariant {
  switch (status) {
    case 'hired':
      return 'success';
    case 'rejected':
      return 'error';
    case 'offered':
    case 'interview':
      return 'info';
    case 'reviewing':
      return 'warning';
    case 'pending':
    default:
      return 'accent';
  }
}
