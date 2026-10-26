import test from 'node:test';
import assert from 'node:assert/strict';

import {
  COUNSELOR_WORKSPACE_PATH,
  counselorWorkspaceHref,
  parseCounselorAttentionFilter,
  parseCounselorWorkspaceView,
} from './workspace';

test('unknown or missing counselor views fall back to Needs attention', () => {
  assert.equal(parseCounselorWorkspaceView('decisions'), 'decisions');
  assert.equal(parseCounselorWorkspaceView(['followup', 'overview']), 'followup');
  assert.equal(parseCounselorWorkspaceView('queue'), 'attention');
  assert.equal(parseCounselorWorkspaceView(undefined), 'attention');
});

test('unknown or missing attention filters fall back to all', () => {
  assert.equal(parseCounselorAttentionFilter('at-risk'), 'at-risk');
  assert.equal(parseCounselorAttentionFilter(['inactive']), 'inactive');
  assert.equal(parseCounselorAttentionFilter('overdue'), 'all');
  assert.equal(parseCounselorAttentionFilter(undefined), 'all');
});

test('counselor workspace hrefs keep extras and ignore a second view key', () => {
  assert.equal(
    counselorWorkspaceHref('attention', { filter: 'at-risk' }),
    `${COUNSELOR_WORKSPACE_PATH}?view=attention&filter=at-risk`,
  );
  assert.equal(
    counselorWorkspaceHref('overview', { view: 'decisions', page: '2' }),
    `${COUNSELOR_WORKSPACE_PATH}?view=overview&page=2`,
  );
  assert.equal(
    counselorWorkspaceHref('replies', { filter: undefined }),
    `${COUNSELOR_WORKSPACE_PATH}?view=replies`,
  );
});
