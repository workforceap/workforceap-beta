/**
 * WIOA Preassessment login gate (ops, 10/8/26).
 *
 * Members were joining and never finding the 35-question preassessment
 * (4 of 141 had taken it). Ops asked: prompt on each of the first 5 logins,
 * then require it from the 6th login on, before anything else.
 *
 * Pure so the counting rule is testable without a database. The login count
 * is the number of `member_logged_in` MemberEvent rows, written by every
 * sign-in path (password, MFA, OAuth callback).
 */

/** Logins 1..PROMPT_LOGINS get a dismissible prompt; later logins are gated. */
export const PREASSESSMENT_PROMPT_LOGINS = 5;

export type PreassessmentGate = 'none' | 'prompt' | 'require';

export function preassessmentGateFor(input: {
  assessmentCompleted: boolean;
  /** `member_logged_in` events for this member, including the current one. */
  loginCount: number;
  /** Staff, partners and employers browsing the member portal are never gated. */
  isStaffOrNonMember: boolean;
}): PreassessmentGate {
  if (input.assessmentCompleted || input.isStaffOrNonMember) return 'none';
  return input.loginCount > PREASSESSMENT_PROMPT_LOGINS ? 'require' : 'prompt';
}

/**
 * Routes a gated member can still reach: the preassessment itself, plus the
 * ways to get help or leave (ops: nobody is locked out from asking for help).
 */
const GATE_ALLOWED_PREFIXES = [
  '/dashboard/assessment',
  '/dashboard/messages',
  '/dashboard/help',
  '/dashboard/profile',
  '/dashboard/settings',
  '/dashboard/counselor',
] as const;

export function isAllowedWhilePreassessmentRequired(pathname: string): boolean {
  const path = pathname.replace(/^\/(en|es|fr|pt)(?=\/)/, '').replace(/\/+$/, '') || '/';
  return GATE_ALLOWED_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

/** One prompt per browser session; the session key holds the login count it was dismissed at. */
export const PREASSESSMENT_PROMPT_DISMISS_KEY = 'wap.preassessmentPromptDismissedAt';
