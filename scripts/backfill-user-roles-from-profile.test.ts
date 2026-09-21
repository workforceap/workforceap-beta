import test from 'node:test';
import assert from 'node:assert/strict';

import { countByRole, planUserRoleBackfill } from './backfill-user-roles-from-profile';

test('inserts the profile role only for active users with no user_roles row', () => {
  const plan = planUserRoleBackfill([
    { id: 'u-admin', profileRole: 'admin', userRoleNames: [] },
    { id: 'u-super', profileRole: 'Super Admin', userRoleNames: [] },
    { id: 'u-member', profileRole: 'member', userRoleNames: [] },
    { id: 'u-has-row', profileRole: 'admin', userRoleNames: ['member', 'admin'] },
  ]);
  assert.deepEqual(plan.inserts, [
    { userId: 'u-admin', role: 'admin' },
    { userId: 'u-super', role: 'super_admin' },
    { userId: 'u-member', role: 'member' },
  ]);
  assert.equal(plan.consistent, 1);
  assert.deepEqual(plan.conflicts, []);
  assert.deepEqual(countByRole(plan.inserts), { admin: 1, member: 1, super_admin: 1 });
});

test('lists disagreeing accounts as conflicts and never plans a write for them', () => {
  const plan = planUserRoleBackfill([
    { id: 'u-stale-admin', profileRole: 'admin', userRoleNames: ['member'] },
    { id: 'u-super-with-admin-row', profileRole: 'super_admin', userRoleNames: ['admin'] },
  ]);
  assert.deepEqual(plan.inserts, []);
  assert.deepEqual(plan.conflicts, [
    { userId: 'u-stale-admin', profileRole: 'admin', userRoleNames: ['member'] },
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
