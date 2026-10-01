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
    <p>Your application is on file.${applicationRef} A counselor reviews every application. You&rsquo;ll get an email when a decision is made.</p>
    <p>If you do not hear from us after 5 business days, call or email and we will check your application with you.</p>
  `.trim();
}
