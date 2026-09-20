import type { Prisma } from '@prisma/client';

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
