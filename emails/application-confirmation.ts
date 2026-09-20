/**
 * Application confirmation / first membership email — sent after apply signup.
 * Applicant-facing body is the ops welcome letter for people who apply and
 * receive a membership. Staff alerts stay in their own templates.
 */

import { escapeHtml } from '@/lib/email/escapeHtml';
import { eligibilityScreeningSummaryHtml } from './eligibility-screening-summary';
import { memberWelcomeLetterHtml } from './member-welcome-letter';
import type { EligibilityScreeningFields } from '@/lib/apply/eligibilityScreeningFields';

export function applicationConfirmationHtml(params: {
  firstName: string;
  /** WS4 adult eligibility answers when collected on apply. */
  eligibility?: EligibilityScreeningFields | null;
  /** Optional application id shown in the on-file receipt line. */
  applicationId?: string | null;
}): string {
  const { firstName, eligibility, applicationId } = params;
  const eligibilityBlock = eligibilityScreeningSummaryHtml(eligibility, {
    heading: 'Eligibility screening received',
  });
  const applicationRef = applicationId
    ? ` Your application id is <strong>${escapeHtml(applicationId)}</strong>.`
    : '';
  return `
    <p>Hi ${escapeHtml(firstName)},</p>
    ${memberWelcomeLetterHtml()}
    ${eligibilityBlock}
    <p>Your application is on file.${applicationRef} A WorkforceAP staff member usually looks at your goals and program interest within about 1&ndash;2 business days.</p>
    <p>If you do not hear from an advisor after about 2 business days, call or email and we will check your application with you.</p>
  `.trim();
}
