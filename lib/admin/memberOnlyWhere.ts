import { Prisma } from '@prisma/client';
import {
  FIXTURE_EMAIL_DOMAINS,
  FIXTURE_LOCAL_PART_PREFIXES,
  FIXTURE_LOCAL_PART_SUFFIX,
  WORKFORCEAP_SENDING_DOMAIN,
} from '@/lib/email/fixtureEmailPatterns';

/**
 * Hand-made test accounts with real-looking addresses that no pattern can
 * catch. Excluded from every member count and funder aggregate. Read from
 * production on 2026-09-20 (role = member, display names "Member Success",
 * "Invite Debug Test", "Test Member"); `mbrown@hsconglomerates.com` no longer
 * exists there and stays only so an old export cannot resurrect it.
 */
export const MEMBER_ONLY_EXCLUDED_EMAILS = [
  'member.success@workforceap.org',
  'mbrown@hsconglomerates.com',
  'mabrown040+acceptprobe1775588012212@gmail.com',
  'mbrown@hsconsultingtx.com',
] as const;

/** The seeded fixture domain that shows up on role = member rows (`employer-preview@example.com`). */
const SEEDED_FIXTURE_DOMAIN = 'example.com' satisfies (typeof FIXTURE_EMAIL_DOMAINS)[number];

/**
 * SQL `LIKE` patterns for seeded / QA member accounts, derived from the same
 * constants the email sender uses to skip fixture recipients
 * (lib/email/fixtureEmailPatterns.ts), so the two can never drift:
 * `%-test@workforceap.org`, `test-smoke-%`, `referral-member-%`,
 * `match-candidate%`, `%@example.com`. Emails are stored lower-case (the
 * `users_email_lower_unique` index; 0 of 134 production rows differ from
 * `lower(email)` on 2026-09-20), so a case-sensitive match is exact.
 */
export const MEMBER_ONLY_EXCLUDED_EMAIL_PATTERNS = [
  `%${FIXTURE_LOCAL_PART_SUFFIX}@${WORKFORCEAP_SENDING_DOMAIN}`,
  ...FIXTURE_LOCAL_PART_PREFIXES.map((prefix) => `${prefix}%`),
  `%@${SEEDED_FIXTURE_DOMAIN}`,
] as const;

/** Prisma twin of {@link MEMBER_ONLY_EXCLUDED_EMAIL_PATTERNS}: one `NOT` entry per pattern. */
export const MEMBER_ONLY_EXCLUDED_EMAIL_NOT = [
  { email: { endsWith: `${FIXTURE_LOCAL_PART_SUFFIX}@${WORKFORCEAP_SENDING_DOMAIN}` } },
  ...FIXTURE_LOCAL_PART_PREFIXES.map((prefix) => ({ email: { startsWith: prefix } })),
  { email: { endsWith: `@${SEEDED_FIXTURE_DOMAIN}` } },
] satisfies Prisma.UserWhereInput[];

/**
 * The complete fixture-email exclusion for a `prisma.user` where: the explicit
 * list plus every seeded pattern. Spread it wherever an email-only exclusion
 * is needed without the role predicate (stale-application work queue).
 */
export const MEMBER_ONLY_EMAIL_WHERE = {
  email: { notIn: [...MEMBER_ONLY_EXCLUDED_EMAILS] },
  NOT: MEMBER_ONLY_EXCLUDED_EMAIL_NOT,
} satisfies Prisma.UserWhereInput;

/**
 * Profile roles that are staff or partner-side accounts. They never count as
 * applicants, students or roster members on admin and counselor surfaces
 * (admin audit 2026-09-20, 4.1/4.2). `Profile.role` is a free string column,
 * so this list is the repo's role vocabulary for that exclusion.
 */
export const STAFF_PROFILE_ROLES = ['admin', 'super_admin', 'counselor', 'employer', 'partner'] as const;

/**
 * Strict member filter used by funder / grant exports (WIOA cohort CSV, etc.)
 * and by the member rosters and counts that must agree with each other
 * (/admin/overview tiles, /admin/students, Command Center program health,
 * counselor caseload fallback). Only profile.role === 'member' rows count, so
 * every `STAFF_PROFILE_ROLES` account is excluded.
 *
 * Reach for this on every `prisma.user` where and on every `user: { ... }`
 * relation filter that feeds a member count, a placement figure or an
 * outcome rate (number audit 2026-09-20, F1-F9). For queries that run on
 * `prisma.profile` use {@link memberOnlyProfileWhere}; for raw SQL use
 * {@link memberOnlySqlJoin}.
 */
export const MEMBER_ONLY_WHERE = {
  profile: { role: 'member' },
  ...MEMBER_ONLY_EMAIL_WHERE,
} satisfies Prisma.UserWhereInput;

/**
 * Member-or-dogfood-admin filter used by admin-facing surfaces (/admin/members,
 * /admin/pipeline, etc.). Includes:
 *  - any profile.role === 'member' (real members)
 *  - admin / super_admin accounts (dogfooders — they need to find themselves
 *    in the admin UI to test member surfaces with their own Coursera data)
 *
 * Funder-facing exports must keep using `MEMBER_ONLY_WHERE` so admin rows
 * never leak into WIOA / outcome reports.
 */
export const MEMBER_OR_DOGFOOD_WHERE = {
  profile: { role: { in: ['member', 'admin', 'super_admin'] } },
  ...MEMBER_ONLY_EMAIL_WHERE,
} satisfies Prisma.UserWhereInput;

/**
 * The same member-only population expressed for queries that run on
 * `prisma.profile` (the board demographics groupBys). `role` sits directly on
 * the profile row; the fixture-email exclusion and any caller filter
 * (enrolled, org, period) apply through the `user` relation.
 */
export function memberOnlyProfileWhere(user: Prisma.UserWhereInput = {}): Prisma.ProfileWhereInput {
  return {
    role: 'member',
    user: { ...user, ...MEMBER_ONLY_EMAIL_WHERE },
  };
}

const SQL_IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

function sqlIdentifier(alias: string): Prisma.Sql {
  if (!SQL_IDENTIFIER.test(alias)) throw new Error(`Invalid SQL alias: ${alias}`);
  return Prisma.raw(alias);
}

/**
 * Raw-SQL twin of {@link MEMBER_ONLY_EMAIL_WHERE}: `u.email NOT IN (...)` for
 * the explicit list plus one parameterised `NOT LIKE` per seeded pattern.
 * Use it in any hand-written query that filters `users` without going through
 * {@link memberOnlySqlJoin} (job-ready candidates, partner attention, funder
 * at-risk by program, public impact stats).
 */
export function memberOnlyEmailSql(userAlias = 'u'): Prisma.Sql {
  const u = sqlIdentifier(userAlias);
  const notLike = MEMBER_ONLY_EXCLUDED_EMAIL_PATTERNS.map((pattern) => Prisma.sql`AND ${u}.email NOT LIKE ${pattern}`);
  return Prisma.sql`${u}.email NOT IN (${Prisma.join([...MEMBER_ONLY_EXCLUDED_EMAILS])}) ${Prisma.join(notLike, ' ')}`;
}

/**
 * Raw-SQL twin of {@link MEMBER_ONLY_WHERE}: an INNER JOIN on `profiles` that
 * keeps only `role = 'member'` rows and drops the fixture emails and seeded
 * patterns. Place it
 * after the `users` table (default alias `u`) has been joined:
 *
 *   FROM placement_records pr
 *   INNER JOIN users u ON u.id = pr.user_id
 *   ${memberOnlySqlJoin()}
 *   WHERE ...
 *
 * `profileAlias` defaults to `member_profile` so it never collides with a
 * caller's own `p` alias.
 */
export function memberOnlySqlJoin(userAlias = 'u', profileAlias = 'member_profile'): Prisma.Sql {
  const u = sqlIdentifier(userAlias);
  const p = sqlIdentifier(profileAlias);
  return Prisma.sql`INNER JOIN profiles ${p} ON ${p}.user_id = ${u}.id AND ${p}.role = 'member' AND ${memberOnlyEmailSql(userAlias)}`;
}
