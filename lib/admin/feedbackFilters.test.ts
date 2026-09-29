import test from 'node:test';
import assert from 'node:assert/strict';

import { feedbackFilterWhere, feedbackPageHref, parseFeedbackFilters } from './feedbackFilters';

test('parses valid filters and drops malformed ones', () => {
  assert.deepEqual(
    parseFeedbackFilters({ type: 'counselor', rating: '2', from: '2026-09-01', to: '2026-09-24', page: '3' }),
    { type: 'counselor', rating: 2, from: '2026-09-01', to: '2026-09-24', page: 3 },
  );
  assert.deepEqual(
    parseFeedbackFilters({ type: 'nope', rating: '9', from: '2026-02-30', to: 'yesterday', page: '-1' }),
    { type: null, rating: null, from: null, to: null, page: 1 },
  );
  assert.deepEqual(parseFeedbackFilters({}), { type: null, rating: null, from: null, to: null, page: 1 });
});

test('builds an inclusive date range and exact type/rating filters', () => {
  const where = feedbackFilterWhere(parseFeedbackFilters({ type: 'training', rating: '5', from: '2026-09-01', to: '2026-09-24' }));
  assert.deepEqual(where, {
    type: 'training',
    rating: 5,
    createdAt: { gte: new Date('2026-09-01T00:00:00.000Z'), lte: new Date('2026-09-24T23:59:59.999Z') },
  });
  assert.deepEqual(feedbackFilterWhere(parseFeedbackFilters({})), {});
});

test('page links keep the filters and omit page 1', () => {
  const filters = parseFeedbackFilters({ type: 'platform', rating: '1' });
  assert.equal(feedbackPageHref(filters, 2), '/admin/feedback?type=platform&rating=1&page=2');
  assert.equal(feedbackPageHref(filters, 1), '/admin/feedback?type=platform&rating=1');
  assert.equal(feedbackPageHref(parseFeedbackFilters({}), 1), '/admin/feedback');
});
