import assert from 'node:assert/strict';
import test from 'node:test';

import { MENTORS_ADMIN_EMPTY, MENTORS_MEMBER_EMPTY } from './mentorsEmptyState';

// The kit surfaces that render this copy are covered by rendering them in
// tests/components/mentors-empty-state.spec.tsx.

test('member mentors empty copy is honest and actionable', () => {
  assert.equal(MENTORS_MEMBER_EMPTY.kind, 'unavailable');
  assert.equal(MENTORS_MEMBER_EMPTY.title, 'No mentors to request yet');
  assert.ok(MENTORS_MEMBER_EMPTY.description.length <= 140);
  assert.doesNotMatch(MENTORS_MEMBER_EMPTY.description, /check back soon/i);
  assert.doesNotMatch(MENTORS_MEMBER_EMPTY.description, /we're adding/i);
  assert.match(MENTORS_MEMBER_EMPTY.description, /counselor/i);
  assert.equal(MENTORS_MEMBER_EMPTY.statusTone, 'warn');
  assert.equal(MENTORS_MEMBER_EMPTY.primaryCta.href, '/dashboard/messages');
  assert.equal(MENTORS_MEMBER_EMPTY.secondaryCta.href, '/dashboard/jobs');
});

test('admin mentors empty points at the apply + approve path', () => {
  assert.equal(MENTORS_ADMIN_EMPTY.kind, 'first');
  assert.equal(MENTORS_ADMIN_EMPTY.title, 'No mentors in the directory');
  assert.match(MENTORS_ADMIN_EMPTY.description, /approve/i);
  assert.equal(MENTORS_ADMIN_EMPTY.primaryCta.href, '/mentor/apply');
});
