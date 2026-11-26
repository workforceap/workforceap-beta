import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ANONYMIZED_EMAIL_SUFFIX,
  buildAnonymizedEmail,
  buildDeletedEmail,
  isAnonymizedEmail,
  isDeletedEmail,
  isDeletedEmailMarker,
  parseDeletedEmail,
} from './_deletedEmail';

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

test('anonymized email helper stamps the reporting marker, not the restorable deleted marker', () => {
  const anonymized = buildAnonymizedEmail(userId);

  assert.equal(anonymized.endsWith(ANONYMIZED_EMAIL_SUFFIX), true);
  assert.equal(isAnonymizedEmail(anonymized), true);
  assert.equal(isDeletedEmail(anonymized), false);
  assert.equal(isAnonymizedEmail('deleted_' + userId + '_1_person@deleted.invalid'), false);
  assert.equal(isAnonymizedEmail(null), false);
});
