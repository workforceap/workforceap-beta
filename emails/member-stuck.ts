/**
 * Member stuck nudge — red 14d+ OR stalled training.
 * Offers the configured calendar or the existing member counselor inbox.
 */

import { escapeHtml } from '@/lib/email/escapeHtml';
import { getCounselorContactLink } from '@/lib/counselor/bookingLink';

export function memberStuckHtml(params: {
  firstName: string;
  counselorName: string;
  calendarUrl?: string;
}): string {
  const {
    firstName,
    counselorName,
    calendarUrl,
  } = params;
  const contact = getCounselorContactLink(calendarUrl);
  const nextStep = contact.kind === 'booking'
    ? `Book 15 minutes with ${escapeHtml(counselorName)}.`
    : `Send ${escapeHtml(counselorName)} a message to arrange a time to talk.`;
  return `
    <p>Hi ${escapeHtml(firstName)},</p>
    <p>Let&rsquo;s get unstuck. When training stalls for a couple of weeks, almost every time it&rsquo;s one specific blocker &mdash; tech, schedule, a confusing module, or just not knowing what&rsquo;s next.</p>
    <p>${nextStep} We&rsquo;ll figure out the blocker and a real next step you can do this week:</p>
    <p style="margin-top:1.25rem;">
      <a href="${escapeHtml(contact.url)}" style="display:inline-block;padding:0.7rem 1.1rem;background:#231f20;color:#fff;text-decoration:none;border-radius:6px;font-size:0.95rem;font-weight:600;">${contact.label}</a>
    </p>
    <p style="margin-top:1rem;font-size:0.85rem;color:#584144;">If a call doesn&rsquo;t work, reply to this email with the best time and we&rsquo;ll coordinate.</p>
  `.trim();
}

export const memberStuckSubject = "Let's get unstuck — talk with your counselor";
