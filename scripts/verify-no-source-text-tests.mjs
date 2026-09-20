#!/usr/bin/env node
/**
 * Source-text test guard (WAP-175 lever 2).
 *
 * A "source-text test" reads an application source file (`app/`, `lib/`,
 * `components/`, `emails/`, `css/`, `prisma/`) with `readFileSync`/`readFile`
 * and asserts on its text. Such a test proves the source contains a string,
 * not that the feature works: a fully English form on a Spanish page, or a
 * migration that never applies, stays green by construction.
 *
 * The audit measured ~87 files / ~262 cases. Deleting them at once is a
 * separate effort, so this guard freezes today's inventory in
 * `scripts/source-text-tests-baseline.json` and fails when a test file that
 * is NOT in the baseline reads application source. The baseline may only
 * shrink: `--update-baseline` removes files that no longer read source and
 * refuses to add new ones. Reading `tests/fixtures/**`, `messages/**`,
 * `scripts/**` or `.github/**` is not a source-text test.
 *
 * Usage:
 *   node scripts/verify-no-source-text-tests.mjs             # gate (CI)
 *   node scripts/verify-no-source-text-tests.mjs --update-baseline
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const BASELINE_PATH = join(ROOT, 'scripts', 'source-text-tests-baseline.json');

const TEST_ROOTS = ['tests', 'lib', 'app', 'components', 'emails', 'shared', 'scripts'];
const TEST_FILE = /\.(test|spec)\.(ts|tsx|mjs|cjs|js)$/;
const SKIP_DIRS = new Set(['node_modules', '.next', 'e2e', 'fixtures', 'dist']);

/** A file read call that may target application source. */
const READ_CALL = /\b(readFileSync|readFile|readdirSync|readdir|glob|globSync)\s*\(/;
/** String or template literal pieces naming an application source location. */
const SOURCE_PATH_LITERAL =
  /['"`](?:\.{1,2}\/)*(?:\.\.\/)*(?:app|lib|components|emails|css|prisma)\/[^'"`]*\.(?:tsx?|mjs|cjs|jsx?|prisma|sql|css)['"`]/;
/** Directory sweeps: readdirSync('app') / join(root, 'lib') followed by reads. */
const SOURCE_DIR_LITERAL =
  /(?:readdirSync|readdir|glob|globSync|join|resolve)\(\s*(?:[A-Za-z_$][\w$]*\s*,\s*)*['"`](?:\.{1,2}\/)*(?:app|lib|components|emails|css|prisma)(?:\/[^'"`]*)?['"`]/;

export function listTestFiles(root = ROOT) {
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      if (SKIP_DIRS.has(entry)) continue;
      const full = join(dir, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) walk(full);
      else if (TEST_FILE.test(entry)) out.push(relative(root, full).split(sep).join('/'));
    }
  };
  for (const testRoot of TEST_ROOTS) {
    try { walk(join(root, testRoot)); } catch { /* optional root */ }
  }
  return out.sort();
}

/** True when the test text reads application source files. */
export function readsApplicationSource(source) {
  if (!READ_CALL.test(source)) return false;
  return SOURCE_PATH_LITERAL.test(source) || SOURCE_DIR_LITERAL.test(source);
}

export function findSourceTextTests(root = ROOT) {
  return listTestFiles(root).filter((file) => readsApplicationSource(readFileSync(join(root, file), 'utf8')));
}

export function loadBaseline(path = BASELINE_PATH) {
  const parsed = JSON.parse(readFileSync(path, 'utf8'));
  if (parsed?.schemaVersion !== 1 || !Array.isArray(parsed.files)) {
    throw new Error('Invalid source-text test baseline: expected schemaVersion 1 and files[]');
  }
  return parsed;
}

export function evaluate({ offenders, baseline }) {
  const frozen = new Set(baseline.files);
  const added = offenders.filter((file) => !frozen.has(file));
  const cleaned = baseline.files.filter((file) => !offenders.includes(file));
  return { added, cleaned, remaining: offenders.filter((file) => frozen.has(file)) };
}

function main(argv) {
  const offenders = findSourceTextTests();
  const baseline = loadBaseline();
  const { added, cleaned, remaining } = evaluate({ offenders, baseline });

  if (argv.includes('--update-baseline')) {
    if (added.length) {
      console.error(`Refusing to grow the baseline: ${added.length} new source-text test file(s). Convert them to behavioral tests.`);
      for (const file of added) console.error(`  - ${file}`);
      process.exit(1);
    }
    writeFileSync(BASELINE_PATH, `${JSON.stringify({ ...baseline, updatedAt: new Date().toISOString().slice(0, 10), files: remaining }, null, 2)}\n`);
    console.log(`Baseline now lists ${remaining.length} file(s); removed ${cleaned.length}.`);
    return;
  }

  console.log(`Source-text tests: ${remaining.length} frozen in baseline, ${cleaned.length} cleaned since baseline, ${added.length} new.`);
  if (cleaned.length) {
    console.log('Files no longer reading application source (run --update-baseline to shrink the baseline):');
    for (const file of cleaned) console.log(`  - ${file}`);
  }
  if (added.length) {
    console.error('\n❌ New test file(s) assert on application source text instead of behavior (WAP-175):');
    for (const file of added) console.error(`  - ${file}`);
    console.error(
      '\nA green source-text test proves a string exists in a file, not that the feature works. ' +
        'Import the module (or render the component / call the route) and assert on its behavior. ' +
        'Fixtures under tests/fixtures/** and messages/** are fine to read.',
    );
    process.exit(1);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}
