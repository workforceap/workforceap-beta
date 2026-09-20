import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

test('admin Coursera renders org-scoped catalog health and its accuracy classes', () => {
  const page = readFileSync(join(ROOT, 'app/admin/coursera/page.tsx'), 'utf8');
  // The table moved to the kit primitive in components/admin/CourseraCatalogHealthTable.tsx
  // (Wave B, 2026-09-20); the accuracy literals are pinned there.
  const table = readFileSync(join(ROOT, 'components/admin/CourseraCatalogHealthTable.tsx'), 'utf8');

  assert.match(page, /loadValidatedProgramCatalog\(\{ organizationId: scope\.orgId \}\)/);
  assert.match(page, /<CourseraCatalogHealthSection/);
  assert.match(table, /header: 'Coursera mapped'/);
  assert.match(table, /provider-valid/);
  assert.match(table, /WorkforceAP \$\{health\.localCourseCount === 1 \? 'lab' : 'labs'\}/);
  assert.match(table, /healthy empty/);
  assert.match(table, /Stale IDs/);
  assert.match(table, /Wrong type/);
  assert.match(table, /Additional Coursera activity/);
});
