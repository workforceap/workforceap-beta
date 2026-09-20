import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MEMBER_ONLY_EMAIL_WHERE,
  MEMBER_ONLY_EXCLUDED_EMAILS,
  MEMBER_ONLY_EXCLUDED_EMAIL_NOT,
  MEMBER_ONLY_EXCLUDED_EMAIL_PATTERNS,
  MEMBER_ONLY_WHERE,
  MEMBER_OR_DOGFOOD_WHERE,
  STAFF_PROFILE_ROLES,
  memberOnlyEmailSql,
  memberOnlyProfileWhere,
  memberOnlySqlJoin,
} from './memberOnlyWhere';

/**
 * Seeded accounts mirroring the demo database the 2026-09-20 admin audit ran
 * against: eight members plus the staff, counselor, employer and partner
 * logins that were being listed as applicants/students.
 */
type SeededUser = { email: string; deletedAt: Date | null; profile: { role: string } | null };

const member: SeededUser = { email: 'maria.santos@example.test', deletedAt: null, profile: { role: 'member' } };
const staff: SeededUser[] = [
  { email: 'demo-admin@workforceap.org', deletedAt: null, profile: { role: 'super_admin' } },
  { email: 'demo-staff-admin@workforceap.org', deletedAt: null, profile: { role: 'admin' } },
  { email: 'demo-counselor@workforceap.org', deletedAt: null, profile: { role: 'counselor' } },
  { email: 'employer@example.test', deletedAt: null, profile: { role: 'employer' } },
  { email: 'partner@example.test', deletedAt: null, profile: { role: 'partner' } },
];

type RoleFilter = string | { in?: readonly string[]; notIn?: readonly string[] };
type EmailFilter = { notIn?: readonly string[]; startsWith?: string; endsWith?: string };
type UserWhere = {
  deletedAt?: null;
  profile?: { role: RoleFilter } | null;
  email?: EmailFilter;
  NOT?: readonly { email: EmailFilter }[];
};

function emailMatches(filter: EmailFilter, email: string): boolean {
  if (filter.notIn?.includes(email)) return false;
  if (filter.startsWith !== undefined && !email.startsWith(filter.startsWith)) return false;
  if (filter.endsWith !== undefined && !email.endsWith(filter.endsWith)) return false;
  return true;
}

/** Minimal evaluator for the where shapes these constants use (Prisma relation `is` semantics). */
function matches(where: UserWhere, user: SeededUser): boolean {
  if ('deletedAt' in where && user.deletedAt !== null) return false;
  if (where.profile) {
    if (!user.profile) return false;
    const filter = where.profile.role;
    if (typeof filter === 'string') {
      if (user.profile.role !== filter) return false;
    } else {
      if (filter.in && !filter.in.includes(user.profile.role)) return false;
      if (filter.notIn && filter.notIn.includes(user.profile.role)) return false;
    }
  }
  if (where.email && !emailMatches(where.email, user.email)) return false;
  // Prisma `NOT: [...]` — the row is out when any listed condition matches.
  if (where.NOT?.some((clause) => emailMatches(clause.email, user.email))) return false;
  return true;
}

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
].map((email) => ({ email, deletedAt: null, profile: { role: 'member' } }));

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
].map((email) => ({ email, deletedAt: null, profile: { role: 'member' } }));

function count(where: UserWhere, users: SeededUser[]): number {
  return users.filter((u) => matches(where, u)).length;
}

test('member-only roster counts exclude every seeded staff profile', () => {
  const roster = { deletedAt: null, ...MEMBER_ONLY_WHERE } satisfies UserWhere;
  assert.equal(count(roster, [member, ...staff]), 1);
  for (const account of staff) {
    assert.equal(matches(roster, account), false, `${account.profile?.role} must not count as a member`);
  }
  assert.equal(matches(roster, member), true);
});

test('STAFF_PROFILE_ROLES is the exclusion vocabulary and never overlaps the member role', () => {
  assert.deepEqual([...STAFF_PROFILE_ROLES].sort(), ['admin', 'counselor', 'employer', 'partner', 'super_admin']);
  assert.equal(STAFF_PROFILE_ROLES.includes(MEMBER_ONLY_WHERE.profile.role as never), false);
  for (const role of STAFF_PROFILE_ROLES) {
    assert.equal(matches(MEMBER_ONLY_WHERE, { ...member, profile: { role } }), false);
  }
});

test('fixture emails and accounts without a profile row are not members either', () => {
  for (const email of MEMBER_ONLY_EXCLUDED_EMAILS) {
    assert.equal(matches(MEMBER_ONLY_WHERE, { ...member, email }), false);
  }
  assert.equal(matches(MEMBER_ONLY_WHERE, { ...member, profile: null }), false);
});

test('seeded and QA member accounts are cut out by pattern, hand-made test accounts by name', () => {
  for (const account of seededTestMembers) {
    assert.equal(matches(MEMBER_ONLY_WHERE, account), false, `${account.email} must not count as a member`);
    assert.equal(matches(MEMBER_OR_DOGFOOD_WHERE, account), false, `${account.email} must not count on /admin/members`);
  }
  for (const account of lookalikeRealMembers) {
    assert.equal(matches(MEMBER_ONLY_WHERE, account), true, `${account.email} must keep counting`);
  }
  // 126 production members minus 8 pattern hits minus 2 explicit hits = 116.
  const roster = [...lookalikeRealMembers, ...seededTestMembers];
  assert.equal(count(MEMBER_ONLY_WHERE, roster), lookalikeRealMembers.length);
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
  assert.deepEqual(MEMBER_ONLY_WHERE, { profile: { role: 'member' }, ...MEMBER_ONLY_EMAIL_WHERE });
});

test('memberOnlyEmailSql parameterises every address and pattern; the alias is an identifier', () => {
  const sql = memberOnlyEmailSql();
  assert.equal(sql.sql, 'u.email NOT IN (?,?,?,?) AND u.email NOT LIKE ? AND u.email NOT LIKE ? AND u.email NOT LIKE ? AND u.email NOT LIKE ? AND u.email NOT LIKE ?');
  assert.deepEqual(sql.values, [...MEMBER_ONLY_EXCLUDED_EMAILS, ...MEMBER_ONLY_EXCLUDED_EMAIL_PATTERNS]);
  assert.equal(memberOnlyEmailSql('actor').sql.startsWith('actor.email NOT IN'), true);
  assert.throws(() => memberOnlyEmailSql('u; DROP TABLE users'), /Invalid SQL alias/);
});

test('memberOnlyProfileWhere puts the role on the profile row and the fixture exclusion on the user', () => {
  const where = memberOnlyProfileWhere({ deletedAt: null, enrolledProgram: { not: null }, organizationId: 'org-1' });
  assert.equal(where.role, 'member');
  assert.deepEqual(where.user, {
    deletedAt: null,
    enrolledProgram: { not: null },
    organizationId: 'org-1',
    ...MEMBER_ONLY_EMAIL_WHERE,
  });
  assert.deepEqual(memberOnlyProfileWhere(), { role: 'member', user: { ...MEMBER_ONLY_EMAIL_WHERE } });
});

test('memberOnlySqlJoin is the raw-SQL twin: role = member join plus the fixture-email exclusion', () => {
  const join = memberOnlySqlJoin();
  assert.equal(
    join.sql,
    "INNER JOIN profiles member_profile ON member_profile.user_id = u.id AND member_profile.role = 'member' AND u.email NOT IN (?,?,?,?) AND u.email NOT LIKE ? AND u.email NOT LIKE ? AND u.email NOT LIKE ? AND u.email NOT LIKE ? AND u.email NOT LIKE ?",
  );
  assert.deepEqual(join.values, [...MEMBER_ONLY_EXCLUDED_EMAILS, ...MEMBER_ONLY_EXCLUDED_EMAIL_PATTERNS]);

  const aliased = memberOnlySqlJoin('u_scope', 'mp');
  assert.equal(aliased.sql, "INNER JOIN profiles mp ON mp.user_id = u_scope.id AND mp.role = 'member' AND u_scope.email NOT IN (?,?,?,?) AND u_scope.email NOT LIKE ? AND u_scope.email NOT LIKE ? AND u_scope.email NOT LIKE ? AND u_scope.email NOT LIKE ? AND u_scope.email NOT LIKE ?");

  // Aliases are identifiers, never bound parameters or injection points.
  assert.throws(() => memberOnlySqlJoin('u; DROP TABLE users'), /Invalid SQL alias/);
  assert.throws(() => memberOnlySqlJoin('u', 'p.x'), /Invalid SQL alias/);
});
