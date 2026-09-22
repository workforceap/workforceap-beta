#!/usr/bin/env node

/**
 * Wrapper around `node --test` for the project's unit tests.
 *
 * Library suites that import Vitest run in `npm run test:vitest`, not here.
 * Both runners share scripts/vitest-library-specs.mjs, and the Vitest
 * collection guard proves those suites are not excluded from that lane.
 *
 * `server-only` is stubbed via tests/server-only-stub.cjs so Node can load
 * server modules the same way Vitest aliases them to tests/empty-module.cjs.
 *
 * Filtering happens here rather than via a glob pattern so the skip
 * list stays declarative + documented. Print the skipped files at
 * the start so the skip list is visible in CI logs.
 *
 * Vitest specs are gated by an **explicit shared manifest**. A new test file that imports vitest
 * and isn't in the allowlist will fail the run rather than be
 * silently skipped — that prevents "I added a vitest spec → CI
 * pretends it ran" surprises (Codex P2 catch on PR #1230).
 */

import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { glob } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { VITEST_LIBRARY_SPECS } from './vitest-library-specs.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const SKIP_REASONS = {
  vitest: "owned by npm run test:vitest (shared manifest; collection guarded)",
  realDb: "requires a live postgres connection (no Prisma mock layer in this spec)",
};

/**
 * Explicit shared ownership: these suites run in the required Vitest lane.
 * Unknown Vitest suites fail here until registered, instead of silently
 * being dropped from Node coverage.
 */
const KNOWN_VITEST_SPECS = new Set(VITEST_LIBRARY_SPECS);

/**
 * `TEST_REAL_DB=1` (set by the database-contract CI job and by
 * `npm run test:db-contract`) un-skips suites that need a live PostgreSQL.
 * `--only <file>` restricts the run to the named files so that lane does not
 * repeat the whole mocked suite.
 */
const REAL_DB = process.env.TEST_REAL_DB?.trim() === '1';
const ONLY = new Set(
  process.argv.slice(2).flatMap((arg, index, args) => (arg === '--only' && args[index + 1] ? [args[index + 1].replace(/\\/g, '/')] : [])),
);

async function listTestFiles() {
  const out = new Set();
  for await (const entry of glob('lib/**/*.test.ts', { cwd: ROOT })) {
    out.add(entry);
  }
  for await (const entry of glob('app/**/*.test.ts', { cwd: ROOT })) {
    out.add(entry);
  }
  for await (const entry of glob('emails/**/*.test.ts', { cwd: ROOT })) {
    out.add(entry);
  }
  for await (const entry of glob('shared/**/*.test.ts', { cwd: ROOT })) {
    out.add(entry);
  }
  for await (const entry of glob('scripts/**/*.test.ts', { cwd: ROOT })) {
    out.add(entry);
  }
  for await (const entry of glob('scripts/**/*.test.cjs', { cwd: ROOT })) {
    out.add(entry);
  }
  return [...out];
}

/**
 * Returns one of:
 *   { skip: '<reason>' }       — known-incompatible, log + move on
 *   { unknownVitest: true }    — vitest import but NOT in allowlist; abort
 *   null                        — runnable
 */
function classify(relPath) {
  const src = readFileSync(path.join(ROOT, relPath), 'utf8');
  const normalized = relPath.replace(/\\/g, '/');
  const importsVitest =
    /from\s+['"]vitest['"]/.test(src) || /require\(['"]vitest['"]\)/.test(src);
  if (importsVitest) {
    if (KNOWN_VITEST_SPECS.has(normalized)) {
      return { skip: 'vitest' };
    }
    if (/app\/api\/apply\/signup\/route\.test\.ts/.test(normalized)) {
      return { skip: 'vitest' };
    }
    return { unknownVitest: true };
  }
  if (/lib\/admin\/memberOnlyWhere\.realdb\.test\.ts/.test(normalized) && !REAL_DB) {
    // Seeds rows and runs the real member predicate through Prisma and
    // PostgreSQL (WAP-182 item 3): a nested `NOT`, a `profile: null` to-one
    // filter, a `userRoles: { none }` to-many filter and a derived-table
    // join are exactly what a mock cannot vouch for. The `database-contract`
    // CI job runs this lane with TEST_REAL_DB=1 against a pushed schema.
    return { skip: 'realDb' };
  }
  if (/lib\/auth\/roles\.test\.ts/.test(normalized) && !REAL_DB) {
    // Hits the real Prisma client via getProfileRole — needs a postgres
    // server. The default lane has none; the `database-contract` CI job
    // (WAP-175) runs this lane with TEST_REAL_DB=1 against a pushed schema.
    // Mocking Prisma here would mean rewriting the test against the wrapper
    // rather than the real function, which defeats most of its value.
    return { skip: 'realDb' };
  }
  return null;
}

async function main() {
  const discovered = (await listTestFiles()).sort();
  const all = ONLY.size ? discovered.filter((file) => ONLY.has(file)) : discovered;
  if (ONLY.size && all.length !== ONLY.size) {
    const missing = [...ONLY].filter((file) => !all.includes(file));
    console.error(`--only named ${missing.length} file(s) the runner does not own: ${missing.join(', ')}`);
    process.exit(1);
  }
  const runnable = [];
  const skipped = [];
  const unknownVitest = [];
  for (const file of all) {
    const result = classify(file);
    if (!result) {
      runnable.push(file);
    } else if (result.unknownVitest) {
      unknownVitest.push(file);
    } else if (result.skip) {
      skipped.push([file, result.skip]);
    }
  }

  if (unknownVitest.length > 0) {
    console.error(
      `\n❌ ${unknownVitest.length} test file(s) import 'vitest' but are not in the ` +
        `shared manifest in scripts/vitest-library-specs.mjs:\n`,
    );
    for (const file of unknownVitest) {
      console.error(`  - ${file}`);
    }
    console.error(
      `\nThe node:test runner can't satisfy vitest imports. Pick one:\n` +
        `  (a) Port the spec to node:test (import from 'node:test' + 'node:assert/strict').\n` +
        `  (b) Add the file to VITEST_LIBRARY_SPECS and run npm run test:vitest.\n` +
        `      The collection guard ensures the required Vitest lane includes it.\n`,
    );
    process.exit(1);
  }

  if (skipped.length > 0) {
    console.log(`Skipping ${skipped.length} test file(s) (incompatible with node:test runner):`);
    for (const [file, reason] of skipped) {
      console.log(`  - ${file}  // ${SKIP_REASONS[reason]}`);
    }
    console.log('');
  }

  if (runnable.length === 0) {
    // `node --test` with no file arguments runs its default patterns over the
    // whole tree, which would silently turn a filtered run into a full one.
    console.error(
      ONLY.size
        ? `--only matched no runnable file: every named file is skipped here (see the skip list above). ` +
            `Run the Vitest-owned suites with npm run test:vitest.`
        : 'No runnable test files were discovered.',
    );
    process.exit(1);
  }

  console.log(`Running ${runnable.length} test file(s) via \`node --test\`...`);

  // Stub Prisma env vars so schema.prisma validates without a real DB.
  // Tests that touch prisma typically mock the client; the URL is only
  // consulted by `prisma generate`-time validators. Real CI sets these
  // via the workflow env block; this fallback keeps `npm run test:unit`
  // green for local + autopilot runs.
  const env = { ...process.env };
  env.POSTGRES_PRISMA_URL ??= 'postgresql://test:test@localhost:5432/test';
  env.POSTGRES_URL_NON_POOLING ??= 'postgresql://test:test@localhost:5432/test';

  const child = spawn(
    process.execPath,
    [
      '--require',
      path.join(ROOT, 'tests/server-only-stub.cjs'),
      '--import',
      'tsx',
      '--test',
      ...runnable,
    ],
    { stdio: 'inherit', cwd: ROOT, env },
  );
  child.on('exit', (code) => {
    process.exit(code ?? 1);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
