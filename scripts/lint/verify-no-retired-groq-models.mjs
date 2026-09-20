#!/usr/bin/env node
/**
 * Retired Groq model guard (WAP-74), run by `npm run lint`.
 *
 * The hourly Coursera auto-heal career-os step called a Groq model id after
 * the provider had decommissioned it, and failed on every run until someone
 * read the Vercel logs. `lib/ai/groqRetiredModels.ts` is the runtime
 * deny-list (`orderGroqModels` and the `GROQ_MODEL` override drop these ids);
 * this script is the static half: it fails lint when any retired id appears
 * in lib/, app/ or scripts/ outside the deny-list module itself (test files
 * may name them to assert they are rejected).
 *
 * It lives here rather than in a test because the repository's source-text
 * test guard (scripts/verify-no-source-text-tests.mjs) forbids new tests that
 * read application source, and a deny-list sweep is exactly that.
 *
 * Usage: node scripts/lint/verify-no-retired-groq-models.mjs
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Must stay identical to RETIRED_GROQ_MODEL_IDS in lib/ai/groqRetiredModels.ts. */
const RETIRED_GROQ_MODEL_IDS = ['llama3-8b-8192', 'llama3-70b-8192', 'mixtral-8x7b-32768'];

const SCAN_ROOTS = ['lib', 'app', 'scripts'];
/** The deny-list module and this guard are the only places the ids may appear. */
const ALLOWED = new Set(['lib/ai/groqRetiredModels.ts', 'scripts/lint/verify-no-retired-groq-models.mjs']);
const SOURCE_FILE = /\.(?:[cm]?[jt]sx?|json)$/;
/** Tests may name the ids to assert they are rejected (lib/ai/groqModels.test.ts). */
const TEST_FILE = /\.(?:test|spec)\.[cm]?[jt]sx?$/;
const SKIP_DIRS = new Set(['node_modules', '.next', 'dist']);

function walk(dir, out) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry) || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (SOURCE_FILE.test(entry) && !TEST_FILE.test(entry)) out.push(full);
  }
}

function findRetiredGroqModelReferences(root = ROOT) {
  const files = [];
  for (const scanRoot of SCAN_ROOTS) {
    try { walk(join(root, scanRoot), files); } catch { /* optional root */ }
  }
  const hits = [];
  for (const full of files) {
    const rel = relative(root, full).split(sep).join('/');
    if (ALLOWED.has(rel)) continue;
    const text = readFileSync(full, 'utf8');
    for (const id of RETIRED_GROQ_MODEL_IDS) {
      if (text.includes(id)) hits.push({ file: rel, id });
    }
  }
  return hits;
}

function main() {
  const denyList = readFileSync(join(ROOT, 'lib', 'ai', 'groqRetiredModels.ts'), 'utf8');
  const missing = RETIRED_GROQ_MODEL_IDS.filter((id) => !denyList.includes(`'${id}'`));
  if (missing.length) {
    console.error(`[retired-groq-models] lib/ai/groqRetiredModels.ts is missing: ${missing.join(', ')}`);
    process.exit(1);
  }
  const hits = findRetiredGroqModelReferences();
  if (hits.length) {
    console.error('[retired-groq-models] decommissioned Groq model id(s) referenced outside the deny-list (WAP-74):');
    for (const { file, id } of hits) console.error(`  - ${file}: ${id}`);
    console.error('Remove the id; model selection goes through lib/ai/groq.ts (live discovery + GROQ_MODEL override).');
    process.exit(1);
  }
  console.log(`[retired-groq-models] OK — no retired Groq model id in ${SCAN_ROOTS.join(', ')}.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
