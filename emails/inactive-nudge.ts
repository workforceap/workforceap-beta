/**
 * Inactive member nudge email body HTML.
 */

import { escapeHtml } from '@/lib/email/escapeHtml';
import { memberStartHereHtml } from './application-confirmation';

export function inactiveNudgeHtml(params: { firstName: string }): string {
  const { firstName } = params;
  // Ops (10/8/26): most nudged members never logged in at all, so "pick up
  // where you left off" gave them nowhere to start. Lead with the two first
  // steps (same box as the welcome email), each one tap from here.
  return `
    <p>Hi ${escapeHtml(firstName)},</p>
    <p>We miss you. Life gets busy, and we know workforce training has to fit around the rest of it &mdash; your job, your family, the unexpected stuff.</p>
    <p>Your spot in WorkforceAP is still here whenever you&rsquo;re ready. If you haven&rsquo;t started yet, begin with these two steps:</p>
    ${memberStartHereHtml()}
    <p>Already started? Log in to pick up where you left off, or message your counselor if something is in the way.</p>
    <p>If reaching out feels easier, email <a href="mailto:info@workforceap.org">info@workforceap.org</a> and we&rsquo;ll help you find a path forward.</p>
  `.trim();
}
