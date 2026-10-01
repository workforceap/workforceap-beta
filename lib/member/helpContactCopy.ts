/**
 * Member-facing copy for the "Need a person?" card on /dashboard/help:
 * "Request help" (POST /api/member/request-help) and "Share feedback"
 * (POST /api/member/feedback).
 *
 * The help route emails the counselor on the member's active assignment, or
 * the WorkforceAP team inbox when there is none (lib/member/helpRequestRecipient.ts
 * decides which, for both the route and the page). The email carries the
 * member's name, email address and program plus a link to their record; it
 * does not carry a phone number or a message, and nothing replies on a
 * schedule. Feedback is a saved `MemberFeedback` row that WorkforceAP staff
 * read on the admin-only /admin/feedback page; no counselor-facing page shows
 * it, so the copy does not name the counselor as a reader. It is not a message.
 * This copy says exactly that and never promises a reply time.
 *
 * Client-safe: no Prisma, no server imports.
 */

/** The shared team inbox a help request falls back to. Also the public contact address on /dashboard/help. */
export const HELP_REQUEST_TEAM_EMAIL = 'info@workforceap.org';

/**
 * Who a help request reaches, as the member may see it. The counselor's email
 * address never leaves the server; only the saved name does.
 */
export type HelpRequestAudience = { kind: 'counselor'; name: string | null } | { kind: 'team' };

/**
 * What the route reports it emailed: `sentTo` (the kind) and `sentToName` (the
 * counselor's saved name, `null` for the team or an unnamed counselor) in its
 * JSON reply.
 */
export type HelpRequestSent = { to: HelpRequestAudience['kind']; name: string | null };

const WHAT_WE_SEND = 'We email them your name, email address and program.';

/**
 * One sentence (plus the "what we send" line) describing where the request
 * goes. `null` = the page could not work out the recipient, so the copy names
 * both possibilities instead of guessing.
 */
export function helpRequestDescription(audience: HelpRequestAudience | null): string {
  if (!audience) {
    return `Ask your counselor to get in touch with you. If you do not have a counselor yet, the request goes to the WorkforceAP team instead. ${WHAT_WE_SEND}`;
  }
  if (audience.kind === 'team') {
    return `You do not have a counselor yet, so the request goes to the WorkforceAP team at ${HELP_REQUEST_TEAM_EMAIL}. ${WHAT_WE_SEND}`;
  }
  const who = audience.name ? `your counselor, ${audience.name},` : 'your counselor';
  return `Ask ${who} to get in touch with you. ${WHAT_WE_SEND}`;
}

/**
 * Confirmation after a successful send. The route's own report wins over what
 * the page rendered with (an assignment can change between page load and
 * click). A counselor is named only when the route's `sentToName` is the same
 * name the page showed; any other counselor — or an older deploy that sends
 * no name — is "your counselor", never a guess.
 */
export function helpRequestSentNotice(sent: HelpRequestSent | null, audience: HelpRequestAudience | null): string {
  if (!sent) return 'Request sent.';
  if (sent.to === 'team') return 'Request sent. We emailed the WorkforceAP team.';
  const shown = audience?.kind === 'counselor' ? audience.name : null;
  return shown && sent.name === shown ? `Request sent. We emailed ${shown}.` : 'Request sent. We emailed your counselor.';
}

/**
 * Who can read a feedback submission. Only the admin-only /admin/feedback page
 * shows `MemberFeedback`, so this names staff whatever the member's counselor
 * state (no "only": counselors are staff too, and the raw admin API is
 * counselor-scoped). Name the counselor only once a counselor-facing feedback
 * view ships.
 */
export const FEEDBACK_READERS_SENTENCE = 'WorkforceAP staff can read what you send.';

/** Failure copy that does not pretend a retry will work sooner than it will. */
export const HELP_REQUEST_FAILURE = {
  /** 429: the shared contact limiter refused this connection. */
  limited: 'We could not send another request right now. Try again later, or send a message instead.',
  /** 5xx / unexpected: email not configured or the send failed. */
  failed: 'We could not send your request. Try again later, or send a message instead.',
} as const;
