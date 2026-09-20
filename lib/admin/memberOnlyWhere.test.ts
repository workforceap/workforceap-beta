import test from 'node:test';
import assert from 'node:assert/strict';
import { MEMBER_ONLY_EXCLUDED_EMAILS, MEMBER_ONLY_WHERE, STAFF_PROFILE_ROLES } from './memberOnlyWhere';

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
type UserWhere = {
  deletedAt?: null;
  profile?: { role: RoleFilter } | null;
  email?: { notIn?: readonly string[] };
};

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
  if (where.email?.notIn?.includes(user.email)) return false;
  return true;
}

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
