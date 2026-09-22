import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DOGFOOD_PROFILE_ROLES,
  MEMBER_ONLY_EMAIL_WHERE,
  MEMBER_ONLY_EXCLUDED_EMAILS,
  MEMBER_ONLY_EXCLUDED_EMAIL_NOT,
  MEMBER_ONLY_EXCLUDED_EMAIL_PATTERNS,
  MEMBER_ONLY_WHERE,
  MEMBER_OR_DOGFOOD_WHERE,
  MEMBER_ROLE_NAME,
  NON_MEMBER_PROFILE_ROLES,
  STAFF_PROFILE_ROLES,
  memberOnlyEmailSql,
  memberOnlyProfileWhere,
  memberOnlyRoleSql,
  memberOnlySqlJoin,
  memberOrDogfoodRoleSql,
} from './memberOnlyWhere';
import { ROLE_PRECEDENCE, resolveEffectiveRole } from '@/lib/auth/roleAccess';

/**
 * Seeded accounts mirroring the demo database the 2026-09-20 admin audit ran
 * against: members plus the staff, counselor, employer and partner logins
 * that were being listed as applicants/students — now also carrying their
 * `user_roles` rows, because those are the source of truth for role
 * resolution (#2433) and therefore for "a member" (WAP-182 item 3).
 */
type SeededUser = {
  email: string;
  deletedAt: Date | null;
  profile: { role: string } | null;
  /** `roles.name` for each `user_roles` row. */
  userRoles: string[];
};

/** A fully backfilled member: profile row and `user_roles` row agree. */
const member: SeededUser = {
  email: 'maria.santos@example.test',
  deletedAt: null,
  profile: { role: 'member' },
  userRoles: ['member'],
};

/**
 * Staff, each carrying the baseline `member` row every account gets from
 * `ensureAppUser` — the reason a bare `user_roles: { some: member }` filter
 * is not a member test.
 */
const staff: SeededUser[] = [
  { email: 'demo-admin@workforceap.org', deletedAt: null, profile: { role: 'super_admin' }, userRoles: ['member'] },
  { email: 'demo-staff-admin@workforceap.org', deletedAt: null, profile: { role: 'admin' }, userRoles: ['member', 'admin'] },
  { email: 'demo-counselor@workforceap.org', deletedAt: null, profile: { role: 'counselor' }, userRoles: ['member'] },
  { email: 'employer@example.test', deletedAt: null, profile: { role: 'employer' }, userRoles: ['member', 'employer'] },
  { email: 'partner@example.test', deletedAt: null, profile: { role: 'partner' }, userRoles: ['member'] },
];

// ── Minimal evaluator for the where shapes these constants use ──

type Filter = Record<string, unknown>;

function matchScalar(filter: unknown, value: unknown): boolean {
  if (filter === null) return value === null;
  if (filter !== null && typeof filter === 'object' && !(filter instanceof Date)) {
    const f = filter as Filter;
    if ('not' in f) return !matchScalar(f.not, value);
    if ('notIn' in f) return !(f.notIn as unknown[]).includes(value);
    if ('in' in f) return (f.in as unknown[]).includes(value);
    if ('startsWith' in f) return typeof value === 'string' && value.startsWith(f.startsWith as string);
    if ('endsWith' in f) return typeof value === 'string' && value.endsWith(f.endsWith as string);
    throw new Error(`unsupported scalar filter ${JSON.stringify(filter)}`);
  }
  return filter === value;
}

function clauseList(filter: unknown): Filter[] {
  return (Array.isArray(filter) ? filter : [filter]) as Filter[];
}

/** Prisma `user.where` semantics for the keys these objects use. */
function matches(where: Filter, user: SeededUser): boolean {
  for (const [key, filter] of Object.entries(where)) {
    switch (key) {
      case 'deletedAt':
        if (!matchScalar(filter, user.deletedAt)) return false;
        break;
      case 'email':
        if (!matchScalar(filter, user.email)) return false;
        break;
      case 'profile': {
        // `profile: null` is Prisma's "no related row"; otherwise the row must exist and match.
        if (filter === null) {
          if (user.profile) return false;
          break;
        }
        if (!user.profile) return false;
        if (!matchScalar((filter as Filter).role, user.profile.role)) return false;
        break;
      }
      case 'userRoles': {
        const f = filter as { some?: { role: { name: string } }; none?: { role: { name: string } } };
        if (f.some && !user.userRoles.includes(f.some.role.name)) return false;
        if (f.none && user.userRoles.includes(f.none.role.name)) return false;
        break;
      }
      case 'OR':
        if (!clauseList(filter).some((clause) => matches(clause, user))) return false;
        break;
      case 'AND':
        if (!clauseList(filter).every((clause) => matches(clause, user))) return false;
        break;
      case 'NOT':
        // Prisma `NOT: [...]` — the row is out when any listed condition matches.
        if (clauseList(filter).some((clause) => matches(clause, user))) return false;
        break;
      default:
        throw new Error(`unsupported user filter ${key}`);
    }
  }
  return true;
}

/** Prisma `profile.where` semantics: the row exists by definition. */
function matchesProfile(where: Filter, user: SeededUser): boolean {
  if (!user.profile) return false;
  for (const [key, filter] of Object.entries(where)) {
    switch (key) {
      case 'role':
        if (!matchScalar(filter, user.profile.role)) return false;
        break;
      case 'user':
        if (!matches(filter as Filter, user)) return false;
        break;
      case 'OR':
        if (!clauseList(filter).some((clause) => matchesProfile(clause, user))) return false;
        break;
      case 'NOT':
        if (clauseList(filter).some((clause) => matchesProfile(clause, user))) return false;
        break;
      default:
        throw new Error(`unsupported profile filter ${key}`);
    }
  }
  return true;
}

function count(where: Filter, users: SeededUser[]): number {
  return users.filter((u) => matches(where, u)).length;
}

const MEMBER_ONLY = MEMBER_ONLY_WHERE as unknown as Filter;
const MEMBER_OR_DOGFOOD = MEMBER_OR_DOGFOOD_WHERE as unknown as Filter;

/**
 * The production rows the 2026-09-20 audit found still counting as members:
 * eight seeded / QA logins caught by pattern and two hand-made accounts only
 * the explicit list can name (126 -> 116 on /admin/members).
 */
const seededTestMembers: SeededUser[] = [
  'member-test@workforceap.org',
  'employer-test@workforceap.org',
  'partner-test@workforceap.org',
  'test-smoke-2026-06-17f@workforceap.org',
  'referral-member-a@workforceap.org',
  'referral-member-b@workforceap.org',
  'match-candidate@workforceap.org',
  'employer-preview@example.com',
  'mabrown040+acceptprobe1775588012212@gmail.com',
  'mbrown@hsconsultingtx.com',
].map((email) => ({ email, deletedAt: null, profile: { role: 'member' }, userRoles: ['member'] }));

/** Real staff and members that look similar but must keep counting (Mike decides the ambiguous three). */
const lookalikeRealMembers: SeededUser[] = [
  'info@workforceap.org',
  'adriane.brown@workforceap.org',
  'craig.brown@workforceap.org',
  'test@workforceap.org',
  'contest-winner@workforceap.org',
  'my-referral-member-list@workforceap.org',
  'no-match-candidate@workforceap.org',
  'admin-test@partner.example.org',
  'someone@example.company.com',
].map((email) => ({ email, deletedAt: null, profile: { role: 'member' }, userRoles: ['member'] }));

test('member-only roster counts exclude every seeded staff profile', () => {
  const roster = { deletedAt: null, ...MEMBER_ONLY } satisfies Filter;
  assert.equal(count(roster, [member, ...staff]), 1);
  for (const account of staff) {
    assert.equal(matches(roster, account), false, `${account.profile?.role} must not count as a member`);
  }
  assert.equal(matches(roster, member), true);
});

test('a staff profile is not a member even when it carries the baseline user_roles member row', () => {
  // Every account gets a `member` row from `ensureAppUser`, so the row alone
  // proves nothing — `profiles.role` outranks it exactly as
  // `resolveEffectiveRole` does. Drop the staff `NOT` entry and this fails.
  assert.equal(staff.length, 5);
  for (const account of staff) {
    assert.ok(account.userRoles.includes(MEMBER_ROLE_NAME), `${account.email} must seed the baseline row`);
    assert.equal(matches(MEMBER_ONLY, account), false, `${account.email} must not count as a member`);
  }
});

test('a user_roles member row counts even before the profile backfill reaches the account', () => {
  // The drift #2433 opened: `getProfileRole` already calls these members,
  // while every count still asked `profiles.role`. Drop the `user_roles`
  // branch of the union and both of these fail.
  const rowOnlyNoProfile: SeededUser = {
    email: 'row.only@example.test',
    deletedAt: null,
    profile: null,
    userRoles: ['member'],
  };
  const rowOnlyBlankProfile: SeededUser = {
    email: 'row.blank@example.test',
    deletedAt: null,
    profile: { role: '' },
    userRoles: ['member'],
  };
  assert.equal(matches(MEMBER_ONLY, rowOnlyNoProfile), true);
  assert.equal(matches(MEMBER_ONLY, rowOnlyBlankProfile), true);
  assert.equal(matches(MEMBER_OR_DOGFOOD, rowOnlyNoProfile), true);
  // Same answer the portal gives them, which is the point of converging.
  assert.equal(
    resolveEffectiveRole({ deletedAt: null, profileRole: null, userRoleNames: ['member'] }).role,
    MEMBER_ROLE_NAME,
  );
});

test('profiles.role = member is still the fallback, so nothing waits on the backfill', () => {
  // A hard flip to `user_roles` only would drop this account until
  // `scripts/backfill-user-roles-from-profile.ts` runs in production.
  const profileOnly: SeededUser = {
    email: 'not.backfilled@example.test',
    deletedAt: null,
    profile: { role: 'member' },
    userRoles: [],
  };
  assert.equal(matches(MEMBER_ONLY, profileOnly), true);
  assert.equal(matches(MEMBER_OR_DOGFOOD, profileOnly), true);
  assert.equal(matchesProfile(memberOnlyProfileWhere() as unknown as Filter, profileOnly), true);
});

test('an account neither store calls a member does not count', () => {
  const nothingAnywhere: SeededUser = {
    email: 'role.less@example.test',
    deletedAt: null,
    profile: null,
    userRoles: [],
  };
  const blankProfileNoRow: SeededUser = { ...nothingAnywhere, email: 'blank@example.test', profile: { role: '' } };
  assert.equal(matches(MEMBER_ONLY, nothingAnywhere), false);
  assert.equal(matches(MEMBER_ONLY, blankProfileNoRow), false);
  assert.equal(matches(MEMBER_OR_DOGFOOD, nothingAnywhere), false);
});

test('the role vocabulary is the resolver’s, and the member role is never in the exclusion', () => {
  assert.deepEqual([...STAFF_PROFILE_ROLES].sort(), ['admin', 'counselor', 'employer', 'partner', 'super_admin']);
  // Superset of STAFF_PROFILE_ROLES: `case_manager` is a role the resolver
  // knows and the old `role = 'member'` filter excluded for free.
  assert.deepEqual([...NON_MEMBER_PROFILE_ROLES].sort(), ['admin', 'case_manager', 'counselor', 'employer', 'partner', 'super_admin']);
  const nonMember: readonly string[] = NON_MEMBER_PROFILE_ROLES;
  assert.equal(nonMember.includes(MEMBER_ROLE_NAME), false);
  for (const role of STAFF_PROFILE_ROLES) assert.ok(nonMember.includes(role));
  assert.deepEqual([...NON_MEMBER_PROFILE_ROLES], ROLE_PRECEDENCE.filter((r) => r !== MEMBER_ROLE_NAME));
  for (const role of NON_MEMBER_PROFILE_ROLES) {
    assert.equal(matches(MEMBER_ONLY, { ...member, profile: { role } }), false, `${role} must not count`);
  }
});

test('the dogfood filter keeps admins and members, and only those', () => {
  assert.deepEqual([...DOGFOOD_PROFILE_ROLES], ['admin', 'super_admin']);
  for (const role of DOGFOOD_PROFILE_ROLES) {
    const dogfooder: SeededUser = { ...member, profile: { role }, userRoles: ['member', role] };
    assert.equal(matches(MEMBER_OR_DOGFOOD, dogfooder), true, `${role} must stay on /admin/members`);
    assert.equal(matches(MEMBER_ONLY, dogfooder), false, `${role} must stay out of funder exports`);
  }
  for (const role of ['counselor', 'employer', 'partner', 'case_manager']) {
    assert.equal(matches(MEMBER_OR_DOGFOOD, { ...member, profile: { role } }), false, `${role} is not a dogfooder`);
  }
  assert.equal(matches(MEMBER_OR_DOGFOOD, member), true);
});

test('seeded and QA member accounts are cut out by pattern, hand-made test accounts by name', () => {
  assert.equal(seededTestMembers.length, 10);
  assert.equal(lookalikeRealMembers.length, 9);
  for (const account of seededTestMembers) {
    assert.equal(matches(MEMBER_ONLY, account), false, `${account.email} must not count as a member`);
    assert.equal(matches(MEMBER_OR_DOGFOOD, account), false, `${account.email} must not count on /admin/members`);
    // The email exclusion outranks a `user_roles` member row too.
    assert.equal(matches(MEMBER_ONLY, { ...account, profile: null }), false, `${account.email} row-only must not count`);
  }
  for (const account of lookalikeRealMembers) {
    assert.equal(matches(MEMBER_ONLY, account), true, `${account.email} must keep counting`);
  }
  // 126 production members minus 8 pattern hits minus 2 explicit hits = 116.
  const roster = [...lookalikeRealMembers, ...seededTestMembers];
  assert.equal(roster.length, 19);
  assert.equal(count(MEMBER_ONLY, roster), lookalikeRealMembers.length);
  assert.equal(lookalikeRealMembers.length, 9);
  assert.equal(MEMBER_ONLY_EXCLUDED_EMAILS.length, 4);
});

test('the SQL LIKE patterns and the Prisma NOT clauses are one list, derived from the email fixture rules', () => {
  assert.deepEqual([...MEMBER_ONLY_EXCLUDED_EMAIL_PATTERNS], [
    '%-test@workforceap.org',
    'test-smoke-%',
    'referral-member-%',
    'match-candidate%',
    '%@example.com',
  ]);
  assert.deepEqual(MEMBER_ONLY_EXCLUDED_EMAIL_NOT, [
    { email: { endsWith: '-test@workforceap.org' } },
    { email: { startsWith: 'test-smoke-' } },
    { email: { startsWith: 'referral-member-' } },
    { email: { startsWith: 'match-candidate' } },
    { email: { endsWith: '@example.com' } },
  ]);
  // Same order, same count: a pattern added to one side without the other fails here.
  assert.equal(MEMBER_ONLY_EXCLUDED_EMAIL_NOT.length, MEMBER_ONLY_EXCLUDED_EMAIL_PATTERNS.length);
  assert.deepEqual(MEMBER_ONLY_EMAIL_WHERE, {
    email: { notIn: [...MEMBER_ONLY_EXCLUDED_EMAILS] },
    NOT: MEMBER_ONLY_EXCLUDED_EMAIL_NOT,
  });
  // The email exclusion still rides in the one `NOT` list, ahead of the role entries.
  assert.deepEqual(MEMBER_ONLY_WHERE.NOT.slice(0, MEMBER_ONLY_EXCLUDED_EMAIL_NOT.length), MEMBER_ONLY_EXCLUDED_EMAIL_NOT);
  assert.deepEqual(MEMBER_ONLY_WHERE.email, { notIn: [...MEMBER_ONLY_EXCLUDED_EMAILS] });
});

test('neither where object claims a top-level AND or OR that a caller would overwrite', () => {
  // ~148 call sites spread these into a `where`; several set their own `AND`
  // or `OR` there (app/admin/members/page.tsx,
  // app/api/admin/cohort-export/route.ts). A collision drops the member
  // filter silently, so the role predicate lives in `NOT`.
  for (const where of [MEMBER_ONLY_WHERE, MEMBER_OR_DOGFOOD_WHERE]) {
    assert.deepEqual(Object.keys(where).sort(), ['NOT', 'email']);
  }
});

test('memberOnlyEmailSql parameterises every address and pattern; the alias is an identifier', () => {
  const sql = memberOnlyEmailSql();
  assert.equal(sql.sql, 'u.email NOT IN (?,?,?,?) AND u.email NOT LIKE ? AND u.email NOT LIKE ? AND u.email NOT LIKE ? AND u.email NOT LIKE ? AND u.email NOT LIKE ?');
  assert.deepEqual(sql.values, [...MEMBER_ONLY_EXCLUDED_EMAILS, ...MEMBER_ONLY_EXCLUDED_EMAIL_PATTERNS]);
  assert.equal(memberOnlyEmailSql('actor').sql.startsWith('actor.email NOT IN'), true);
  assert.throws(() => memberOnlyEmailSql('u; DROP TABLE users'), /Invalid SQL alias/);
});

test('memberOnlyProfileWhere asks both stores and keeps the fixture exclusion on the user', () => {
  const where = memberOnlyProfileWhere({ deletedAt: null, enrolledProgram: { not: null }, organizationId: 'org-1' });
  assert.deepEqual(where.user, {
    deletedAt: null,
    enrolledProgram: { not: null },
    organizationId: 'org-1',
    ...MEMBER_ONLY_EMAIL_WHERE,
  });
  assert.equal(NON_MEMBER_PROFILE_ROLES.length, 6);
  assert.equal(MEMBER_ONLY_EXCLUDED_EMAILS.length, 4);
  const bare = memberOnlyProfileWhere() as unknown as Filter;
  assert.equal(matchesProfile(bare, member), true);
  // Backfilled but the profile still says something else: the row carries it.
  assert.equal(matchesProfile(bare, { ...member, profile: { role: '' }, userRoles: ['member'] }), true);
  for (const role of NON_MEMBER_PROFILE_ROLES) {
    assert.equal(
      matchesProfile(bare, { ...member, profile: { role }, userRoles: ['member', role] }),
      false,
      `${role} profiles must stay out of the demographics groupBy`,
    );
  }
  assert.equal(matchesProfile(bare, { ...member, profile: { role: '' }, userRoles: [] }), false);
  for (const email of MEMBER_ONLY_EXCLUDED_EMAILS) {
    assert.equal(matchesProfile(bare, { ...member, email }), false, `${email} must stay out`);
  }
});

test('memberOnlyRoleSql reads both stores, inlines only validated role names, and binds nothing', () => {
  const predicate = memberOnlyRoleSql();
  // Both halves of the one definition, and the staff-profile override.
  assert.match(predicate.sql, /EXISTS \(SELECT 1 FROM user_roles .*member_only_role\.name = 'member'\)/);
  assert.match(predicate.sql, /EXISTS \(SELECT 1 FROM profiles .*member_only_profile\.role = 'member'\)/);
  assert.match(predicate.sql, /NOT EXISTS \(SELECT 1 FROM profiles .*role IN \('super_admin','admin','case_manager','counselor','employer','partner'\)\)/);
  assert.equal(predicate.sql.includes('?'), false);
  assert.deepEqual(predicate.values, []);
  assert.equal(memberOnlyRoleSql('u_scope').sql.includes('u_scope.id'), true);
  assert.equal(memberOnlyRoleSql('u_scope').sql.includes('u.id'), false);
  assert.throws(() => memberOnlyRoleSql('u; DROP TABLE users'), /Invalid SQL alias/);
});

test('memberOrDogfoodRoleSql is the dogfood twin: admin profiles count, partner-side ones never do, nothing is bound', () => {
  const predicate = memberOrDogfoodRoleSql();
  assert.match(predicate.sql, /EXISTS \(SELECT 1 FROM user_roles .*member_only_role\.name = 'member'\)/);
  assert.match(predicate.sql, /EXISTS \(SELECT 1 FROM profiles .*member_only_profile\.role IN \('member','admin','super_admin'\)\)/);
  assert.match(predicate.sql, /NOT EXISTS \(SELECT 1 FROM profiles .*role IN \('case_manager','counselor','employer','partner'\)\)/);
  assert.equal(predicate.sql.includes('?'), false);
  assert.deepEqual(predicate.values, []);
  // Same role lists as the Prisma entries, so the two cannot drift apart.
  const memberRoles = [MEMBER_ROLE_NAME, ...DOGFOOD_PROFILE_ROLES];
  assert.equal(predicate.sql.includes(`IN (${memberRoles.map((r) => `'${r}'`).join(',')})`), true);
  const excluded = NON_MEMBER_PROFILE_ROLES.filter((r) => !(DOGFOOD_PROFILE_ROLES as readonly string[]).includes(r));
  assert.equal(predicate.sql.includes(`IN (${excluded.map((r) => `'${r}'`).join(',')})`), true);
  assert.equal(memberOrDogfoodRoleSql('u_scope').sql.includes('u_scope.id'), true);
  assert.equal(memberOrDogfoodRoleSql('u_scope').sql.includes(' u.id'), false);
  assert.throws(() => memberOrDogfoodRoleSql('u; DROP TABLE users'), /Invalid SQL alias/);
});

test('memberOnlySqlJoin is the raw-SQL twin: the one role definition plus the fixture-email exclusion', () => {
  const join = memberOnlySqlJoin();
  assert.equal(
    join.sql,
    `INNER JOIN (SELECT member_only_user.id AS user_id FROM users member_only_user WHERE ${memberOnlyRoleSql('member_only_user').sql} AND ${memberOnlyEmailSql('member_only_user').sql}) member_profile ON member_profile.user_id = u.id`,
  );
  // Unchanged bound-parameter list: role names are literals, emails are not.
  assert.deepEqual(join.values, [...MEMBER_ONLY_EXCLUDED_EMAILS, ...MEMBER_ONLY_EXCLUDED_EMAIL_PATTERNS]);

  const aliased = memberOnlySqlJoin('u_scope', 'mp');
  assert.equal(aliased.sql.endsWith(') mp ON mp.user_id = u_scope.id'), true);
  assert.deepEqual(aliased.values, join.values);

  // Aliases are identifiers, never bound parameters or injection points.
  assert.throws(() => memberOnlySqlJoin('u; DROP TABLE users'), /Invalid SQL alias/);
  assert.throws(() => memberOnlySqlJoin('u', 'p.x'), /Invalid SQL alias/);
});
