/**
 * Admin / Mike alert when an adult eligibility screening is submitted
 * (dashboard or tokenized questionnaire — not the new-application path).
 *
 * WAP-170: the alert carries who submitted, the quick-fit flag, the answer
 * count and a link to the admin review page. The answers themselves stay in
 * the database.
 */

import { escapeHtml } from '@/lib/email/escapeHtml';
import { eligibilityScreeningSummaryHtml } from './eligibility-screening-summary';
import type { EligibilityScreeningFields } from '@/lib/apply/eligibilityScreeningFields';
import { PUBLIC_LEAD_RETENTION_DAYS } from '@/lib/retention/config';

export function eligibilityScreeningAdminAlertHtml(params: {
  memberName: string;
  memberEmail: string;
  memberId?: string | null;
  source: 'dashboard' | 'token' | 'apply';
  eligibility?: EligibilityScreeningFields | null;
  /** WAP-172: public_wioa_screenings row id for a no-account lead. */
  leadRecordId?: string | null;
}): string {
  const { memberName, memberEmail, memberId, source, eligibility, leadRecordId } = params;
  const sourceLabel =
    source === 'dashboard'
      ? 'member portal (/dashboard/eligibility)'
      : source === 'token'
        ? 'public tokenized questionnaire (/q/…)'
        : 'apply signup';
  const summary = eligibilityScreeningSummaryHtml(eligibility);
  const reviewBlock = memberId
    ? `<p><a href="https://www.workforceap.org/admin/members/${encodeURIComponent(memberId)}">Review the answers on the member's admin page</a></p>`
    : leadRecordId
      ? `<p>This person has no member account yet. Their answers are held in the public screening store (record ${escapeHtml(leadRecordId)}) for ${PUBLIC_LEAD_RETENTION_DAYS} days.</p>`
      : '';
  return `
    <p>An adult eligibility screening was submitted.</p>
    <p><strong>Member:</strong> ${escapeHtml(memberName)}</p>
    <p><strong>Email:</strong> ${escapeHtml(memberEmail)}</p>
    <p><strong>Source:</strong> ${escapeHtml(sourceLabel)}</p>
    ${summary}
    ${reviewBlock}
    <p>For privacy, this alert does not include the answers.</p>
  `.trim();
}
