import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPortalSwitcherRoles } from './portalRoleSwitcher';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

test('does not invent member access for employer-only users', () => {
  const roles = buildPortalSwitcherRoles({
    userRoleNames: ['employer'],
    hasMemberProfile: false,
    hasEmployer: true,
    hasPartner: false,
    hasCounselor: false,
    hasAdmin: false,
  });

  assert.deepEqual(roles, [{ role: 'employer', roleLabel: 'Employer', homeHref: '/employer' }]);
});

test('baseline member row does not grant dashboard access to an employer', () => {
  const roles = buildPortalSwitcherRoles({
    userRoleNames: ['member', 'employer'],
    hasMemberProfile: true,
    hasEmployer: true,
    hasPartner: false,
    hasCounselor: false,
    hasAdmin: false,
  });

  assert.deepEqual(roles, [{ role: 'employer', roleLabel: 'Employer', homeHref: '/employer' }]);
});

test('persisted member profile without competing portal access can switch to member', () => {
  const roles = buildPortalSwitcherRoles({
    userRoleNames: [],
    hasMemberProfile: true,
    hasEmployer: false,
    hasPartner: false,
    hasCounselor: false,
    hasAdmin: false,
  });

  assert.deepEqual(roles, [{ role: 'member', roleLabel: 'Member', homeHref: '/dashboard' }]);
});

test('missing profile cannot be rescued by a baseline member row', () => {
  const roles = buildPortalSwitcherRoles({
    userRoleNames: ['member'],
    hasMemberProfile: false,
    hasEmployer: false,
    hasPartner: false,
    hasCounselor: false,
    hasAdmin: false,
  });

  assert.deepEqual(roles, []);
});

test('case manager without admin access is not offered an admin/member redirect loop', () => {
  const roles = buildPortalSwitcherRoles({
    userRoleNames: ['member', 'case_manager'],
    hasMemberProfile: false,
    hasEmployer: false,
    hasPartner: false,
    hasCounselor: false,
    hasAdmin: false,
  });

  assert.deepEqual(roles, []);
});

test('does not infer counselor from admin access alone', () => {
  const roles = buildPortalSwitcherRoles({
    userRoleNames: ['admin'],
    hasMemberProfile: false,
    hasEmployer: false,
    hasPartner: false,
    hasCounselor: false,
    hasAdmin: true,
  });

  assert.deepEqual(roles, [{ role: 'admin', roleLabel: 'Admin', homeHref: '/admin' }]);
});

test('includes counselor only when the user truly has counselor access', () => {
  const roles = buildPortalSwitcherRoles({
    userRoleNames: ['admin'],
    hasMemberProfile: false,
    hasEmployer: false,
    hasPartner: false,
    hasCounselor: true,
    hasAdmin: true,
  });

  assert.deepEqual(roles, [
    { role: 'counselor', roleLabel: 'Counselor', homeHref: '/counselor' },
    { role: 'admin', roleLabel: 'Admin', homeHref: '/admin' },
  ]);
});

test('ignores member-like profile defaults when member is not truly granted', () => {
  const roles = buildPortalSwitcherRoles({
    userRoleNames: ['employer', 'admin'],
    hasMemberProfile: true,
    hasEmployer: true,
    hasPartner: false,
    hasCounselor: false,
    hasAdmin: true,
  });

  assert.deepEqual(roles, [
    { role: 'employer', roleLabel: 'Employer', homeHref: '/employer' },
    { role: 'admin', roleLabel: 'Admin', homeHref: '/admin' },
  ]);
});

test('portal layouts pass precomputed switcher fields', () => {
  const files = [
    'app/admin/layout.tsx',
    'lib/auth/memberDashboardAccess.ts',
    'app/(portal)/employer/layout.tsx',
    'app/(portal)/partner/layout.tsx',
    'app/(portal)/counselor/layout.tsx',
  ];
  for (const rel of files) {
    const src = readFileSync(join(ROOT, rel), 'utf8');
    assert.match(src, /getPortalSwitcherRoles\((?:user\.id|userId),\s*\{/, rel);
  }
});
