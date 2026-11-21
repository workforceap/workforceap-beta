import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildInviteAcceptExistingUserUpdate,
  chooseInviteAcceptOrganizationId,
  decideInviteAcceptExistingProfileRole,
} from './resolveInviteAcceptOrg';

const INVITER_ORG = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const REQUEST_ORG = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const DEFAULT_ORG = '00000000-0000-4000-8000-000000000001';

test('invite-accept prefers inviter org over request org and default', () => {
  assert.equal(
    chooseInviteAcceptOrganizationId(INVITER_ORG, REQUEST_ORG, DEFAULT_ORG),
    INVITER_ORG,
  );
});

test('invite-accept uses request org when inviter has no org', () => {
  assert.equal(
    chooseInviteAcceptOrganizationId(null, REQUEST_ORG, DEFAULT_ORG),
    REQUEST_ORG,
  );
  assert.equal(
    chooseInviteAcceptOrganizationId('   ', REQUEST_ORG, DEFAULT_ORG),
    REQUEST_ORG,
  );
});

test('invite-accept uses default org only as last resort', () => {
  assert.equal(
    chooseInviteAcceptOrganizationId(null, null, DEFAULT_ORG),
    DEFAULT_ORG,
  );
  assert.equal(
    chooseInviteAcceptOrganizationId('', undefined, DEFAULT_ORG),
    DEFAULT_ORG,
  );
});

test('existing invitee update never includes organizationId', () => {
  const patch = buildInviteAcceptExistingUserUpdate({
    fullName: 'Ada Lovelace',
    email: 'ada@example.com',
    phone: '555-0100',
    enrolledProgram: 'it-support',
    enrolledAt: new Date('2026-01-01T00:00:00Z'),
  });
  assert.equal(Object.hasOwn(patch, 'organizationId'), false);
  assert.equal(patch.fullName, 'Ada Lovelace');
  assert.equal(patch.deletedAt, null);
  assert.equal(patch.email, 'ada@example.com');
});

test('invite-accept writes a profile role for members and missing profiles', () => {
  assert.equal(decideInviteAcceptExistingProfileRole(null, 'admin'), 'write');
  assert.equal(decideInviteAcceptExistingProfileRole('', 'counselor'), 'write');
  assert.equal(decideInviteAcceptExistingProfileRole('member', 'admin'), 'write');
  assert.equal(decideInviteAcceptExistingProfileRole('member', 'member'), 'write');
});

test('invite-accept keeps a matching staff profile and refuses demotion', () => {
  assert.equal(decideInviteAcceptExistingProfileRole('admin', 'admin'), 'keep');
  assert.equal(decideInviteAcceptExistingProfileRole('counselor', 'counselor'), 'keep');
  assert.equal(decideInviteAcceptExistingProfileRole('partner', 'partner'), 'keep');
  assert.equal(decideInviteAcceptExistingProfileRole('super_admin', 'member'), 'refuse');
  assert.equal(decideInviteAcceptExistingProfileRole('Super Admin', 'admin'), 'refuse');
  assert.equal(decideInviteAcceptExistingProfileRole('admin', 'member'), 'refuse');
  assert.equal(decideInviteAcceptExistingProfileRole('counselor', 'member'), 'refuse');
  assert.equal(decideInviteAcceptExistingProfileRole('case_manager', 'partner'), 'refuse');
});
