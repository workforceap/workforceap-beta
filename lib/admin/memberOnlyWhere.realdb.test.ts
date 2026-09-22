/**
 * Real-database behavioural proof for the one member definition
 * (WAP-182 item 3, `lib/admin/memberOnlyWhere.ts`).
 *
 * `memberOnlyWhere.test.ts` evaluates the where objects with a hand-written
 * mini-Prisma, which proves the predicate's logic but not that Prisma and
 * PostgreSQL agree with it. The role half is a De Morgan negation carrying a
 * nested `OR`, a `profile: null` to-one filter and a `userRoles: { none }`
 * to-many filter, and `memberOnlySqlJoin` is a derived table — none of which
 * a mock can vouch for. This suite seeds one account per case into the
 * disposable contract database and asserts on what the real queries return.
 *
 * It runs only in the database-contract lane (`TEST_REAL_DB=1`, see
 * scripts/run-db-contract-tests.mjs); the default node:test lane skips it
 * because it has no PostgreSQL.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import {
  MEMBER_ONLY_WHERE,
  MEMBER_OR_DOGFOOD_WHERE,
  memberOnlyProfileWhere,
  memberOnlyRoleSql,
  memberOnlySqlJoin,
} from './memberOnlyWhere';
import { prisma } from '../db/prisma';

const runId = randomUUID().slice(0, 8);

/**
 * One account per branch of the definition. `member` says whether
 * `MEMBER_ONLY_WHERE` must keep the row, `dogfood` the same for
 * `MEMBER_OR_DOGFOOD_WHERE`. `fixtureEmail` rows are members by role and are
 * cut only by the email exclusion, which is how they separate the two halves.
 */
const CASES = [
  { key: 'backfilled member', profileRole: 'member', rows: ['member'], member: true, dogfood: true },
  { key: 'profile-only member (backfill not run)', profileRole: 'member', rows: [], member: true, dogfood: true },
  { key: 'user_roles-only member, no profile row', profileRole: null, rows: ['member'], member: true, dogfood: true },
  { key: 'admin profile with the baseline member row', profileRole: 'admin', rows: ['member', 'admin'], member: false, dogfood: true },
  { key: 'super_admin profile with the baseline member row', profileRole: 'super_admin', rows: ['member'], member: false, dogfood: true },
  { key: 'admin profile with no rows at all', profileRole: 'admin', rows: [], member: false, dogfood: true },
  { key: 'counselor profile with the baseline member row', profileRole: 'counselor', rows: ['member'], member: false, dogfood: false },
  { key: 'case_manager profile with the baseline member row', profileRole: 'case_manager', rows: ['member'], member: false, dogfood: false },
  { key: 'employer profile with the baseline member row', profileRole: 'employer', rows: ['member'], member: false, dogfood: false },
  { key: 'no profile row and no rows at all', profileRole: null, rows: [], member: false, dogfood: false },
] as const;

/**
 * Members by role whose email the fixture exclusion cuts out anyway. The
 * named one must use that exact address to be matched by
 * `MEMBER_ONLY_EXCLUDED_EMAILS`, so it cannot carry a per-run suffix; the
 * pattern one only needs the `referral-member-` prefix.
 */
const FIXTURE_CASES = [
  { key: 'named fixture account', email: 'member.success@workforceap.org', profileRole: 'member', rows: ['member'] },
  { key: 'seeded pattern account', email: `referral-member-${runId}@workforceap.org`, profileRole: null, rows: ['member'] },
] as const;

const EXPECTED_MEMBERS = CASES.filter((c) => c.member).length;
const EXPECTED_DOGFOOD = CASES.filter((c) => c.dogfood).length;

const seeded: { orgId: string; roleIds: Record<string, string>; ids: Map<string, string>; userIds: string[] } = {
  orgId: '',
  roleIds: {},
  ids: new Map(),
  userIds: [],
};

async function seedUser(key: string, profileRole: string | null, rows: readonly string[], email?: string) {
  const user = await prisma.user.create({
    data: {
      organizationId: seeded.orgId,
      email: email ?? `member-only-${seeded.userIds.length}-${runId}@example.test`,
      fullName: `Member-only contract: ${key}`,
    },
    select: { id: true },
  });
  seeded.userIds.push(user.id);
  seeded.ids.set(key, user.id);
  if (profileRole !== null) await prisma.profile.create({ data: { userId: user.id, role: profileRole } });
  for (const name of rows) {
    await prisma.userRole.create({ data: { userId: user.id, roleId: seeded.roleIds[name] } });
  }
  return user.id;
}

/** Every query in this suite is scoped to the rows this run seeded. */
function scope() {
  return { organizationId: seeded.orgId, deletedAt: null };
}

before(async () => {
  const org = await prisma.organization.create({
    data: { slug: `member-only-contract-${runId}`, name: `Member-only contract ${runId}` },
    select: { id: true },
  });
  seeded.orgId = org.id;
  // The named fixture address is fixed, so a previous run of this lane can
  // have left it behind. In a disposable contract database that row is test
  // residue and nothing else.
  await prisma.user.deleteMany({ where: { email: { in: FIXTURE_CASES.map((c) => c.email) } } });
  for (const name of ['member', 'admin', 'super_admin', 'counselor', 'case_manager', 'employer', 'partner']) {
    const role = await prisma.role.upsert({ where: { name }, create: { name }, update: {}, select: { id: true } });
    seeded.roleIds[name] = role.id;
  }
  for (const seed of CASES) await seedUser(seed.key, seed.profileRole, seed.rows);
  for (const seed of FIXTURE_CASES) await seedUser(seed.key, seed.profileRole, seed.rows, seed.email);
  // The fixtures must all exist, or every loop below would pass on nothing.
  assert.equal(seeded.userIds.length, CASES.length + FIXTURE_CASES.length);
  assert.equal(seeded.userIds.length, 12);
});

after(async () => {
  await prisma.user.deleteMany({ where: { id: { in: seeded.userIds } } });
  await prisma.organization.deleteMany({ where: { id: seeded.orgId } });
  await prisma.$disconnect();
});

test('MEMBER_ONLY_WHERE keeps a member named by either store and no staff account', async () => {
  assert.equal(CASES.length, 10);
  for (const seed of CASES) {
    const hit = await prisma.user.count({ where: { ...scope(), id: seeded.ids.get(seed.key), ...MEMBER_ONLY_WHERE } });
    assert.equal(hit === 1, seed.member, `${seed.key} should ${seed.member ? '' : 'not '}count as a member`);
  }
  assert.equal(await prisma.user.count({ where: { ...scope(), ...MEMBER_ONLY_WHERE } }), EXPECTED_MEMBERS);
  assert.equal(EXPECTED_MEMBERS, 3);
});

test('the fixture-email exclusion still outranks a member role in either store', async () => {
  assert.equal(FIXTURE_CASES.length, 2);
  for (const seed of FIXTURE_CASES) {
    const id = seeded.ids.get(seed.key);
    assert.equal(await prisma.user.count({ where: { ...scope(), id, ...MEMBER_ONLY_WHERE } }), 0, seed.key);
    assert.equal(await prisma.user.count({ where: { ...scope(), id, ...MEMBER_OR_DOGFOOD_WHERE } }), 0, seed.key);
  }
});

test('MEMBER_OR_DOGFOOD_WHERE adds admin dogfooders and nobody else', async () => {
  for (const seed of CASES) {
    const hit = await prisma.user.count({ where: { ...scope(), id: seeded.ids.get(seed.key), ...MEMBER_OR_DOGFOOD_WHERE } });
    assert.equal(hit === 1, seed.dogfood, `${seed.key} should ${seed.dogfood ? '' : 'not '}show on /admin/members`);
  }
  assert.equal(await prisma.user.count({ where: { ...scope(), ...MEMBER_OR_DOGFOOD_WHERE } }), EXPECTED_DOGFOOD);
  assert.equal(EXPECTED_DOGFOOD, 6);
});

test("a caller's own top-level AND or OR survives the spread", async () => {
  // The reason the role predicate lives in `NOT`: ~148 call sites spread
  // these objects into a `where`, several next to their own combinator.
  // Two seeded accounts have no profile row; only one of them is a member.
  const noProfileRow = CASES.filter((c) => c.profileRole === null);
  assert.equal(noProfileRow.length, 2);
  assert.equal(noProfileRow.filter((c) => c.member).length, 1);
  const withAnd = await prisma.user.count({
    where: { ...scope(), ...MEMBER_ONLY_WHERE, AND: [{ fullName: { contains: 'no profile row' } }] },
  });
  assert.equal(withAnd, 1, 'the caller AND must narrow the member set, not replace it');

  const withOr = await prisma.user.count({
    where: {
      ...scope(),
      ...MEMBER_ONLY_WHERE,
      OR: [{ id: seeded.ids.get('backfilled member') }, { id: seeded.ids.get('counselor profile with the baseline member row') }],
    },
  });
  assert.equal(withOr, 1, 'the caller OR must narrow the member set, not replace it');
});

test('memberOnlyProfileWhere selects the member profile rows, staff excluded', async () => {
  // Runs on `prisma.profile`, so a member with no profile row cannot appear.
  const expected = CASES.filter((c) => c.member && c.profileRole !== null).length;
  assert.equal(expected, 2);
  assert.equal(await prisma.profile.count({ where: memberOnlyProfileWhere(scope()) }), expected);
  const groups = await prisma.profile.groupBy({
    by: ['role'],
    where: memberOnlyProfileWhere(scope()),
    _count: { _all: true },
  });
  assert.deepEqual(groups.map((g) => g.role), ['member']);
  assert.deepEqual(groups.map((g) => g._count._all), [expected]);
});

test('memberOnlySqlJoin counts the same population in raw SQL', async () => {
  const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(DISTINCT u.id)::bigint AS count
    FROM users u
    ${memberOnlySqlJoin()}
    WHERE u.organization_id = ${seeded.orgId} AND u.deleted_at IS NULL`;
  assert.equal(Number(rows[0].count), EXPECTED_MEMBERS);
});

test('memberOnlyRoleSql is the role half alone, on any user alias', async () => {
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT u_scope.id FROM users u_scope
    WHERE u_scope.organization_id = ${seeded.orgId}
      AND u_scope.deleted_at IS NULL
      AND ${memberOnlyRoleSql('u_scope')}`;
  // The role half keeps the fixture accounts; only the email half cuts them.
  const expected = new Set([
    ...CASES.filter((c) => c.member).map((c) => seeded.ids.get(c.key)!),
    ...FIXTURE_CASES.map((c) => seeded.ids.get(c.key)!),
  ]);
  assert.equal(expected.size, EXPECTED_MEMBERS + FIXTURE_CASES.length);
  assert.deepEqual(new Set(rows.map((r) => r.id)), expected);
});

test('the two definitions this converges really do disagree on this roster', async () => {
  const byProfile = await prisma.user.count({ where: { ...scope(), profile: { role: 'member' } } });
  const byRows = await prisma.user.count({ where: { ...scope(), userRoles: { some: { role: { name: 'member' } } } } });
  // `profiles.role = 'member'` misses the user_roles-only member; a bare
  // `member` row counts every staff account holding the baseline row.
  // profiles.role = 'member': the 2 member profiles plus the named fixture —
  // it never sees the user_roles-only member.
  assert.equal(byProfile, 3);
  // A bare member row: 7 of the seeded cases (staff baseline rows included)
  // plus both fixtures.
  assert.equal(byRows, 9);
  assert.notEqual(byProfile, byRows);
  assert.equal(await prisma.user.count({ where: { ...scope(), ...MEMBER_ONLY_WHERE } }), EXPECTED_MEMBERS);
});
