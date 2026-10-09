/**
 * Application confirmation / first membership email — sent after apply signup.
 * Applicant-facing body is the ops welcome letter for people who apply and
 * receive a membership. Staff alerts stay in their own templates.
 */

import { escapeHtml } from '@/lib/email/escapeHtml';
import { eligibilityScreeningSummaryHtml } from './eligibility-screening-summary';
import { memberWelcomeLetterHtml } from './member-welcome-letter';
import type { EligibilityScreeningFields } from '@/lib/apply/eligibilityScreeningFields';

const PORTAL_LOGIN = 'https://www.workforceap.org/login';
const portalLink = (path: string) => `${PORTAL_LOGIN}?redirectTo=${encodeURIComponent(path)}`;

/**
 * Ops (10/8/26): new members "just become a member and don't know what to do
 * from there" (101 of 141 never logged in again). Lead with the two things to
 * do first, each one tap from the email, before the full welcome letter.
 */
export function memberStartHereHtml(): string {
  const button = (href: string, label: string) =>
    `<a href="${href}" style="display:inline-block;background:#4a9b4f;color:#ffffff;text-decoration:none;font-weight:700;padding:10px 16px;border-radius:6px;margin:4px 0;">${label}</a>`;
  return `
    <div style="border:2px solid #4a9b4f;border-radius:8px;padding:14px 16px;margin:0 0 18px;">
      <p style="margin:0 0 8px;"><strong>Start here: your first two steps</strong></p>
      <p style="margin:0 0 4px;"><strong>1. Take your WIOA Preassessment</strong> (35 questions). Your counselor uses it for WIOA funding review and to place you in the right training. Your answers save as you go.</p>
      <p style="margin:0 0 12px;">${button(portalLink('/dashboard/assessment'), 'Start the preassessment')}</p>
      <p style="margin:0 0 4px;"><strong>2. Try the free AI Career Tools</strong>: score and rewrite your resume, practice interviews by voice, write a cover letter for any job, and see how well you match a job posting.</p>
      <p style="margin:0;">${button(portalLink('/dashboard/ai-tools'), 'Open the AI Career Tools')}</p>
    </div>
  `.trim();
}

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
    ${memberStartHereHtml()}
    ${memberWelcomeLetterHtml()}
    ${eligibilityBlock}
    <p>Your application is on file.${applicationRef} A counselor reviews every application. You&rsquo;ll get an email when a decision is made.</p>
    <p>If you do not hear from us after 5 business days, call or email and we will check your application with you.</p>
  `.trim();
}
