/**
 * Source / copy checks: Mike ops ask — layoff / last-employer question must
 * appear in the adult apply eligibility UI (not gated off the form).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { layoffCompanyApplicable } from './eligibilityExtendedFields';

const root = join(import.meta.dirname, '../..');

test('en apply copy uses Mike wording for layoff / last employer', () => {
  const en = JSON.parse(readFileSync(join(root, 'messages/en.json'), 'utf8')) as {
    apply: Record<string, string>;
  };
  const label = en.apply.eligibilityLayoffCompanyLabel;
  assert.match(label, /company/i);
  assert.match(label, /laid off/i);
  assert.match(label, /last work/i);
  assert.equal(
    label,
    'What company did you get laid off from, or last work for?',
  );
});

test('layoff company question is never gated off the eligibility form', () => {
  // The helper decides whether the field renders; it is always applicable.
  for (const answers of [
    { unemployedOrUnderemployed: null, receivingUnemployment: null, exhaustedUnemployment: null },
    { unemployedOrUnderemployed: 'no', receivingUnemployment: 'no', exhaustedUnemployment: 'no' },
    { unemployedOrUnderemployed: 'yes', receivingUnemployment: 'yes', exhaustedUnemployment: null },
  ] as const) {
    assert.equal(layoffCompanyApplicable(answers), true);
  }
});

// The three eligibility forms (apply, member portal, token link) rendering the
// field with Mike's wording are exercised in tests/app/eligibility-layoff-company.spec.tsx.
