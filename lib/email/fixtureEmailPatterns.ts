/**
 * Fixture / seeded-account email patterns, shared by the email sender
 * (`isFixtureEmailRecipient` in lib/email/send.ts) and the member-only roster
 * filter (`MEMBER_ONLY_WHERE` in lib/admin/memberOnlyWhere.ts). One source so a
 * QA login that never receives mail is never counted as a member either
 * (Mike, 2026-09-20: "make sure test members get cut out").
 *
 * Pure module on purpose: no environment reads, no `server-only`, no Prisma,
 * so a where helper can import it without pulling in the mail stack. The
 * sender adds its env-configured domains and addresses on top of these.
 */

/** Domains whose every address is a fixture. */
export const FIXTURE_EMAIL_DOMAINS = ['example.com', 'test', 'invalid', 'localhost'] as const;

/** Local-part prefixes seeded by the smoke, referral and matching fixtures. */
export const FIXTURE_LOCAL_PART_PREFIXES = ['test-smoke-', 'referral-member-', 'match-candidate'] as const;

/** `<role>-test@<sending domain>` portal QA logins (member-test, employer-test, ...). */
export const FIXTURE_LOCAL_PART_SUFFIX = '-test';

/** The production sending domain the `-test` suffix rule applies to. */
export const WORKFORCEAP_SENDING_DOMAIN = 'workforceap.org';

/** True when a bare local part (the text before `@`) is a seeded fixture alias. */
export function hasFixtureLocalPart(localPart: string): boolean {
  const local = localPart.trim().toLowerCase();
  return FIXTURE_LOCAL_PART_PREFIXES.some((prefix) => local.startsWith(prefix));
}
