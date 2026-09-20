import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LEGACY_PROGRAM_TITLE_VALUES,
  PROGRAMS,
  PROGRAM_SLUG_ALIASES,
  SUPPORTED_PROGRAM_STORAGE_VALUES,
} from './content/programs';

// The SQL paging contract (current-program join, eligibility filter before
// LIMIT/OFFSET, tenant predicate, crossTenantOK) is exercised in
// tests/lib/job-ready-candidates.spec.ts; the page's query arguments in
// tests/app/admin-job-ready-page.spec.tsx.

test('supported program storage values cover canonical slugs, full titles and every legacy alias', () => {
  const values = new Set(SUPPORTED_PROGRAM_STORAGE_VALUES);
  assert.equal(values.size, SUPPORTED_PROGRAM_STORAGE_VALUES.length, 'storage values must be unique');
  for (const program of PROGRAMS) {
    assert.ok(values.has(program.slug), `missing canonical slug ${program.slug}`);
    assert.ok(values.has(program.title), `missing full title ${program.title}`);
  }
  for (const alias of Object.keys(PROGRAM_SLUG_ALIASES)) {
    assert.ok(values.has(alias), `missing legacy alias ${alias}`);
  }
  for (const legacyTitle of LEGACY_PROGRAM_TITLE_VALUES) {
    assert.ok(values.has(legacyTitle), `missing legacy title ${legacyTitle}`);
  }
  assert.ok(Object.keys(PROGRAM_SLUG_ALIASES).length > 0, 'the alias table must not be empty');
});
