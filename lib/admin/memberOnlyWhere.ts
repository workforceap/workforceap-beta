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

/** The one role name that means "a member" in both stores: `roles.name` and `profiles.role`. */
export const MEMBER_ROLE_NAME = 'member';

/** `admin` / `super_admin` profiles that admin surfaces keep next to members (dogfooders). */
export const DOGFOOD_PROFILE_ROLES = ['admin', 'super_admin'] as const;

/**
 * Every role in the repo's vocabulary that is not `member`. A `profiles.role`
 * drawn from this list is a staff or partner-side account and is never a
 * member, whatever `user_roles` rows the account also carries — that is the
 * `resolveEffectiveRole` precedence (lib/auth/roleAccess.ts) expressed as a
 * query predicate. Superset of {@link STAFF_PROFILE_ROLES}: it also covers
 * `case_manager`.
 *
 * Spelled out rather than derived from `ROLE_PRECEDENCE` so this query module
 * stays free of the auth module (route specs partial-mock
 * `@/lib/auth/roleAccess`, and importing it here breaks their mocks).
 * `memberOnlyWhere.test.ts` asserts the two lists stay in step.
 */
export const NON_MEMBER_PROFILE_ROLES = [
  'super_admin',
  'admin',
  'case_manager',
  'counselor',
  'employer',
  'partner',
] as const;

const DOGFOOD_EXCLUDED_PROFILE_ROLES = NON_MEMBER_PROFILE_ROLES.filter(
  (role) => !(DOGFOOD_PROFILE_ROLES as readonly string[]).includes(role),
);

/**
 * "A member" as one definition, for `prisma.user` wheres (WAP-182 item 3).
 *
 * #2433 made `user_roles` the source of truth for role *resolution*
 * (`getProfileRole` -> `resolveEffectiveRole`), while every member *count*
 * still filtered on `profiles.role = 'member'`. Two live definitions
 * disagree, so funder-facing and board-facing figures drift depending on
 * which path produced them. The one definition is "a member per either
 * store, minus staff-by-profile":
 *
 *  - a `member` row in `user_roles`, OR `profiles.role = 'member'` as the
 *    fallback for accounts the backfill has not reached yet
 *    (`scripts/backfill-user-roles-from-profile.ts`), AND
 *  - no staff / partner-side `profiles.role`. Every account gets a `member`
 *    row from `ensureAppUser`, so the row alone proves nothing.
 *
 * This is deliberately *not* `resolveEffectiveRole` reproduced. The resolver
 * lets a non-member `user_roles` row outrank `profiles.role`; this predicate
 * never consults non-member rows, so an account whose profile says `member`
 * while its rows name a real role still counts as a member here. That is the
 * intended behaviour: those accounts are WAP-182 item 2, Mike's call about
 * which portal is right, and this change must not decide it for him.
 *
 * Deliberately a fallback and not a hard flip to `user_roles` only: the
 * fallback is correct both before and after the production backfill runs,
 * where a `user_roles`-only rule would silently drop every not-yet-backfilled
 * member out of the counts until it does.
 *
 * ## Why this is expressed as `NOT`
 *
 * The predicate is a union ("either store says member"), but ~148 call sites
 * spread these objects into a `where` and several already set their own
 * top-level `AND` or `OR` there (app/admin/members/page.tsx,
 * app/api/admin/members/export/route.ts, app/api/admin/cohort-export/route.ts).
 * A new top-level `AND` / `OR` key would be silently overwritten by — or
 * would silently overwrite — the caller's, dropping the member filter with no
 * error. `NOT` is the only combinator these objects already own, so the union
 * is stated by De Morgan as "not (neither store says member)". Nested `OR`
 * inside a `NOT` entry is safe: only top-level keys collide.
 */
function memberRoleNotEntries(
  memberProfileRoles: readonly string[],
  excludedProfileRoles: readonly string[],
): Prisma.UserWhereInput[] {
  return [
    // NOT(no member row AND the profile does not name one of these roles)
    //   = a member row exists OR the profile names one.
    {
      userRoles: { none: { role: { name: MEMBER_ROLE_NAME } } },
      OR: [{ profile: null }, { profile: { role: { notIn: [...memberProfileRoles] } } }],
    },
    // A staff / partner-side profile role is never a member, baseline row or not.
    { profile: { role: { in: [...excludedProfileRoles] } } },
  ];
}

/**
 * The role half of {@link MEMBER_ONLY_WHERE}, as `NOT` entries.
 *
 * Eligibility checks — may this account have a placement recorded, be
 * messaged as a member, appear under the directory's "Member" filter — use
 * this half directly as the `NOT` key of their own where
 * (`NOT: MEMBER_ONLY_ROLE_NOT`) rather than a hand-rolled
 * `profile: { role: 'member' }`, so an account the counts call a member is
 * also an account staff can act on. They deliberately skip the fixture-email
 * half: a QA account must stay eligible even though it is never counted.
 * Writing it as an explicit key (not a spread) makes a second `NOT` on the
 * same literal a compile error instead of a silent overwrite.
 */
export const MEMBER_ONLY_ROLE_NOT = memberRoleNotEntries([MEMBER_ROLE_NAME], NON_MEMBER_PROFILE_ROLES);

/**
 * The role half of {@link MEMBER_OR_DOGFOOD_WHERE}, as `NOT` entries. The
 * eligibility twin of {@link MEMBER_ONLY_ROLE_NOT} for operator tooling that
 * admins dogfood with their own learner email (Coursera mapping, skillset sync).
 */
export const MEMBER_OR_DOGFOOD_ROLE_NOT = memberRoleNotEntries(
  [MEMBER_ROLE_NAME, ...DOGFOOD_PROFILE_ROLES],
  DOGFOOD_EXCLUDED_PROFILE_ROLES,
);

/**
 * Strict member filter used by funder / grant exports (WIOA cohort CSV, etc.)
 * and by the member rosters and counts that must agree with each other
 * (/admin/overview tiles, /admin/students, Command Center program health,
 * counselor caseload fallback). Members only, by the one definition above, so
 * every `NON_MEMBER_PROFILE_ROLES` account is excluded.
 *
 * Reach for this on every `prisma.user` where and on every `user: { ... }`
 * relation filter that feeds a member count, a placement figure or an
 * outcome rate (number audit 2026-09-20, F1-F9). For queries that run on
 * `prisma.profile` use {@link memberOnlyProfileWhere}; for raw SQL use
 * {@link memberOnlySqlJoin} or {@link memberOnlyRoleSql}.
 */
export const MEMBER_ONLY_WHERE = {
  ...MEMBER_ONLY_EMAIL_WHERE,
  // One `NOT` key: Prisma takes a single `NOT`, so the email exclusion and the
  // role predicate share the list.
  NOT: [...MEMBER_ONLY_EXCLUDED_EMAIL_NOT, ...MEMBER_ONLY_ROLE_NOT],
} satisfies Prisma.UserWhereInput;

/**
 * Member-or-dogfood-admin filter used by admin-facing surfaces (/admin/members,
 * /admin/pipeline, etc.). Includes:
 *  - anyone who is a member by the one definition above (real members)
 *  - admin / super_admin accounts (dogfooders — they need to find themselves
 *    in the admin UI to test member surfaces with their own Coursera data)
 *
 * Funder-facing exports must keep using `MEMBER_ONLY_WHERE` so admin rows
 * never leak into WIOA / outcome reports.
 */
export const MEMBER_OR_DOGFOOD_WHERE = {
  ...MEMBER_ONLY_EMAIL_WHERE,
  NOT: [...MEMBER_ONLY_EXCLUDED_EMAIL_NOT, ...MEMBER_OR_DOGFOOD_ROLE_NOT],
} satisfies Prisma.UserWhereInput;

/**
 * The same member-only population expressed for queries that run on
 * `prisma.profile` (the board demographics groupBys). The profile row's own
 * `role` is one half of the definition; the `user_roles` half reaches the
 * rows through the `user` relation. The fixture-email exclusion and any
 * caller filter (enrolled, org, period) apply through `user` too.
 *
 * Callers pass the result straight in as `where` (they never spread it), so
 * this one can use `OR` / `NOT` directly.
 *
 * ## Known narrower than {@link MEMBER_ONLY_WHERE}
 *
 * A query on `prisma.profile` can only ever see accounts that have a profile
 * row, so a member named only by a `user_roles` row is invisible here while
 * {@link MEMBER_ONLY_WHERE} counts them. `lib/admin/boardOutcomes.ts` pairs
 * the two: `membersServed` (:185) can exceed the demographics denominator
 * (:206) by exactly that many accounts. The set is empty in production today
 * (`profiles.role` defaults to `member`, so an account with a profile row
 * already satisfies the fallback, and `ensureAppUser` creates both), and it
 * closes for good once the backfill runs. If it ever stops being empty,
 * bucket those accounts as "unknown" in the demographics breakdown rather
 * than letting the two figures drift.
 */
export function memberOnlyProfileWhere(user: Prisma.UserWhereInput = {}): Prisma.ProfileWhereInput {
  return {
    OR: [
      { role: MEMBER_ROLE_NAME },
      { user: { userRoles: { some: { role: { name: MEMBER_ROLE_NAME } } } } },
    ],
    NOT: { role: { in: [...NON_MEMBER_PROFILE_ROLES] } },
    user: { ...user, ...MEMBER_ONLY_EMAIL_WHERE },
  };
}

const SQL_IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

function sqlIdentifier(alias: string): Prisma.Sql {
  if (!SQL_IDENTIFIER.test(alias)) throw new Error(`Invalid SQL alias: ${alias}`);
  return Prisma.raw(alias);
}

/**
 * Role names as SQL literals. They are module constants from
 * `ROLE_PRECEDENCE`, never caller input, and each is re-checked against the
 * identifier pattern before it is inlined — so the generated fragment keeps
 * the same bound-parameter list it had before (emails and patterns only).
 */
function sqlRoleLiteralList(roles: readonly string[]): Prisma.Sql {
  return Prisma.join(
    roles.map((role) => {
      if (!SQL_IDENTIFIER.test(role)) throw new Error(`Invalid SQL role name: ${role}`);
      return Prisma.raw(`'${role}'`);
    }),
  );
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
 * Raw-SQL twin of the role half of {@link MEMBER_ONLY_WHERE}: a boolean
 * predicate on the `users` alias alone, so a query that already joins
 * `profiles` for its own columns can drop its hand-written
 * `p.role = 'member'` and read from the one definition instead.
 *
 *   WHERE ${memberOnlyRoleSql('u')} AND ${memberOnlyEmailSql('u')}
 *
 * Emits no bound parameters: every role name is an inlined, validated
 * literal, so a caller's parameter list is unchanged.
 */
export function memberOnlyRoleSql(userAlias = 'u'): Prisma.Sql {
  const u = sqlIdentifier(userAlias);
  const memberRole = sqlRoleLiteralList([MEMBER_ROLE_NAME]);
  return Prisma.sql`(EXISTS (SELECT 1 FROM user_roles member_only_row INNER JOIN roles member_only_role ON member_only_role.id = member_only_row.role_id WHERE member_only_row.user_id = ${u}.id AND member_only_role.name = ${memberRole}) OR EXISTS (SELECT 1 FROM profiles member_only_profile WHERE member_only_profile.user_id = ${u}.id AND member_only_profile.role = ${memberRole})) AND NOT EXISTS (SELECT 1 FROM profiles member_only_staff_profile WHERE member_only_staff_profile.user_id = ${u}.id AND member_only_staff_profile.role IN (${sqlRoleLiteralList(NON_MEMBER_PROFILE_ROLES)}))`;
}

/**
 * Raw-SQL twin of {@link MEMBER_ONLY_WHERE}: an INNER JOIN against the set of
 * member user ids — the one definition ({@link memberOnlyRoleSql}) plus the
 * fixture-email exclusion. Place it after the `users` table (default alias
 * `u`) has been joined:
 *
 *   FROM placement_records pr
 *   INNER JOIN users u ON u.id = pr.user_id
 *   ${memberOnlySqlJoin()}
 *   WHERE ...
 *
 * It is a derived table rather than a join straight onto `profiles` because a
 * member is no longer required to have a `profiles` row — a `user_roles`
 * member row is enough. `profileAlias` defaults to `member_profile` so it
 * never collides with a caller's own `p` alias; no caller reads a column off
 * it, and the only one it exposes is `user_id`.
 */
export function memberOnlySqlJoin(userAlias = 'u', profileAlias = 'member_profile'): Prisma.Sql {
  const u = sqlIdentifier(userAlias);
  const p = sqlIdentifier(profileAlias);
  return Prisma.sql`INNER JOIN (SELECT member_only_user.id AS user_id FROM users member_only_user WHERE ${memberOnlyRoleSql('member_only_user')} AND ${memberOnlyEmailSql('member_only_user')}) ${p} ON ${p}.user_id = ${u}.id`;
}
