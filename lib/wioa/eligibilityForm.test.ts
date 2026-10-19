import test from 'node:test';
import assert from 'node:assert/strict';
import { Prisma } from '@prisma/client';
import { eligibilityWriteFailure } from './eligibilityForm';

test('a missing or deleted member is a 404, never a conflict', () => {
  assert.deepEqual(
    eligibilityWriteFailure(new Error('ELIGIBILITY_SUBJECT_UNAVAILABLE')),
    { status: 404, error: 'Member not found' },
  );
});

test('an optimistic-lock miss and a Prisma serialization conflict both tell the staff to reload', () => {
  assert.deepEqual(
    eligibilityWriteFailure(new Error('ELIGIBILITY_FORM_CONFLICT')),
    { status: 409, error: 'Your screening changed. Reload and try again.' },
  );
  const serialization = new Prisma.PrismaClientKnownRequestError('Serialization conflict', {
    code: 'P2034',
    clientVersion: 'test',
  });
  assert.deepEqual(eligibilityWriteFailure(serialization), {
    status: 409,
    error: 'Your screening changed. Reload and try again.',
  });
});

test('unrelated failures stay unmapped so the route can fail closed', () => {
  assert.equal(eligibilityWriteFailure(new Error('connection refused')), null);
  assert.equal(eligibilityWriteFailure(null), null);
  assert.equal(eligibilityWriteFailure('ELIGIBILITY_FORM_CONFLICT'), null);
});
