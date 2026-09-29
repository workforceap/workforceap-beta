/**
 * Applicant chase emails after the Day-3 follow-up (WAP-167).
 *
 * Production on 2026-09-18: 75 applications pending at a 115-day median and
 * the only automated chase stopped at day 6. These two later chases keep the
 * applicant informed without promising a review date we cannot keep (see
 * emails/applicant-followup.ts and docs/PRODUCT_STAKES.md, "Apply follow-up
 * promises"). No eligibility language: eligibility is the workforce board's
 * determination, not ours.
 */

import { escapeHtml } from '@/lib/email/escapeHtml';

export type ApplicantChaseStage = 'day10' | 'day20';

export const APPLICANT_CHASE_SUBJECT: Record<ApplicantChaseStage, string> = {
  day10: 'Your WorkforceAP application is still in our queue',
  day20: "We haven't forgotten your WorkforceAP application",
};

export const APPLICANT_CHASE_TITLE: Record<ApplicantChaseStage, string> = {
  day10: 'Your application is still in our queue',
  day20: "We haven't forgotten you",
};

/**
 * `programUrl` is My Program (/dashboard/program): the program picker lives
 * there, so both program-choice links open it directly instead of sending the
 * applicant to the member home to hunt for it.
 */
export function applicantChaseHtml(params: { firstName: string; stage: ApplicantChaseStage; programUrl: string }): string {
  const first = escapeHtml(params.firstName);
  const program = escapeHtml(params.programUrl);
  const contact = `<p>Questions, or has your situation changed? Reply to this email, call <a href="tel:+15127771808">(512) 777-1808</a> or write to <a href="mailto:info@workforceap.org">info@workforceap.org</a>.</p>`;

  if (params.stage === 'day10') {
    return `
    <p>Hi ${first},</p>
    <p>Your application to the Workforce Advancement Project is still in our review queue. We're sorry it is taking longer than you probably expected, and we wanted you to hear that from us rather than from silence.</p>
    <p>Two things help a counselor pick your application up faster:</p>
    <ul>
      <li><a href="${program}">Choose the career program you want</a> in My Program, if you haven't yet.</li>
      <li>Make sure the phone number and email on your profile are ones you check.</li>
    </ul>
    <p>We'll email you as soon as a counselor has reviewed your application.</p>
    ${contact}
    `.trim();
  }

  return `
    <p>Hi ${first},</p>
    <p>It has been a few weeks since you applied to the Workforce Advancement Project, and your application is still waiting for a counselor. We haven't forgotten you, and we know the wait is frustrating.</p>
    <p>If you're still interested, you don't need to do anything: your application stays in the queue and we'll email you when it has been reviewed. If you'd like to make sure it isn't missing anything, <a href="${program}">confirm your program choice in My Program</a> and make sure the phone number and email on your profile are current.</p>
    <p>If you've found another path in the meantime, just reply and let us know so we can close your application.</p>
    ${contact}
  `.trim();
}
