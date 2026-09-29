import test from 'node:test';
import assert from 'node:assert/strict';
import { HELP_REQUEST_TEAM_RECIPIENT, helpRequestAudienceOf, helpRequestRecipientFrom } from './helpRequestRecipient';

test('an assigned counselor with an email address receives the request', () => {
  assert.deepEqual(helpRequestRecipientFrom({ email: ' dana@workforceap.org ', fullName: ' Dana Reyes ' }), {
    kind: 'counselor',
    email: 'dana@workforceap.org',
    name: 'Dana Reyes',
  });
  assert.deepEqual(helpRequestRecipientFrom({ email: 'dana@workforceap.org', fullName: '' }), {
    kind: 'counselor',
    email: 'dana@workforceap.org',
    name: null,
  });
});

test('no counselor, or one without an address, falls back to the team inbox', () => {
  for (const row of [null, undefined, { email: null, fullName: 'Dana Reyes' }, { email: '   ', fullName: 'Dana Reyes' }]) {
    assert.deepEqual(helpRequestRecipientFrom(row), { kind: 'team', email: 'info@workforceap.org', name: null });
  }
  assert.equal(helpRequestRecipientFrom(null), HELP_REQUEST_TEAM_RECIPIENT);
});

test('the member-facing audience carries the saved name, never the counselor address', () => {
  const audience = helpRequestAudienceOf({ kind: 'counselor', email: 'dana@workforceap.org', name: 'Dana Reyes' });
  assert.deepEqual(audience, { kind: 'counselor', name: 'Dana Reyes' });
  assert.ok(!JSON.stringify(audience).includes('@'));
  assert.deepEqual(helpRequestAudienceOf(HELP_REQUEST_TEAM_RECIPIENT), { kind: 'team' });
});
