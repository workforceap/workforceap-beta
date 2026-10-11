#!/usr/bin/env node
/**
 * Preserve recovered Supabase history and retired, unapplied source SQL.
 * This is independent of Prisma history and does not contact a database.
 * Optional --remote-versions compares against a captured read-only ledger.
 */
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = 'supabase/history/recovery-20261011.json';
// Changing this reviewed anchor is a separate history transition, never an
// automatic refresh when a migration or its manifest fails validation.
const REVIEWED_MANIFEST_SHA256 = '0e6868a1781f121ccaee8244fadd9cd97c04d9f8249aa3a3a118335d13874f1b';
const MIGRATION = /^(\d{14})_[a-z0-9_]+\.sql$/;
const HASH = /^[a-f0-9]{64}$/;
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

/** Pure inventory validation; test fixtures never need database access. */
export function inspectHistory(activeFiles, archivedFiles, manifest) {
  if (manifest?.schemaVersion !== 1 || !Array.isArray(manifest.applied) ||
      !manifest.applied.length || !Array.isArray(manifest.archived)) {
    throw new Error('Invalid Supabase recovery manifest.');
  }
  const failures = [];
  const actual = new Map(activeFiles.map((file) => [file.path, file.bytes]));
  const archived = new Map(archivedFiles.map((file) => [file.path, file.bytes]));
  const expectedPaths = new Set();
  const expectedVersions = new Set();
  for (const entry of manifest.applied) {
    const basename = entry.path?.replace(/^supabase\/migrations\//, '');
    if (!basename || entry.path !== `supabase/migrations/${basename}` ||
        MIGRATION.exec(basename)?.[1] !== entry.version || !HASH.test(entry.sha256) ||
        !HASH.test(entry.storedStatementSha256) || expectedVersions.has(entry.version)) {
      throw new Error('Invalid or duplicate recovered migration entry.');
    }
    expectedPaths.add(entry.path);
    expectedVersions.add(entry.version);
    const bytes = actual.get(entry.path);
    if (!bytes) failures.push(`Missing applied Supabase history: ${entry.path}`);
    else if (sha256(bytes) !== entry.sha256) failures.push(`Applied Supabase SQL changed: ${entry.path}`);
    else {
      const stored = entry.disposition === 'retained-original-file' ? bytes.subarray(0, -2) : bytes;
      if (!['retained-original-file', 'recovered-stored-statement'].includes(entry.disposition) ||
          sha256(stored) !== entry.storedStatementSha256 ||
          (entry.disposition === 'retained-original-file' && bytes.subarray(-2).toString() !== ';\n')) {
        failures.push(`Stored-statement provenance mismatch: ${entry.path}`);
      }
    }
  }
  const highestApplied = [...expectedVersions].sort().at(-1);
  const versions = new Map();
  for (const file of activeFiles) {
    const basename = file.path.replace(/^supabase\/migrations\//, '');
    const version = MIGRATION.exec(basename)?.[1];
    if (!version || file.path !== `supabase/migrations/${basename}`) {
      failures.push(`Invalid Supabase migration filename: ${file.path}`);
      continue;
    }
    if (versions.has(version)) failures.push(`Duplicate Supabase migration version: ${version}`);
    versions.set(version, file.path);
    // Genuinely new, later versions are allowed; this is not a 36-file ceiling.
    if (!expectedPaths.has(file.path) && version <= highestApplied) {
      failures.push(`Unreviewed earlier Supabase migration: ${file.path}`);
    }
  }
  const archivePaths = new Set();
  for (const entry of manifest.archived) {
    const basename = entry.originalPath?.replace(/^supabase\/migrations\//, '');
    if (!basename || entry.originalPath !== `supabase/migrations/${basename}` ||
        entry.path !== `supabase/history/unapplied/${basename}` ||
        MIGRATION.exec(basename)?.[1] !== entry.version || !HASH.test(entry.sha256) ||
        archivePaths.has(entry.path)) throw new Error('Invalid archived migration entry.');
    archivePaths.add(entry.path);
    if (!archived.has(entry.path)) failures.push(`Missing archived original SQL: ${entry.path}`);
    else if (sha256(archived.get(entry.path)) !== entry.sha256) {
      failures.push(`Archived original SQL changed: ${entry.path}`);
    }
    if (versions.has(entry.version)) failures.push(`Retired unapplied version is active: ${entry.version}`);
  }
  for (const file of archivedFiles) {
    if (!archivePaths.has(file.path)) failures.push(`Unreviewed archived SQL: ${file.path}`);
  }
  return { failures, versions: [...versions.keys()].sort(), recoveredCount: expectedVersions.size,
    archivedCount: archivePaths.size, newCount: activeFiles.length - expectedPaths.size };
}

export function compareRemoteVersions(localVersions, remoteRows) {
  if (!Array.isArray(remoteRows) || !remoteRows.length) throw new Error('Empty or invalid captured remote ledger.');
  const remoteVersions = remoteRows.map((row) => typeof row === 'string' ? row : row?.version);
  if (remoteVersions.some((version) => typeof version !== 'string' || !/^\d{14}$/.test(version)) ||
      new Set(remoteVersions).size !== remoteVersions.length) throw new Error('Invalid or duplicate remote version.');
  const local = new Set(localVersions);
  const remote = new Set(remoteVersions);
  return { remoteOnly: [...remote].filter((version) => !local.has(version)).sort(),
    pending: [...local].filter((version) => !remote.has(version)).sort() };
}

function plainFile(path) {
  if (!lstatSync(path).isFile()) throw new Error(`Expected a regular file: ${path}`);
  return readFileSync(path);
}

function inventory(directory) {
  const absolute = resolve(ROOT, directory);
  if (!lstatSync(absolute).isDirectory()) throw new Error(`Expected a real directory: ${directory}`);
  return readdirSync(absolute).filter((name) => name.endsWith('.sql')).sort().map((name) => ({
    path: `${directory}/${name}`, bytes: plainFile(resolve(absolute, name)),
  }));
}

export function check(args = process.argv.slice(2)) {
  try {
    if (args.length && (args.length !== 2 || args[0] !== '--remote-versions')) {
      throw new Error('Usage: node scripts/check-supabase-history.mjs [--remote-versions <captured-json>]');
    }
    const bytes = plainFile(resolve(ROOT, MANIFEST));
    if (sha256(bytes) !== REVIEWED_MANIFEST_SHA256) {
      throw new Error('Reviewed Supabase recovery manifest digest mismatch. Restore the reviewed bytes.');
    }
    const result = inspectHistory(inventory('supabase/migrations'), inventory('supabase/history/unapplied'), JSON.parse(bytes));
    if (args.length) {
      const captured = JSON.parse(plainFile(resolve(args[1])));
      const remote = compareRemoteVersions(result.versions, Array.isArray(captured) ? captured : captured.rows);
      if (remote.remoteOnly.length) result.failures.push(`Remote versions missing locally: ${remote.remoteOnly.join(', ')}`);
      if (remote.pending.length) result.failures.push(`Local versions pending remotely: ${remote.pending.join(', ')}`);
      console.log(`Captured-ledger comparison: ${remote.remoteOnly.length} remote-only, ${remote.pending.length} pending.`);
    }
    if (result.failures.length) throw new Error(result.failures.join('\n'));
    console.log(`Supabase history verified: ${result.recoveredCount} pinned applied versions, ${result.archivedCount} archived originals, ${result.newCount} later version(s).`);
    return 0;
  } catch (error) {
    console.error(`check-supabase-history: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = check();
