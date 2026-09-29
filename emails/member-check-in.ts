/**
 * Member check-in nudge — yellow tier, day 4.
 * Tone: friendly reminder that they were here last week.
 */

import { escapeHtml } from '@/lib/email/escapeHtml';

/** Default button label and lead line: the at-risk check-in links /dashboard. */
export const MEMBER_CHECK_IN_DEFAULT_CTA_TEXT = 'Open my dashboard';
export const MEMBER_CHECK_IN_DEFAULT_LEAD_TEXT = 'Your dashboard is ready when you are:';

/**
 * `ctaText` and `leadText` must name where `dashboardUrl` goes. Callers that
 * link somewhere other than the member home (e.g. the no-program stall nudge,
 * which opens My Program) pass their own; the defaults describe /dashboard.
 */
export function memberCheckInHtml(params: {
  firstName: string;
  dashboardUrl: string;
  ctaText?: string;
  leadText?: string;
}): string {
  const {
    firstName,
    dashboardUrl,
    ctaText = MEMBER_CHECK_IN_DEFAULT_CTA_TEXT,
    leadText = MEMBER_CHECK_IN_DEFAULT_LEAD_TEXT,
  } = params;
  return `
    <p>Hi ${escapeHtml(firstName)},</p>
    <p>We saw you last week &mdash; keep going. A few days off is normal; momentum comes back quickly once you log a single course session or open one job lead.</p>
    <p>${escapeHtml(leadText)}</p>
    <p style="margin-top:1.25rem;">
      <a href="${escapeHtml(dashboardUrl)}" style="display:inline-block;padding:0.7rem 1.1rem;background:#231f20;color:#fff;text-decoration:none;border-radius:6px;font-size:0.95rem;font-weight:600;">${escapeHtml(ctaText)}</a>
    </p>
    <p style="margin-top:1rem;font-size:0.85rem;color:#584144;">Stuck on something? Reply to this email and your counselor will get back to you.</p>
  `.trim();
}

export const memberCheckInSubject = 'We saw you last week — keep going';
