import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MEMBER_REQUEST_FAILURE,
  describeMemberRequestException,
  describeMemberRequestFailure,
  readMemberRequestFailure,
} from './memberRequestFailure';

test('5xx answers become one plain "try later" sentence regardless of the server body', () => {
  assert.equal(describeMemberRequestFailure(503), MEMBER_REQUEST_FAILURE.unavailable);
  assert.equal(describeMemberRequestFailure(500, 'Internal server error'), MEMBER_REQUEST_FAILURE.unavailable);
  assert.equal(describeMemberRequestFailure(502, '<html>Bad Gateway</html>'), MEMBER_REQUEST_FAILURE.unavailable);
});

test('rate limits, expired sessions and oversized input each get their own sentence', () => {
  assert.equal(describeMemberRequestFailure(429, 'Rate limit exceeded'), MEMBER_REQUEST_FAILURE.busy);
  assert.equal(describeMemberRequestFailure(401, 'Unauthorized'), MEMBER_REQUEST_FAILURE.session);
  assert.equal(describeMemberRequestFailure(403), MEMBER_REQUEST_FAILURE.session);
  assert.equal(describeMemberRequestFailure(413, 'Input too large'), MEMBER_REQUEST_FAILURE.tooLarge);
});

test('4xx validation answers keep the specific server sentence, else the generic one', () => {
  assert.equal(
    describeMemberRequestFailure(400, 'Only PDF, DOCX, or TXT files are supported'),
    'Only PDF, DOCX, or TXT files are supported',
  );
  assert.equal(describeMemberRequestFailure(400, '   '), MEMBER_REQUEST_FAILURE.generic);
  assert.equal(describeMemberRequestFailure(404, { nested: true }), MEMBER_REQUEST_FAILURE.generic);
});

test('readMemberRequestFailure tolerates HTML and empty bodies and reads {error} or {message}', async () => {
  const html = new Response('<!doctype html><title>503</title>', { status: 503, headers: { 'content-type': 'text/html' } });
  assert.equal(await readMemberRequestFailure(html), MEMBER_REQUEST_FAILURE.unavailable);

  const empty = new Response(null, { status: 500 });
  assert.equal(await readMemberRequestFailure(empty), MEMBER_REQUEST_FAILURE.unavailable);

  const withError = new Response(JSON.stringify({ error: 'Provide a file' }), { status: 400, headers: { 'content-type': 'application/json' } });
  assert.equal(await readMemberRequestFailure(withError), 'Provide a file');

  const withMessage = new Response(JSON.stringify({ message: 'Pick a target role first.' }), { status: 400, headers: { 'content-type': 'application/json' } });
  assert.equal(await readMemberRequestFailure(withMessage), 'Pick a target role first.');
});

test('thrown fetch failures distinguish a timeout from a network error', () => {
  const abort = new Error('aborted');
  abort.name = 'AbortError';
  assert.equal(describeMemberRequestException(abort), MEMBER_REQUEST_FAILURE.timeout);
  assert.equal(describeMemberRequestException(new TypeError('Failed to fetch')), MEMBER_REQUEST_FAILURE.network);
  assert.equal(describeMemberRequestException('offline'), MEMBER_REQUEST_FAILURE.network);
});
