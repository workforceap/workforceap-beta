/**
 * HTML fragment listing WS4 adult eligibility screening answers.
 * Reused by applicant confirmation and admin alert emails.
 */

import { escapeHtml } from '@/lib/email/escapeHtml';
import {
  hasEligibilityScreeningFields,
  type EligibilityScreeningFields,
} from '@/lib/apply/eligibilityScreeningFields';
import { formatPublicAssistancePrograms } from '@/lib/apply/publicAssistance';

function row(label: string, value: string | null | undefined): string {
  if (!value) return '';
  return `<li><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</li>`;
}

/**
 * Returns an HTML block with the WS4 fields, or empty string when nothing to show.
 */
export function eligibilityScreeningSummaryHtml(
  fields: EligibilityScreeningFields | null | undefined,
  opts?: { heading?: string },
): string {
  if (!hasEligibilityScreeningFields(fields)) return '';
  const f = fields!;
  const heading = opts?.heading ?? 'Eligibility screening answers';
  const qualifyLine =
    typeof f.qualifies === 'boolean'
      ? row(
          'Quick eligibility fit',
          `${f.qualifies ? 'yes' : 'review'} (${f.yesCount ?? 0}/3)`,
        )
      : '';
  const items = [
    qualifyLine,
    row('Unemployed / underemployed (Q1)', f.q1),
    row('Household income under $60k (Q2)', f.q2),
    row('Work authorization (Q3)', f.q3),
    row('Receiving unemployment', f.receivingUnemployment),
    row('Exhausted unemployment', f.exhaustedUnemployment),
    row('Layoff / last employer', f.layoffCompany),
    row('SNAP/WIC', f.snapWic),
    row('Benefit programs', formatPublicAssistancePrograms(f.publicAssistancePrograms)),
    row('Wants help applying for benefits', f.publicAssistanceHelpRequested),
    row('Heard about us', f.hearAbout),
    row('Heard about us (other)', f.hearAboutOther),
    row('Partner / ambassador referral', f.partnerAmbassadorReferral),
  ]
    .filter(Boolean)
    .join('\n');
  if (!items) return '';
  return `
    <p><strong>${escapeHtml(heading)}</strong></p>
    <ul>
      ${items}
    </ul>
  `.trim();
}
