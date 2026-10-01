import test from 'node:test';
import assert from 'node:assert/strict';
import { MEMBER_ONLY_ROLE_NOT, MEMBER_ONLY_WHERE } from '@/lib/admin/memberOnlyWhere';
import { enrolledMembersInOrganizationWhere } from './adminMemberScope';

test('enrolledMembersInOrganizationWhere scopes admin fallback to actor organization', () => {
  assert.deepEqual(enrolledMembersInOrganizationWhere('org-a'), {
    organizationId: 'org-a',
    deletedAt: null,
    enrolledProgram: { not: null },
    ...MEMBER_ONLY_WHERE,
  });
});

test('admin fallback caseload is members only, by the one member definition', () => {
  const where = enrolledMembersInOrganizationWhere('org-a');
  // The role predicate rides in `NOT` (WAP-182 item 3), so a caller that
  // spreads its own `AND` / `OR` alongside cannot silently drop it.
  for (const entry of MEMBER_ONLY_ROLE_NOT) {
    assert.ok(where.NOT.includes(entry), 'the member role predicate must survive the spread');
  }
  assert.equal(MEMBER_ONLY_ROLE_NOT.length, 2);
  assert.equal(where.enrolledProgram.not, null);
});
