import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildInviteAcceptExistingUserUpdate,
  chooseInviteAcceptOrganizationId,
  decideInviteAcceptExistingProgram,
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

test('invite-accept assigns a program only when the existing member has none', () => {
  assert.equal(
    decideInviteAcceptExistingProgram({
      invitationRole: 'member',
      invitationProgramSlug: 'it-support-professional-certificate-google',
      enrolledProgram: null,
      primaryProgramSlug: null,
    }),
    'assign',
  );
});

test('invite-accept keeps an existing equivalent assignment instead of restamping enrolledAt', () => {
  assert.equal(
    decideInviteAcceptExistingProgram({
      invitationRole: 'member',
      invitationProgramSlug: 'comptia-a-professional-certificate',
      enrolledProgram: 'comptia-a-plus',
      primaryProgramSlug: 'comptia-a-plus',
    }),
    'keep',
  );
  assert.equal(
    decideInviteAcceptExistingProgram({
      invitationRole: 'member',
      invitationProgramSlug: 'it-support-professional-certificate-google',
      enrolledProgram: 'it-support-professional-certificate-google',
      primaryProgramSlug: null,
    }),
    'keep',
  );
});

test('invite-accept refuses to switch an existing member onto another program', () => {
  assert.equal(
    decideInviteAcceptExistingProgram({
      invitationRole: 'member',
      invitationProgramSlug: 'comptia-a-professional-certificate',
      enrolledProgram: 'it-support-professional-certificate-google',
      primaryProgramSlug: 'it-support-professional-certificate-google',
    }),
    'refuse',
  );
});

test('invite-accept ignores program writes for non-member invites', () => {
  assert.equal(
    decideInviteAcceptExistingProgram({
      invitationRole: 'counselor',
      invitationProgramSlug: 'it-support-professional-certificate-google',
      enrolledProgram: null,
      primaryProgramSlug: null,
    }),
    'keep',
  );
});
