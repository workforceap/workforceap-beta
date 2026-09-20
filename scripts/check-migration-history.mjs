#!/usr/bin/env node
/**
 * WAP-178 migration-history guard.
 *
 * Three faults the 2026-09-18 reliability + database-integrity audits found,
 * expressed as checks so they cannot come back silently:
 *
 *   1. A shipped migration.sql is empty, or begins mid-statement, because an
 *      unrelated commit trimmed its leading lines. fa8f9ebe3 ("ESLint
 *      burndown") did this to ten files at once: two lost their
 *      `CREATE TABLE ... (` header and their columns, one was emptied, one
 *      lost live DDL. Such a file cannot replay, and no longer matches the
 *      checksum production recorded when it applied the original.
 *   2. A Prisma model has no CREATE TABLE anywhere in prisma/migrations, so a
 *      rebuilt environment silently lacks the table and every route that
 *      reads it fails at runtime. That is how `advisor_session_notes` reached
 *      production absent while the model, the API route and the panel all
 *      shipped.
 *   3. The production build auto-resolves `_prisma_migrations` rows on every
 *      deploy — which scripts/safe-migrate.cjs's own header says was removed
 *      on purpose. Recovery belongs in an operator command.
 *
 * No database is contacted. Passing this does NOT mean the history replays
 * cleanly; see docs/DATABASE-RECOVERY.md for what is still unproven.
 *
 * Usage: node scripts/check-migration-history.mjs   (also: npm run check-migrations)
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * A first meaningful line that can only be the middle of a statement: a
 * column/constraint fragment or a bare closing paren. The `CREATE TABLE ... (`
 * header above it is gone.
 */
const CONTINUATION =
  /^(CONSTRAINT\b|\)|,|"[A-Za-z_][A-Za-z0-9_]*"\s+(TEXT|INTEGER|BOOLEAN|TIMESTAMP|UUID|JSONB?|BIGINT|SERIAL|NUMERIC|DOUBLE|REAL|DATE|TIME)\b)/i;

/** Identifiers appear quoted and unquoted across this history, and most recent ones are IF NOT EXISTS. */
const CREATE_TABLE = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?"?([A-Za-z0-9_]+)"?/gi;

/** @param {Map<string,string>|Record<string,string>} migrations name -> SQL */
const entries = (migrations) =>
  migrations instanceof Map ? [...migrations.entries()] : Object.entries(migrations);

export function findEmptyMigrations(migrations) {
  return entries(migrations)
    .filter(([, sql]) => sql.trim().length === 0)
    .map(([name]) => name)
    .sort();
}

export function findTruncatedMigrations(migrations) {
  const broken = [];
  for (const [name, sql] of entries(migrations)) {
    const first = sql
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.length > 0 && !line.startsWith('--'));
    if (first && CONTINUATION.test(first)) broken.push(name);
  }
  return broken.sort();
}

/** Table names of `model` blocks only — an `@@map` on an enum is not a table. */
export function mappedModelTables(schema) {
  const tables = new Map();
  for (const [, model, body] of schema.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
    const mapped = /@@map\("([^"]+)"\)/.exec(body);
    tables.set(mapped ? mapped[1] : model, model);
  }
  return tables;
}

export function findModelsWithoutTable(schema, migrations) {
  const created = new Set();
  for (const [, sql] of entries(migrations)) {
    for (const [, table] of sql.matchAll(CREATE_TABLE)) created.add(table.toLowerCase());
  }
  const missing = [];
  for (const [table, model] of mappedModelTables(schema)) {
    if (!created.has(table.toLowerCase())) missing.push(`${model} -> ${table}`);
  }
  return missing.sort();
}

export function findBuildScriptsThatAutoResolve(scripts) {
  return Object.entries(scripts ?? {})
    .filter(([name, command]) => name.startsWith('build') && /resolve-failed-migration/.test(command))
    .map(([name]) => name)
    .sort();
}

export function readMigrations(root = ROOT) {
  const dir = join(root, 'prisma', 'migrations');
  const migrations = new Map();
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^\d+_/.test(entry.name)) continue;
    migrations.set(entry.name, readFileSync(join(dir, entry.name, 'migration.sql'), 'utf8'));
  }
  return migrations;
}

export function check(root = ROOT) {
  const migrations = readMigrations(root);
  const schema = readFileSync(join(root, 'prisma', 'schema.prisma'), 'utf8');
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const failures = [];

  for (const name of findEmptyMigrations(migrations)) {
    failures.push(
      `Empty migration: prisma/migrations/${name}/migration.sql applies nothing on replay ` +
        'while still recording a _prisma_migrations row.',
    );
  }
  for (const name of findTruncatedMigrations(migrations)) {
    failures.push(
      `Truncated migration: prisma/migrations/${name}/migration.sql begins mid-statement. ` +
        'Restore it from the revision before the trim (git show <commit>^:<path>).',
    );
  }
  for (const missing of findModelsWithoutTable(schema, migrations)) {
    failures.push(
      `Model with no CREATE TABLE: ${missing}. It cannot exist in a rebuilt environment — ` +
        'add an additive migration, or delete the model and its call sites.',
    );
  }
  for (const name of findBuildScriptsThatAutoResolve(pkg.scripts)) {
    failures.push(
      `Build script "${name}" mutates _prisma_migrations on every deploy. ` +
        'Recovery is an operator command: npm run db:migrate:resolve-failed[-in-db].',
    );
  }

  if (failures.length) {
    console.error(failures.map((line) => `  ✗ ${line}`).join('\n'));
    console.error('\nSee docs/DATABASE-RECOVERY.md. This check does not prove the history replays cleanly.');
    return 1;
  }
  console.log(
    `Migration history verified: ${migrations.size} migrations, none empty or truncated; ` +
      `every Prisma model has a CREATE TABLE; no build script auto-resolves migration state.`,
  );
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  process.exitCode = check();
}
