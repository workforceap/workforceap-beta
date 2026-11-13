import assert from 'node:assert/strict';
import test from 'node:test';

import { selectResumeEditorSourceText } from './resumeEditorSource';

const LONG_TAIL = 'Later roles, certifications, and volunteer work stay on the stored draft.';
const FULL_DRAFT = `${'Operations coordinator. '.repeat(600)}${LONG_TAIL}`;
const TOOL_EXCERPT = FULL_DRAFT.slice(0, 12_000);

test('prefers the uncropped enhanced draft over a truncated plain-text excerpt', () => {
  assert.equal(
    selectResumeEditorSourceText({
      enhancedText: FULL_DRAFT,
      resumePlainText: TOOL_EXCERPT,
    }),
    FULL_DRAFT.trim(),
  );
  assert.match(selectResumeEditorSourceText({
    enhancedText: FULL_DRAFT,
    resumePlainText: TOOL_EXCERPT,
  }), /volunteer work stay on the stored draft/);
});

test('falls back to extracted plain text when no enhanced txt is available', () => {
  assert.equal(
    selectResumeEditorSourceText({
      enhancedText: null,
      resumePlainText: 'Database administrator with SQL, backup, and recovery experience.',
    }),
    'Database administrator with SQL, backup, and recovery experience.',
  );
});

test('rejects unsafe enhanced bytes so a truncated extract cannot be overwritten from poison', () => {
  assert.equal(
    selectResumeEditorSourceText({
      enhancedText: '%PDF-1.7 fake enhanced object',
      resumePlainText: 'Database administrator with SQL, backup, and recovery experience.',
    }),
    'Database administrator with SQL, backup, and recovery experience.',
  );
});
