/**
 * Weekly nudge to an employer: candidates have been waiting (pending/reviewing)
 * on one or more of their job posts for 5+ days.
 */

import { escapeHtml } from '@/lib/email/escapeHtml';

export function employerPendingApplicantsHtml(params: {
  candidateCount: number;
  jobsAffected: number;
  oldestWaitingDays: number;
  truncated?: boolean;
}): string {
  const candidateCount = Math.max(0, Math.floor(Number(params.candidateCount) || 0));
  const jobsAffected = Math.max(0, Math.floor(Number(params.jobsAffected) || 0));
  const oldestWaitingDays = Math.max(0, Math.floor(Number(params.oldestWaitingDays) || 0));
  return `
    ${params.truncated ? '<p><strong>Queue scan capped:</strong> open your applicants for the full backlog.</p>' : ''}
    <p><strong>${escapeHtml(String(candidateCount))} candidate${candidateCount === 1 ? '' : 's'}</strong> ${candidateCount === 1 ? 'is' : 'are'} waiting on <strong>${escapeHtml(String(jobsAffected))} of your job post${jobsAffected === 1 ? '' : 's'}</strong>.</p>
    <p>${params.truncated ? 'The longest observed wait in this scan' : 'The longest wait since an application or recorded employer response'} is <strong>${escapeHtml(String(oldestWaitingDays))} day${oldestWaitingDays === 1 ? '' : 's'}</strong>. Review the current status and respond to keep candidates informed.</p>
    <p>Review your applicants to move things forward.</p>
  `.trim();
}
