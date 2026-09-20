import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import {
  formatPublicAssistancePrograms,
  normalizePublicAssistanceFollowUp,
  normalizePublicAssistancePrograms,
  publicAssistanceFollowUpComplete,
  publicAssistanceFollowUpIssue,
  publicAssistanceFollowUpSchema,
  wicOnlyPublicAssistance,
} from './publicAssistance';

test('normalizePublicAssistancePrograms dedupes, drops junk and keeps canonical order', () => {
  assert.deepEqual(normalizePublicAssistancePrograms(['snap', 'tanf', 'snap', 'bogus', 42]), ['tanf', 'snap']);
  assert.deepEqual(normalizePublicAssistancePrograms(undefined), []);
  assert.deepEqual(normalizePublicAssistancePrograms('snap'), []);
});

test('follow-up answers are cleared unless the parent answer is yes', () => {
  assert.deepEqual(
    normalizePublicAssistanceFollowUp({ snapWic: 'no', publicAssistancePrograms: ['snap'], publicAssistanceHelpRequested: 'yes' }),
    { publicAssistancePrograms: [], publicAssistanceHelpRequested: null },
  );
  assert.deepEqual(
    normalizePublicAssistanceFollowUp({ snapWic: 'yes', publicAssistancePrograms: ['wic', 'other_unsure'], publicAssistanceHelpRequested: 'yes' }),
    { publicAssistancePrograms: ['wic', 'other_unsure'], publicAssistanceHelpRequested: 'yes' },
  );
  assert.deepEqual(
    normalizePublicAssistanceFollowUp({ snapWic: 'yes', publicAssistanceHelpRequested: 'maybe' }),
    { publicAssistancePrograms: [], publicAssistanceHelpRequested: null },
  );
});

test('legacy yes-no payloads without the new keys still parse and validate', () => {
  const schema = z.object({ snapWic: z.enum(['yes', 'no']).optional().nullable(), ...publicAssistanceFollowUpSchema });
  assert.equal(schema.safeParse({ snapWic: 'yes' }).success, true);
  assert.equal(publicAssistanceFollowUpIssue({ snapWic: 'yes', publicAssistancePrograms: undefined }), null);
  assert.equal(publicAssistanceFollowUpIssue({ snapWic: 'yes', publicAssistancePrograms: null }), null);
});

test('new-shape payloads must select at least one program after yes', () => {
  assert.match(publicAssistanceFollowUpIssue({ snapWic: 'yes', publicAssistancePrograms: [] }) ?? '', /at least one/);
  assert.equal(publicAssistanceFollowUpIssue({ snapWic: 'yes', publicAssistancePrograms: ['other_unsure'] }), null);
  assert.equal(publicAssistanceFollowUpIssue({ snapWic: 'no', publicAssistancePrograms: [] }), null);
  const schema = z.object(publicAssistanceFollowUpSchema);
  assert.equal(schema.safeParse({ publicAssistancePrograms: ['medicaid'] }).success, false);
});

test('UI completion gate requires programs and the help answer only after yes', () => {
  assert.equal(publicAssistanceFollowUpComplete({ snapWic: 'no', publicAssistancePrograms: [], publicAssistanceHelpRequested: null }), true);
  assert.equal(publicAssistanceFollowUpComplete({ snapWic: 'yes', publicAssistancePrograms: [], publicAssistanceHelpRequested: 'no' }), false);
  assert.equal(publicAssistanceFollowUpComplete({ snapWic: 'yes', publicAssistancePrograms: ['tanf'], publicAssistanceHelpRequested: null }), false);
  assert.equal(publicAssistanceFollowUpComplete({ snapWic: 'yes', publicAssistancePrograms: ['tanf'], publicAssistanceHelpRequested: 'no' }), true);
});

test('WIC alone is flagged so routing does not overstate it', () => {
  assert.equal(wicOnlyPublicAssistance(['wic']), true);
  assert.equal(wicOnlyPublicAssistance(['wic', 'snap']), false);
  assert.equal(wicOnlyPublicAssistance([]), false);
  assert.equal(wicOnlyPublicAssistance(null), false);
});

test('staff labels are joined in canonical order', () => {
  assert.equal(formatPublicAssistancePrograms(['snap', 'tanf']), 'TANF, SNAP / food stamps');
  assert.equal(formatPublicAssistancePrograms([]), '');
});
