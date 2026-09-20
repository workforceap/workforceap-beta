import { Prisma } from '@prisma/client';

/** Fixture / demo accounts excluded from grant and funder aggregates. */
export const MEMBER_ONLY_EXCLUDED_EMAILS = [
  'member.success@workforceap.org',
  'mbrown@hsconglomerates.com',
] as const;

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
  email: { notIn: [...MEMBER_ONLY_EXCLUDED_EMAILS] },
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
  email: { notIn: [...MEMBER_ONLY_EXCLUDED_EMAILS] },
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
    user: { ...user, email: { notIn: [...MEMBER_ONLY_EXCLUDED_EMAILS] } },
  };
}

const SQL_IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

function sqlIdentifier(alias: string): Prisma.Sql {
  if (!SQL_IDENTIFIER.test(alias)) throw new Error(`Invalid SQL alias: ${alias}`);
  return Prisma.raw(alias);
}

/**
 * Raw-SQL twin of {@link MEMBER_ONLY_WHERE}: an INNER JOIN on `profiles` that
 * keeps only `role = 'member'` rows and drops the fixture emails. Place it
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
  return Prisma.sql`INNER JOIN profiles ${p} ON ${p}.user_id = ${u}.id AND ${p}.role = 'member' AND ${u}.email NOT IN (${Prisma.join([...MEMBER_ONLY_EXCLUDED_EMAILS])})`;
}
