#!/usr/bin/env node
/**
 * Reject new Prisma timestamp collisions while preserving exact historical SQL.
 * The reviewed baseline is not a migration replay or database recovery baseline.
 * Run directly or through npm run check-migrations; no database is contacted.
 */
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATIONS = join(ROOT, 'prisma', 'migrations');
const BASELINE = join(ROOT, 'scripts', 'migration-collision-baseline.json');
// Review anchors live outside the mutable JSON payload. Editing that payload
// cannot authorize a new collision or a rewritten historical migration. Changes
// to these constants require separate source review, never automatic refresh.
//
// WAP-178 (2026-09-20): re-anchored once, deliberately. fa8f9ebe3 reverted a
// directory rename but dropped the leading lines of all ten second-alphabetical
// members — truncating two mid-statement, emptying a third, and deleting live
// DDL from a fourth — *after* production had applied the originals. The old
// anchor below pinned those truncated bytes, so the guard was protecting the
// corruption. The ten files are now restored to their pre-fa8f9ebe3 revision
// (`git show fa8f9ebe3^:<path>`), which is also what production's
// `_prisma_migrations` checksums were computed from. This is a restoration to
// the reviewed history, not an acceptance of drift.
const REVIEWED_SOURCE_COMMIT = 'a9c3a7d3d3dee7e3a58c800f77c1ce2ffe3ffb44';
const REVIEWED_BASELINE_SHA256 = '0d35a2d159dbfc40e431c711992d49f648d778c5763179205e78b8c73b2dfd17';
// Two existing migrations use date-only prefixes. Detect their collisions too;
// do not silently ignore a shorter numeric prefix or rename historical files.
const TIMESTAMP = /^(\d+)_/;

function requireDirectory(path) {
  if (!lstatSync(path).isDirectory()) throw new Error(`Expected a real directory: ${path}`);
}

function readPlainFile(path) {
  if (!lstatSync(path).isFile()) throw new Error(`Expected a regular file: ${path}`);
  return readFileSync(path);
}

function loadBaseline() {
  const bytes = readPlainFile(BASELINE);
  const baseline = JSON.parse(bytes.toString('utf8'));
  if (
    baseline?.schemaVersion !== 1 ||
    !/^[a-f0-9]{40}$/.test(baseline.sourceCommit ?? '') ||
    !Array.isArray(baseline.groups)
  ) throw new Error('Invalid migration collision baseline: expected schemaVersion 1, sourceCommit and groups.');
  if (baseline.sourceCommit !== REVIEWED_SOURCE_COMMIT) {
    throw new Error(`Reviewed migration source commit mismatch: expected ${REVIEWED_SOURCE_COMMIT}.`);
  }
  if (createHash('sha256').update(bytes).digest('hex') !== REVIEWED_BASELINE_SHA256) {
    throw new Error('Reviewed migration collision baseline digest mismatch. Restore the reviewed bytes; do not refresh the exceptions.');
  }

  const groups = new Map();
  for (const group of baseline.groups) {
    if (
      !group || !/^\d{14}$/.test(group.timestamp ?? '') ||
      groups.has(group.timestamp) || !Array.isArray(group.migrations) || group.migrations.length < 2
    ) throw new Error('Invalid or duplicate historical collision group.');

    const members = new Map();
    for (const migration of group.migrations) {
      const name = migration?.directory;
      if (
        typeof name !== 'string' || /[/\\]/.test(name) ||
        TIMESTAMP.exec(name)?.[1] !== group.timestamp || name.length <= 15 ||
        members.has(name) || !/^[a-f0-9]{64}$/.test(migration.sha256 ?? '')
      ) throw new Error(`Invalid or duplicate baseline member for ${group.timestamp}.`);
      members.set(name, migration.sha256);
    }
    groups.set(group.timestamp, members);
  }
  return groups;
}

function readMigrations() {
  requireDirectory(join(ROOT, 'prisma'));
  requireDirectory(MIGRATIONS);
  const groups = new Map();
  for (const name of readdirSync(MIGRATIONS).sort()) {
    const timestamp = TIMESTAMP.exec(name)?.[1];
    if (!timestamp) continue; // Naming/schema policy is separate; migration_lock.toml is not a migration.
    const directory = join(MIGRATIONS, name);
    requireDirectory(directory);
    const hash = createHash('sha256').update(readPlainFile(join(directory, 'migration.sql'))).digest('hex');
    const members = groups.get(timestamp) ?? new Map();
    members.set(name, hash);
    groups.set(timestamp, members);
  }
  return groups;
}

function check() {
  if (process.argv.length !== 2) throw new Error('Usage: node scripts/check-duplicate-migrations.mjs (no baseline update mode).');
  const baseline = loadBaseline();
  const current = readMigrations();
  const failures = [];

  // Validate every baseline group, even if a deletion/rename would hide its collision.
  for (const [timestamp, expected] of baseline) {
    const actual = current.get(timestamp) ?? new Map();
    const expectedNames = [...expected.keys()].sort();
    const actualNames = [...actual.keys()].sort();
    if (JSON.stringify(expectedNames) !== JSON.stringify(actualNames)) {
      failures.push(
        `Historical collision membership changed at ${timestamp}.\n` +
        `  expected: ${expectedNames.join(', ')}\n  actual: ${actualNames.join(', ') || '(missing)'}`,
      );
    }
    for (const [name, checksum] of expected) {
      if (actual.has(name) && actual.get(name) !== checksum) {
        failures.push(`Historical SQL checksum changed: prisma/migrations/${name}/migration.sql`);
      }
    }
  }

  for (const [timestamp, members] of current) {
    if (members.size > 1 && !baseline.has(timestamp)) {
      failures.push(`Unrecognized collision at ${timestamp}: ${[...members.keys()].sort().join(', ')}`);
    }
  }

  if (failures.length) {
    console.error(failures.join('\n'));
    console.error(
      'Preserve historical migration directories and SQL bytes. Choose a unique timestamp only for a new, unapplied migration.\n' +
      'Do not regenerate the historical exceptions to accept a new collision. See docs/DATABASE-RECOVERY.md.',
    );
    process.exitCode = 1;
    return;
  }
  console.log(`Migration timestamps verified: ${baseline.size} historical collision group(s) unchanged; no new collisions.`);
}

try {
  check();
} catch (error) {
  console.error(`check-duplicate-migrations: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
