import test from 'node:test';
import assert from 'node:assert/strict';

import { buildPlacementsQuery } from './placementsQuery';

test('buildPlacementsQuery constrains counselor-wide listing to assigned members', () => {
  const { query, params } = buildPlacementsQuery({
    staffUserId: 'staff-1',
    isAdmin: false,
    isSuperAdmin: false,
    organizationId: null,
    memberId: null,
    days: 0,
  });

  assert.match(query, /counselor_assignments ca/);
  assert.match(query, /ca\.member_id = pr\.user_id/);
  assert.match(query, /c\.user_id = \$1/);
  assert.deepEqual(params, ['staff-1']);
});

test('buildPlacementsQuery constrains org-admin listing to the actor organization', () => {
  const { query, params } = buildPlacementsQuery({
    staffUserId: 'admin-1',
    isAdmin: true,
    isSuperAdmin: false,
    organizationId: 'org-1',
    memberId: null,
    days: 0,
  });

  assert.doesNotMatch(query, /counselor_assignments/);
  assert.match(query, /u\.organization_id = \$1/);
  assert.deepEqual(params, ['org-1']);
});

test('buildPlacementsQuery leaves super-admin listing unrestricted for platform support', () => {
  const { query, params } = buildPlacementsQuery({
    staffUserId: 'super-1',
    isAdmin: true,
    isSuperAdmin: true,
    organizationId: null,
    memberId: null,
    days: 0,
  });

  assert.doesNotMatch(query, /counselor_assignments/);
  assert.doesNotMatch(query, /u\.organization_id/);
  assert.deepEqual(params, []);
});

test('buildPlacementsQuery prefers an explicit memberId over org or assignment filters', () => {
  const { query, params } = buildPlacementsQuery({
    staffUserId: 'admin-1',
    isAdmin: true,
    isSuperAdmin: false,
    organizationId: 'org-1',
    memberId: 'member-9',
    days: 0,
  });

  assert.match(query, /pr\.user_id = \$1/);
  assert.doesNotMatch(query, /u\.organization_id/);
  assert.doesNotMatch(query, /counselor_assignments/);
  assert.deepEqual(params, ['member-9']);
});

test('buildPlacementsQuery adds a placed_at bound only for a positive day window', () => {
  const before = Date.now();
  const windowed = buildPlacementsQuery({
    staffUserId: 'staff-1',
    isAdmin: false,
    isSuperAdmin: false,
    organizationId: null,
    memberId: null,
    days: 30,
  });
  const after = Date.now();

  assert.match(windowed.query, /pr\.placed_at >= \$2/);
  assert.equal(windowed.params[0], 'staff-1');
  assert.ok(windowed.params[1] instanceof Date);
  const bound = (windowed.params[1] as Date).getTime();
  const dayMs = 30 * 24 * 60 * 60 * 1000;
  assert.ok(bound >= before - dayMs);
  assert.ok(bound <= after - dayMs);

  for (const days of [0, -7, Number.NaN]) {
    const { query, params } = buildPlacementsQuery({
      staffUserId: 'staff-1',
      isAdmin: false,
      isSuperAdmin: false,
      organizationId: null,
      memberId: null,
      days,
    });
    assert.doesNotMatch(query, /pr\.placed_at >=/);
    assert.deepEqual(params, ['staff-1']);
  }
});

test('buildPlacementsQuery parameterizes a missing org-admin organization as an empty string', () => {
  const { query, params } = buildPlacementsQuery({
    staffUserId: 'admin-1',
    isAdmin: true,
    isSuperAdmin: false,
    organizationId: null,
    memberId: null,
    days: 0,
  });

  assert.match(query, /u\.organization_id = \$1/);
  assert.deepEqual(params, ['']);
  assert.match(query, /LIMIT 500/);
});
