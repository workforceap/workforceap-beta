/**
 * Weekly admin digest listing employers with a heavy backlog (10+) of
 * unreviewed (pending/reviewing) applicants 5+ days old.
 */

import { escapeHtml } from '@/lib/email/escapeHtml';

export function adminStaleApplicantsDigestHtml(params: {
  employers: { companyName: string; candidateCount: number }[];
  truncated?: boolean;
}): string {
  const employers = params.employers;
  const rows = employers
    .map(
      (e) =>
        `<li><strong>${escapeHtml(e.companyName)}</strong> — ${escapeHtml(String(e.candidateCount))} candidates waiting 5+ days</li>`
    )
    .join('');
  return `
    ${params.truncated ? '<p><strong>Queue scan capped:</strong> open the staff queues for the full backlog.</p>' : ''}
    <p>${escapeHtml(String(employers.length))} employer${employers.length === 1 ? ' has' : 's have'} 10 or more unreviewed applicants (pending/reviewing 5+ days):</p>
    <ul>${rows}</ul>
    <p>These employers may need an outreach nudge to keep candidates engaged.</p>
  `.trim();
}
