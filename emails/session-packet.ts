/**
 * In-office session packet email.
 *
 * Sent to a member at the end of a counselor/admin walk-in or existing-member
 * session. Contains the resume, cover letter, and/or interview prep questions
 * the counselor and member built together — whatever was generated during
 * the session.
 *
 * Per /plan-ceo-review reframe: "they should get email file of everything,
 * a-to-z in 30 min feeling." The member walks out of the office with a real
 * deliverable, then the email cements it: "we built this with you, here it is."
 */

import { escapeHtml } from '@/lib/email/escapeHtml';

/**
 * Where the packet's portal link lands: the member's AI tool history ("My AI
 * results"), which lists the results saved from the session. It is the same page
 * the dashboard's in-office session card opened, and the email copy names it
 * so the member knows what they will find there.
 */
export const SESSION_PACKET_PORTAL_PATH = '/dashboard/ai-tools/history';

export type SessionPacketSection = {
  /** Display label e.g. "Polished resume" */
  title: string;
  /** Optional sub-label e.g. "Tailored to: Senior Software Engineer at Acme" */
  contextLine?: string | null;
  /** Plain text or HTML-safe body. Newlines preserved. */
  body: string;
  /** If true, body is rendered as a numbered list (used for interview questions). */
  asList?: { items: Array<{ heading: string; tip?: string; exampleAnswer?: string }> };
};

export function sessionPacketHtml(params: {
  firstName: string;
  counselorName: string;
  sessionDate: string;
  sections: SessionPacketSection[];
  portalUrl: string;
}): string {
  const { firstName, counselorName, sessionDate, sections, portalUrl } = params;

  const renderedSections = sections.map((s) => {
    const contextHtml = s.contextLine
      ? `<p style="margin: 0 0 0.5rem; font-size: 14px; color: #525252;">${escapeHtml(s.contextLine)}</p>`
      : '';
    if (s.asList) {
      const items = s.asList.items
        .map((item, i) => {
          const heading = `<p style="margin: 0; font-weight: 600; color: #1a1a1a;">${i + 1}. ${escapeHtml(item.heading)}</p>`;
          const tip = item.tip
            ? `<p style="margin: 4px 0 0; color: #525252; font-size: 14px;"><em>Tip:</em> ${escapeHtml(item.tip)}</p>`
            : '';
          const example = item.exampleAnswer
            ? `<p style="margin: 4px 0 0; color: #525252; font-size: 14px;"><em>Sample answer:</em> ${escapeHtml(item.exampleAnswer)}</p>`
            : '';
          return `<div style="margin: 0 0 12px;">${heading}${tip}${example}</div>`;
        })
        .join('');
      return `
        <h2 style="margin: 24px 0 8px; font-size: 18px; color: #1a1a1a;">${escapeHtml(s.title)}</h2>
        ${contextHtml}
        ${items}
      `;
    }
    return `
      <h2 style="margin: 24px 0 8px; font-size: 18px; color: #1a1a1a;">${escapeHtml(s.title)}</h2>
      ${contextHtml}
      <pre style="white-space: pre-wrap; word-break: break-word; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 14px; line-height: 1.55; color: #1a1a1a; margin: 0; background: #fafafa; border-radius: 8px; padding: 16px;">${escapeHtml(s.body)}</pre>
    `;
  });

  return `
    <p>Hi ${escapeHtml(firstName)},</p>
    <p>Here&rsquo;s the packet from your session with <strong>${escapeHtml(counselorName)}</strong> on ${escapeHtml(sessionDate)}. Everything we built together is below — and it is saved in your member portal, so you can sign in anytime to refine it, run more practice questions, or apply to jobs.</p>
    ${renderedSections.join('\n')}
    <p style="margin-top: 32px;">To see your results from this session again, sign in and open My AI results:</p>
    <p style="margin: 8px 0 24px;"><a href="${escapeHtml(portalUrl)}" style="color: #ad2c4d; font-weight: 600;">${escapeHtml(portalUrl)}</a></p>
    <p>You&rsquo;ve got this.</p>
    <p style="margin-top: 24px; color: #737373; font-size: 14px;">— The WorkforceAP team</p>
  `.trim();
}
