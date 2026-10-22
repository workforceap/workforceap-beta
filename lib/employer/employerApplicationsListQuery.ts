import type { JobPostingApplicationStatus } from '@prisma/client';
import { employerCandidatesHref } from './candidatesWorkspace';

const STATUSES: JobPostingApplicationStatus[] = [
  'pending',
  'reviewing',
  'interview',
  'offered',
  'hired',
  'rejected',
];

export type EmployerApplicationsSort = 'applied_desc' | 'applied_asc';

export function parseEmployerApplicationStatusFilter(raw: string | undefined): JobPostingApplicationStatus | null {
  if (!raw) return null;
  return STATUSES.includes(raw as JobPostingApplicationStatus) ? (raw as JobPostingApplicationStatus) : null;
}

export function parseEmployerApplicationsSort(raw: string | undefined): EmployerApplicationsSort {
  return raw === 'applied_asc' ? 'applied_asc' : 'applied_desc';
}

export function employerApplicationsListHref(opts: {
  page?: number;
  status?: JobPostingApplicationStatus | 'all' | null | undefined;
  sort?: EmployerApplicationsSort;
}): string {
  const params = new URLSearchParams();
  if (opts.page != null && opts.page > 1) params.set('page', String(opts.page));
  const status = opts.status;
  if (status && status !== 'all') params.set('status', status);
  if (opts.sort && opts.sort !== 'applied_desc') params.set('sort', opts.sort);
  return employerCandidatesHref('applicants', Object.fromEntries(params));
}
