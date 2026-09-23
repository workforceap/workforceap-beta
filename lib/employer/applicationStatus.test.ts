import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { allowedNextJobApplicationStatuses, canTransitionJobApplicationStatus } from './applicationStatus';

describe('canTransitionJobApplicationStatus', () => {
  it('allows pending to reviewing', () => {
    assert.equal(canTransitionJobApplicationStatus('pending', 'reviewing'), true);
  });
  it('blocks pending to hired', () => {
    assert.equal(canTransitionJobApplicationStatus('pending', 'hired'), false);
  });
  it('allows rejected to reopen as pending', () => {
    assert.equal(canTransitionJobApplicationStatus('rejected', 'pending'), true);
  });
  it('blocks hired to anything', () => {
    assert.equal(canTransitionJobApplicationStatus('hired', 'reviewing'), false);
  });
  it('allows pending to interview (the work-queue "Move to interview" button)', () => {
    assert.equal(canTransitionJobApplicationStatus('pending', 'interview'), true);
  });
  it('blocks hired to every other status', () => {
    for (const to of ['pending', 'reviewing', 'interview', 'offered', 'rejected'] as const) {
      assert.equal(canTransitionJobApplicationStatus('hired', to), false, `hired -> ${to}`);
    }
  });
  it('blocks interview to hired (an offer comes first)', () => {
    assert.equal(canTransitionJobApplicationStatus('interview', 'hired'), false);
  });
});

describe('allowedNextJobApplicationStatuses', () => {
  it('lists the moves out of pending', () => {
    assert.deepEqual(allowedNextJobApplicationStatuses('pending'), ['reviewing', 'interview', 'rejected']);
  });
  it('has no moves out of hired', () => {
    assert.deepEqual(allowedNextJobApplicationStatuses('hired'), []);
  });
  it('returns a copy the caller cannot use to change the map', () => {
    allowedNextJobApplicationStatuses('pending').push('hired');
    assert.equal(canTransitionJobApplicationStatus('pending', 'hired'), false);
  });
});
