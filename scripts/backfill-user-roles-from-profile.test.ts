import test from 'node:test';
import assert from 'node:assert/strict';

import { countByRole, planUserRoleBackfill } from './backfill-user-roles-from-profile';

test('inserts the profile role for active users with no user_roles row', () => {
  const plan = planUserRoleBackfill([
    { id: 'u-admin', profileRole: 'admin', userRoleNames: [] },
    { id: 'u-case', profileRole: 'Case Manager', userRoleNames: [] },
    { id: 'u-member', profileRole: 'member', userRoleNames: [] },
    { id: 'u-has-row', profileRole: 'admin', userRoleNames: ['member', 'admin'] },
  ]);
  assert.deepEqual(plan.inserts, [
    { userId: 'u-admin', role: 'admin' },
    { userId: 'u-case', role: 'case_manager' },
    { userId: 'u-member', role: 'member' },
  ]);
  assert.equal(plan.consistent, 1);
  assert.deepEqual(plan.conflicts, []);
  assert.deepEqual(countByRole(plan.inserts), { admin: 1, case_manager: 1, member: 1 });
});

test('a lone baseline member row counts as no row: the promoted profile role is inserted next to it', () => {
  const plan = planUserRoleBackfill([
    { id: 'u-counselor', profileRole: 'counselor', userRoleNames: ['member'] },
    { id: 'u-partner', profileRole: 'partner', userRoleNames: ['member'] },
    { id: 'u-plain', profileRole: 'member', userRoleNames: ['member'] },
  ]);
  assert.deepEqual(plan.inserts, [
    { userId: 'u-counselor', role: 'counselor' },
    { userId: 'u-partner', role: 'partner' },
  ]);
  assert.equal(plan.consistent, 1);
  assert.deepEqual(plan.conflicts, []);
});

test('never plans a super_admin row: profile-only super admins are conflicts for item 2', () => {
  const plan = planUserRoleBackfill([
    { id: 'u-super-none', profileRole: 'Super Admin', userRoleNames: [] },
    { id: 'u-super-member', profileRole: 'super_admin', userRoleNames: ['member'] },
  ]);
  assert.deepEqual(plan.inserts, []);
  assert.deepEqual(plan.conflicts, [
    { userId: 'u-super-none', profileRole: 'super_admin', userRoleNames: [] },
    { userId: 'u-super-member', profileRole: 'super_admin', userRoleNames: ['member'] },
  ]);
});

test('lists disagreeing accounts as conflicts and never plans a write for them', () => {
  const plan = planUserRoleBackfill([
    { id: 'u-admin-vs-counselor', profileRole: 'admin', userRoleNames: ['member', 'counselor'] },
    { id: 'u-super-with-admin-row', profileRole: 'super_admin', userRoleNames: ['admin'] },
  ]);
  assert.deepEqual(plan.inserts, []);
  assert.deepEqual(plan.conflicts, [
    { userId: 'u-admin-vs-counselor', profileRole: 'admin', userRoleNames: ['member', 'counselor'] },
    { userId: 'u-super-with-admin-row', profileRole: 'super_admin', userRoleNames: ['admin'] },
  ]);
});

test('a member profile is the column default, so real-role rows are consistent, not conflicts', () => {
  const plan = planUserRoleBackfill([
    { id: 'u-demo-partner', profileRole: 'member', userRoleNames: ['partner'] },
    { id: 'u-demo-employer', profileRole: 'member', userRoleNames: ['employer', 'member'] },
  ]);
  assert.deepEqual(plan.inserts, []);
  assert.deepEqual(plan.conflicts, []);
  assert.equal(plan.consistent, 2);
});

test('users without a profile role are counted and skipped', () => {
  const plan = planUserRoleBackfill([
    { id: 'u-no-profile', profileRole: null, userRoleNames: [] },
    { id: 'u-blank', profileRole: '   ', userRoleNames: ['partner'] },
  ]);
  assert.equal(plan.noProfileRole, 2);
  assert.deepEqual(plan.inserts, []);
  assert.deepEqual(plan.conflicts, []);
});
