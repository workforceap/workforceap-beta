/**
 * HTML fragment acknowledging WS4 adult eligibility screening answers.
 * Reused by applicant confirmation and admin alert emails.
 *
 * WAP-170: email is not a store for special-category data. This block carries
 * only the quick-fit flag and how many answers were saved — never an answer.
 * Staff review the answers on the member's admin page; members review theirs
 * in the portal.
 */

import { escapeHtml } from '@/lib/email/escapeHtml';
import {
  eligibilityScreeningAnswerCount,
  hasEligibilityScreeningFields,
  type EligibilityScreeningFields,
} from '@/lib/apply/eligibilityScreeningFields';

function row(label: string, value: string | null | undefined): string {
  if (!value) return '';
  return `<li><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</li>`;
}

/**
 * Returns an HTML block with the screening counts, or empty string when
 * nothing was submitted.
 */
export function eligibilityScreeningSummaryHtml(
  fields: EligibilityScreeningFields | null | undefined,
  opts?: { heading?: string },
): string {
  if (!hasEligibilityScreeningFields(fields)) return '';
  const f = fields!;
  const heading = opts?.heading ?? 'Eligibility screening received';
  const qualifyLine =
    typeof f.qualifies === 'boolean'
      ? row(
          'Quick eligibility fit',
          `${f.qualifies ? 'yes' : 'review'} (${f.yesCount ?? 0}/3)`,
        )
      : '';
  const items = [qualifyLine, row('Answers saved', String(eligibilityScreeningAnswerCount(f)))]
    .filter(Boolean)
    .join('\n');
  return `
    <p><strong>${escapeHtml(heading)}</strong></p>
    <ul>
      ${items}
    </ul>
  `.trim();
}
