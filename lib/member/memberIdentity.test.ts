import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMemberShellIdentity, memberInitials, MEMBER_IDENTITY_HREF } from './memberIdentity';

test('initials come from the saved name, then the email, never invented', () => {
  assert.equal(memberInitials('Alex Rivera'), 'AR');
  assert.equal(memberInitials('  maria  de la cruz '), 'MC');
  assert.equal(memberInitials('alex'), 'A');
  assert.equal(memberInitials(null, 'sam@example.org'), 'S');
  assert.equal(memberInitials('', ''), '?');
  assert.equal(memberInitials(undefined, undefined), '?');
});

test('identity prefers the full name and keeps the email as a secondary line', () => {
  const identity = buildMemberShellIdentity({
    fullName: 'Alex Rivera',
    email: 'alex@example.org',
    avatarUrl: 'https://cdn.example/photo.webp',
  });
  assert.deepEqual(identity, {
    name: 'Alex Rivera',
    email: 'alex@example.org',
    initials: 'AR',
    avatarUrl: 'https://cdn.example/photo.webp',
    href: MEMBER_IDENTITY_HREF,
  });
});

test('identity falls back to the email as the name without repeating it', () => {
  const identity = buildMemberShellIdentity({ fullName: null, email: 'alex@example.org' });
  assert.equal(identity.name, 'alex@example.org');
  assert.equal(identity.email, null);
  assert.equal(identity.initials, 'A');
  assert.equal(identity.avatarUrl, null);
});

test('identity never renders an empty name or a blank photo URL', () => {
  const identity = buildMemberShellIdentity({ fullName: '   ', email: '', avatarUrl: '  ' });
  assert.equal(identity.name, 'Member');
  assert.equal(identity.email, null);
  assert.equal(identity.initials, '?');
  assert.equal(identity.avatarUrl, null);
});
