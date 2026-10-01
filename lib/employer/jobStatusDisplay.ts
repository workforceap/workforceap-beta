import type { BadgeVariant } from '@/components/portal/StatusBadge';
import { jobPostingStatusLabel } from '@/lib/status/jobPostingStatusVocabulary';

/** The employer's word for a posting status (lib/status/jobPostingStatusVocabulary.ts). */
export function employerJobStatusLabel(status: string): string {
  return jobPostingStatusLabel(status, 'employer');
}

export function employerJobPortalStatusLabel(status: string): string {
  if (status === 'live') return 'Active';
  if (status === 'approved') return 'Paused';
  if (status === 'closed' || status === 'filled') return 'Closed';
  if (status === 'expired') return 'Expired';
  return employerJobStatusLabel(status);
}

export function employerJobPortalBadgeVariant(status: string): BadgeVariant {
  if (status === 'live') return 'success';
  if (status === 'approved') return 'warning';
  if (status === 'closed' || status === 'filled') return 'neutral';
  if (status === 'expired') return 'error';
  return employerJobStatusBadgeVariant(status);
}

export function employerJobStatusBadgeVariant(status: string): BadgeVariant {
  if (status === 'live') return 'success';
  if (status === 'filled') return 'info';
  if (status === 'pending') return 'warning';
  if (status === 'expired') return 'error';
  return 'neutral';
}
