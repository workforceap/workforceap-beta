import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COUNSELOR_EMPTY_ROUTES,
  COUNSELOR_INBOX_ZERO_EMPTY,
  COUNSELOR_MESSAGES_FILTER_EMPTY,
  COUNSELOR_MESSAGES_NO_MEMBERS_EMPTY,
  COUNSELOR_ROSTER_EMPTY,
} from './inboxEmptyState';

test('inbox-zero empty copy is kit-ready with actionable CTAs', () => {
  assert.equal(COUNSELOR_INBOX_ZERO_EMPTY.title, 'Inbox zero');
  assert.ok(COUNSELOR_INBOX_ZERO_EMPTY.description.length <= 120);
  assert.equal(COUNSELOR_INBOX_ZERO_EMPTY.primaryCta, 'Open messages');
  assert.equal(COUNSELOR_INBOX_ZERO_EMPTY.secondaryCta, 'Back to dashboard');
  assert.equal(COUNSELOR_INBOX_ZERO_EMPTY.primaryHref, '/counselor/messages');
  assert.equal(COUNSELOR_INBOX_ZERO_EMPTY.secondaryHref, '/counselor');
  assert.doesNotMatch(COUNSELOR_INBOX_ZERO_EMPTY.description, /check back soon/i);
});

test('no-members states are unavailable (an admin assigns), never first, and route to the guide', () => {
  assert.equal(COUNSELOR_MESSAGES_NO_MEMBERS_EMPTY.kind, 'unavailable');
  assert.equal(COUNSELOR_MESSAGES_NO_MEMBERS_EMPTY.tone, 'info');
  assert.equal(COUNSELOR_MESSAGES_NO_MEMBERS_EMPTY.primaryHref, COUNSELOR_EMPTY_ROUTES.guide);
  assert.equal(COUNSELOR_MESSAGES_NO_MEMBERS_EMPTY.secondaryHref, COUNSELOR_EMPTY_ROUTES.today);
  assert.equal(COUNSELOR_ROSTER_EMPTY.unassigned.kind, 'unavailable');
  assert.equal(COUNSELOR_ROSTER_EMPTY.unassigned.primaryHref, '/counselor/guide');
  assert.equal(COUNSELOR_ROSTER_EMPTY.unassigned.secondaryHref, '/counselor/resources');
  assert.equal(COUNSELOR_ROSTER_EMPTY.noCounselorRecord.kind, 'unavailable');
  assert.equal(COUNSELOR_ROSTER_EMPTY.noCounselorRecord.primaryHref, '/admin/members');
});

test('the filter-empty state is filtered (rows exist)', () => {
  assert.equal(COUNSELOR_MESSAGES_FILTER_EMPTY.kind, 'filtered');
});

test('every route an empty state points at is a counselor or admin app route', () => {
  for (const href of Object.values(COUNSELOR_EMPTY_ROUTES)) assert.match(href, /^\/(counselor|admin)(\/|$)/);
});
