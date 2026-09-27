import test from 'node:test';
import assert from 'node:assert/strict';

import { buildDeletedEmail, isDeletedEmail, isDeletedEmailMarker, parseDeletedEmail } from './_deletedEmail';
import { buildErasedEmail, isErasedEmailMarker } from '@/lib/member/deletedEmail';

const userId = '123e4567-e89b-12d3-a456-426614174000';

test('deleted email helper round-trips original email', () => {
  const originalEmail = 'person@example.com';
  const deletedEmail = buildDeletedEmail(userId, 1717080000000, originalEmail);

  assert.equal(deletedEmail, `deleted_${userId}_1717080000000_${originalEmail}@deleted.invalid`);
  assert.equal(parseDeletedEmail(deletedEmail ?? ''), originalEmail);
  assert.equal(isDeletedEmail(deletedEmail ?? ''), true);
});

test('deleted email helper refuses values that would exceed database email length', () => {
  const localPart = 'a'.repeat(188);
  const longEmail = `${localPart}@example.com`;

  assert.equal(longEmail.length, 200);
  assert.equal(buildDeletedEmail(userId, 1717080000000, longEmail), null);
});

test('deleted email helper does not parse truncated sentinel values', () => {
  const malformed = `deleted_${userId}_1717080000000_person@example.com`;

  assert.equal(isDeletedEmail(malformed), false);
  assert.equal(isDeletedEmailMarker(malformed), true);
  assert.equal(parseDeletedEmail(malformed), null);
});

test('admin erase marker is irreversible and bound to the erased User id', () => {
  const marker = buildErasedEmail(userId, 1717080000000);
  assert.equal(marker, `erased_${userId}_1717080000000@deleted.invalid`);
  assert.equal(parseDeletedEmail(marker), null);
  assert.equal(isErasedEmailMarker(marker, userId), true);
  assert.equal(isErasedEmailMarker(marker, '123e4567-e89b-12d3-a456-426614174001'), false);
});
