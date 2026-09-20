import test from 'node:test';
import assert from 'node:assert/strict';
import { MEMBER_ONLY_WHERE } from '@/lib/admin/memberOnlyWhere';
import { enrolledMembersInOrganizationWhere } from './adminMemberScope';

test('enrolledMembersInOrganizationWhere scopes admin fallback to actor organization', () => {
  assert.deepEqual(enrolledMembersInOrganizationWhere('org-a'), {
    organizationId: 'org-a',
    deletedAt: null,
    enrolledProgram: { not: null },
    ...MEMBER_ONLY_WHERE,
  });
});

test('admin fallback caseload is member-role profiles only', () => {
  const where = enrolledMembersInOrganizationWhere('org-a');
  assert.deepEqual(where.profile, { role: 'member' });
});
