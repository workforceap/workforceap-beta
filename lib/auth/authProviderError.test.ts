import test from 'node:test';
import assert from 'node:assert/strict';
import {
  authProviderFailureStatus,
  classifyAuthProviderError,
  describeAuthProviderFailure,
  isAuthProviderConfigError,
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

test('anything else stays unknown and maps to a generic 400', () => {
  assert.equal(classifyAuthProviderError(null), 'unknown');
  assert.equal(classifyAuthProviderError({ message: 'Something odd' }), 'unknown');
  assert.equal(authProviderFailureStatus('unknown'), 400);
  assert.equal(authProviderFailureStatus('validation'), 400);
  assert.equal(authProviderFailureStatus('unavailable'), 503);
  assert.equal(authProviderFailureStatus('duplicate'), 409);
});

test('messages never echo provider text and invite copy starts with "Invite not sent:"', () => {
  for (const kind of ['duplicate', 'validation', 'unavailable', 'unknown'] as const) {
    const invite = describeAuthProviderFailure(kind, 'invite');
    assert.ok(invite.startsWith('Invite not sent: '), invite);
    const create = describeAuthProviderFailure(kind, 'create');
    assert.ok(create.length > 20);
    assert.doesNotMatch(create, /ECONNREFUSED|fetch failed|GoTrue|Supabase/i);
  }
  assert.match(describeAuthProviderFailure('unavailable', 'create'), /unavailable right now/);
  assert.match(describeAuthProviderFailure('validation', 'create'), /rejected that email address/);
});
