import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanFieldLabel, describeMissingRequired, missingRequiredLabels } from './requiredFields';

test('missingRequiredLabels keeps only unsatisfied checks, in order', () => {
  const labels = missingRequiredLabels([
    { label: 'First name', ok: true },
    { label: 'Email', ok: false },
    { label: 'Employment status', ok: false },
  ]);
  assert.deepEqual(labels, ['Email', 'Employment status']);
});

test('describeMissingRequired writes one sentence and dedupes', () => {
  assert.equal(describeMissingRequired([]), null);
  assert.equal(describeMissingRequired(['Email']), 'Still needed: Email.');
  assert.equal(
    describeMissingRequired(['First name', 'Email', 'Email', ' ']),
    'Still needed: First name, Email.',
  );
  assert.equal(
    describeMissingRequired(['Leader'], { leadIn: 'Before you can create this subgroup' }),
    'Before you can create this subgroup: Leader.',
  );
});

test('cleanFieldLabel drops the required marker and extra whitespace', () => {
  assert.equal(cleanFieldLabel('First Name *'), 'First Name');
  assert.equal(cleanFieldLabel('  Email   *  '), 'Email');
  assert.equal(cleanFieldLabel('Title (required)'), 'Title');
  assert.equal(cleanFieldLabel(null), '');
});
