import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WEAK_PASSWORD_MESSAGE,
  authProviderFailureStatus,
  classifyAuthProviderError,
  describeAuthProviderFailure,
  isAuthProviderConfigError,
  isWeakPasswordError,
} from './authProviderError';

test('duplicate identities are recognised by code or message', () => {
  assert.equal(classifyAuthProviderError({ code: 'user_already_exists', status: 422 }), 'duplicate');
  assert.equal(classifyAuthProviderError({ message: 'User already registered' }), 'duplicate');
  assert.equal(classifyAuthProviderError({ message: 'A user with this email address has already been registered' }), 'duplicate');
});

test('network and 5xx failures read as the provider being unavailable', () => {
  assert.equal(classifyAuthProviderError({ name: 'AuthRetryableFetchError', message: 'fetch failed', status: 0 }), 'unavailable');
  assert.equal(classifyAuthProviderError(new TypeError('fetch failed')), 'unavailable');
  assert.equal(classifyAuthProviderError({ status: 503, message: 'Service Unavailable' }), 'unavailable');
  assert.equal(classifyAuthProviderError({ message: 'connect ECONNREFUSED 127.0.0.1:54321' }), 'unavailable');
});

test('missing provider configuration is unavailable, not a bad request', () => {
  const err = new Error('SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL required for admin operations');
  assert.equal(isAuthProviderConfigError(err), true);
  assert.equal(classifyAuthProviderError(err), 'unavailable');
});

test('provider validation errors are reported as validation', () => {
  assert.equal(classifyAuthProviderError({ code: 'email_address_invalid', status: 400 }), 'validation');
  assert.equal(classifyAuthProviderError({ status: 422, message: 'Unable to validate email address: invalid format' }), 'validation');
});

test('a weak password is its own kind with clear sentence-case copy (WAP-26)', () => {
  const byCode = { code: 'weak_password', message: 'Password is known to be weak and easy to guess, please choose a different one.', status: 422 };
  const byName = { name: 'AuthWeakPasswordError', message: 'Password should contain at least one number.', status: 422 };
  const byText = { message: 'Password should be at least 6 characters.', status: 422 };
  for (const error of [byCode, byName, byText]) {
    assert.equal(isWeakPasswordError(error), true);
    assert.equal(classifyAuthProviderError(error), 'weak_password');
  }
  assert.equal(isWeakPasswordError({ code: 'same_password', message: 'New password should be different from the old password.' }), false);
  assert.equal(isWeakPasswordError({ code: 'email_address_invalid', message: 'Unable to validate email address: invalid format' }), false);
  assert.equal(isWeakPasswordError(null), false);
  assert.equal(authProviderFailureStatus('weak_password'), 400);
  assert.equal(describeAuthProviderFailure('weak_password', 'create'), WEAK_PASSWORD_MESSAGE);
  assert.equal(WEAK_PASSWORD_MESSAGE, 'Choose a stronger password: at least 8 characters, not a commonly used password.');
  assert.match(WEAK_PASSWORD_MESSAGE, /^[A-Z][^A-Z]*$/, 'sentence case: one capital, no shouting');
});

test('anything else stays unknown and maps to a generic 400', () => {
  assert.equal(classifyAuthProviderError(null), 'unknown');
  assert.equal(classifyAuthProviderError({ message: 'Something odd' }), 'unknown');
  assert.equal(authProviderFailureStatus('unknown'), 400);
  assert.equal(authProviderFailureStatus('validation'), 400);
  assert.equal(authProviderFailureStatus('unavailable'), 503);
  assert.equal(authProviderFailureStatus('duplicate'), 409);
});

test('messages never echo provider text and invite copy starts with "Invite not sent:"', () => {
  for (const kind of ['duplicate', 'weak_password', 'validation', 'unavailable', 'unknown'] as const) {
    const invite = describeAuthProviderFailure(kind, 'invite');
    assert.ok(invite.startsWith('Invite not sent: '), invite);
    const create = describeAuthProviderFailure(kind, 'create');
    assert.ok(create.length > 20);
    assert.doesNotMatch(create, /ECONNREFUSED|fetch failed|GoTrue|Supabase/i);
  }
  assert.match(describeAuthProviderFailure('unavailable', 'create'), /unavailable right now/);
  assert.match(describeAuthProviderFailure('validation', 'create'), /rejected that email address/);
});
