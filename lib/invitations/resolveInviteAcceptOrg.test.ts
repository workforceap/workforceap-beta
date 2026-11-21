import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildInviteAcceptExistingUserUpdate,
  chooseInviteAcceptOrganizationId,
  decideInviteAcceptExistingCounselorLink,
  decideInviteAcceptExistingPartnerLink,
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

test('invite-accept assigns a partner link only when the existing user has none', () => {
  assert.equal(
    decideInviteAcceptExistingPartnerLink({
      invitationRole: 'partner',
      targetPartnerId: 'partner-b',
      existingPartnerId: null,
    }),
    'assign',
  );
});

test('invite-accept keeps an existing same-partner link instead of rewriting it', () => {
  assert.equal(
    decideInviteAcceptExistingPartnerLink({
      invitationRole: 'partner',
      targetPartnerId: 'partner-a',
      existingPartnerId: 'partner-a',
    }),
    'keep',
  );
});

test('invite-accept refuses to move an existing partner user onto another partner', () => {
  assert.equal(
    decideInviteAcceptExistingPartnerLink({
      invitationRole: 'partner',
      targetPartnerId: 'partner-b',
      existingPartnerId: 'partner-a',
    }),
    'refuse',
  );
});

test('invite-accept ignores partner writes for non-partner invites', () => {
  assert.equal(
    decideInviteAcceptExistingPartnerLink({
      invitationRole: 'member',
      targetPartnerId: 'partner-b',
      existingPartnerId: 'partner-a',
    }),
    'keep',
  );
});

test('invite-accept assigns a counselor row only when the existing user has none', () => {
  assert.equal(
    decideInviteAcceptExistingCounselorLink({
      invitationRole: 'counselor',
      targetPartnerId: 'partner-b',
      existingCounselor: false,
      existingPartnerId: null,
    }),
    'assign',
  );
});

test('invite-accept keeps an existing counselor on the same partner', () => {
  assert.equal(
    decideInviteAcceptExistingCounselorLink({
      invitationRole: 'counselor',
      targetPartnerId: null,
      existingCounselor: true,
      existingPartnerId: null,
    }),
    'keep',
  );
});

test('invite-accept refuses to move an existing counselor onto another partner', () => {
  assert.equal(
    decideInviteAcceptExistingCounselorLink({
      invitationRole: 'counselor',
      targetPartnerId: 'partner-b',
      existingCounselor: true,
      existingPartnerId: 'partner-a',
    }),
    'refuse',
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
