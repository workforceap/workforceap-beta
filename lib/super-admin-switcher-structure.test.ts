import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const read = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

test('super-admin switcher uses server-provided state where available', () => {
  const switcher = read('components/super-admin-view-switcher.tsx');
  const shell = read('components/portal/WorkspaceShell.tsx');
  const memberShell = read('components/portal/MemberWorkspaceShell.tsx');
  const counselorShell = read('components/portal/CounselorPortalShell.tsx');
  const memberLayout = read('app/(portal)/dashboard/layout.tsx');
  const memberAccess = read('lib/auth/memberDashboardAccess.ts');
  const counselorLayout = read('app/(portal)/counselor/layout.tsx');
  const adminLayout = read('app/admin/layout.tsx');
  const adminShell = read('components/portal/AdminPortalShell.tsx');
  const headerActions = read('components/portal/PortalHeaderActions.tsx');
  const devViewToggle = read('components/portal/DevViewToggle.tsx');
  const partnerLayout = read('app/(portal)/partner/layout.tsx');
  const partnerShell = read('components/portal/PartnerPortalShell.tsx');

  assert.match(switcher, /initialIsSuperAdmin\?: boolean/);
  // WAP-27: either server-known value short-circuits the shared /api/auth/me read.
  assert.match(switcher, /export function useIsSuperAdmin\(knownSuperAdmin\?: boolean\)/);
  assert.match(switcher, /useCurrentUser\(\{ enabled: knownSuperAdmin === undefined \}\)/);
  assert.match(switcher, /const isSuperAdmin = useIsSuperAdmin\(initialIsSuperAdmin\)/);
  assert.match(shell, /const isSuperAdmin = useIsSuperAdmin\(knownSuperAdmin \?\? superAdmin\)/);
  assert.match(partnerLayout, /knownSuperAdmin=\{superUser\}/);
  assert.match(partnerShell, /knownSuperAdmin=\{knownSuperAdmin\}/);
  assert.match(adminLayout, /getProfileRole\(user\.id\)/);
  assert.match(adminLayout, /knownIsAdmin=\{effectiveRole === 'admin'\}/);
  assert.match(adminShell, /knownIsAdmin=\{knownIsAdmin\}/);
  assert.match(shell, /knownIsAdmin=\{knownIsAdmin\}/);
  assert.match(headerActions, /<DevViewToggle knownIsAdmin=\{knownIsAdmin\} \/>/);
  assert.match(devViewToggle, /useCurrentUser\(\{ enabled: knownIsAdmin === undefined \}\)/);
  assert.doesNotMatch(switcher, /fetch\('\/api\/auth\/me'/);
  assert.equal((shell.match(/<SuperAdminViewSwitcher initialIsSuperAdmin=\{isSuperAdmin\} \/>/g) ?? []).length, 2);
  assert.match(memberShell, /superAdmin=\{superAdmin\}/);
  assert.match(counselorShell, /superAdmin=\{superAdmin\}/);
  assert.match(memberLayout, /getMemberDashboardAccess\(user\.id\)/);
  assert.match(memberAccess, /isSuperAdmin\(userId\)/);
  assert.match(memberLayout, /<MemberWorkspaceShell[\s\S]*superAdmin=\{superAdmin\}[\s\S]*portalRoles=\{portalRoles\}/);
  assert.match(counselorLayout, /isSuperAdmin\(user\.id\)/);
  assert.match(counselorLayout, /<CounselorPortalShell[\s\S]*superAdmin=\{superAdmin\}[\s\S]*portalRoles=\{portalRoles\}/);
});
