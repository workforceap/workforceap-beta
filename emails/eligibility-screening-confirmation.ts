/**
 * Applicant confirmation after adult eligibility screening is submitted
 * (dashboard / tokenized questionnaire paths — apply signup uses application-confirmation).
 *
 * WAP-170: the receipt confirms how many answers were saved and where to review
 * them. It never repeats the answers, so a forwarded or leaked inbox cannot
 * disclose them.
 */

import { escapeHtml } from '@/lib/email/escapeHtml';
import {
  eligibilityScreeningAnswerCount,
  type EligibilityScreeningFields,
} from '@/lib/apply/eligibilityScreeningFields';

export function eligibilityScreeningConfirmationHtml(params: {
  firstName: string;
  eligibility?: EligibilityScreeningFields | null;
}): string {
  const { firstName, eligibility } = params;
  const count = eligibilityScreeningAnswerCount(eligibility);
  const receipt =
    count > 0
      ? `<p>We saved ${count} answer${count === 1 ? '' : 's'}. For your privacy this email does not repeat them — you can review or update them any time from your member portal after logging in.</p>`
      : '<p>You can update your answers any time from your member portal after logging in.</p>';
  return `
    <p>Hi ${escapeHtml(firstName)},</p>
    <p>Thanks — we received your eligibility questionnaire. Our team will use your answers to keep your WorkforceAP membership file current.</p>
    ${receipt}
    <p>Questions? Call <a href="tel:+15127771808">(512) 777-1808</a> or email <a href="mailto:info@workforceap.org">info@workforceap.org</a>.</p>
  `.trim();
}
