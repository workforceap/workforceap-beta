#!/usr/bin/env node

// Guarded apply of two migrations the Vercel Preview build never ran on the DEMO
// database. Vercel Preview + DEMO only; exact allowlist; SHA-256 pinned; each
// migration is applied only when its objects are fully absent. Never a blanket
// `migrate deploy` (docs/PORTAL-QA-FIXTURES.md).

const path = require('path');
const { readFileSync } = require('fs');
const { createHash } = require('crypto');
const { spawnSync } = require('child_process');
const { validatePreviewTarget } = require('./apply-preview-training-workspace-schema.cjs');

const PUBLIC_INQUIRIES_INDEXES = [
  'public_inquiries_organization_id_submission_key_key',
  'public_inquiries_organization_id_created_at_idx',
  'public_inquiries_created_at_idx',
];

// SHA-256 of migration.sql with CRLF normalised to LF (git stores LF; a Windows
// checkout may have CRLF). Any edit to a migration file changes the hash and refuses to run.
const MIGRATIONS = [
  {
    name: '20261015225832_public_inquiries',
    sha256: 'f11627b294494121e173e95a9860b46dc3711d306dc9d3ec1d93f51dceca41fc',
  },
  {
    name: '20261022120000_application_report_snapshot',
    sha256: 'f454000a6155877a85a7affe8f6807f7f3a97ef69fd3ab899332ea2c114dc1a7',
  },
];

function migrationPath(name, cwd = path.resolve(__dirname, '..')) {
  return path.join(cwd, 'prisma', 'migrations', name, 'migration.sql');
}

function verifyMigrationFiles(options = {}) {
  const cwd = options.cwd || path.resolve(__dirname, '..');
  const migrations = options.migrations || MIGRATIONS;
  for (const migration of migrations) {
    const text = readFileSync(migrationPath(migration.name, cwd), 'utf8').replace(/\r\n/g, '\n');
    const hash = createHash('sha256').update(text).digest('hex');
    if (hash !== migration.sha256) {
      throw new Error(`Migration ${migration.name} differs from the verified hash; refusing to continue.`);
    }
  }
}

function executeMigration(target, name, options = {}) {
  const cwd = options.cwd || path.resolve(__dirname, '..');
  const spawn = options.spawn || spawnSync;
  const result = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', [
    'prisma', 'db', 'execute', '--file', migrationPath(name, cwd),
    '--schema', path.join(cwd, 'prisma', 'schema.prisma'),
  ], {
    cwd, shell: false, stdio: 'pipe', encoding: 'utf8', timeout: 120000,
    env: { ...process.env, POSTGRES_PRISMA_URL: target.directDatabaseUrl, POSTGRES_URL_NON_POOLING: target.directDatabaseUrl },
  });
  // Driver/CLI diagnostics can contain connection details. Never inherit or print them.
  if (result.error || (result.status ?? 1) !== 0) throw new Error(`Preview migration ${name} failed.`);
}

// Readers return { present, absent } from catalog facts; neither true means partial.
async function readPublicInquiries(prisma) {
  const [row] = await prisma.$queryRawUnsafe(`
    SELECT json_build_object(
      'table', EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = 'public_inquiries' AND c.relkind = 'r'),
      'rls', COALESCE((SELECT c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = 'public_inquiries' AND c.relkind = 'r'), false),
      'indexes', COALESCE((SELECT json_agg(idx.relname) FROM pg_index i
        JOIN pg_class t ON t.oid = i.indrelid JOIN pg_namespace n ON n.oid = t.relnamespace
        JOIN pg_class idx ON idx.oid = i.indexrelid
        WHERE n.nspname = 'public' AND t.relname = 'public_inquiries'
          AND i.indisvalid AND i.indisready
          AND idx.relname IN (${PUBLIC_INQUIRIES_INDEXES.map((i) => `'${i}'`).join(', ')})), '[]'::json)
    ) AS state
  `);
  const state = row?.state;
  if (!state || typeof state.table !== 'boolean' || !Array.isArray(state.indexes)) {
    return { present: false, absent: false };
  }
  const indexes = new Set(state.indexes);
  return {
    present: state.table && state.rls === true && PUBLIC_INQUIRIES_INDEXES.every((i) => indexes.has(i)),
    absent: !state.table && indexes.size === 0,
  };
}

async function readReportSnapshot(prisma) {
  const [row] = await prisma.$queryRawUnsafe(`
    SELECT json_build_object(
      'column', EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'applications'
          AND column_name = 'application_report_snapshot' AND data_type = 'jsonb'),
      'columnAny', EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'applications'
          AND column_name = 'application_report_snapshot'),
      'functions', COALESCE((SELECT json_agg(p.proname) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname IN ('protect_application_report_snapshot', 'clear_deleted_member_application_reports')), '[]'::json),
      'triggers', COALESCE((SELECT json_agg(g.tgname) FROM pg_trigger g
        JOIN pg_class t ON t.oid = g.tgrelid JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE NOT g.tgisinternal AND n.nspname = 'public'
          AND ((t.relname = 'applications' AND g.tgname = 'application_report_snapshot_immutable')
            OR (t.relname = 'users' AND g.tgname = 'clear_deleted_member_application_reports'))), '[]'::json)
    ) AS state
  `);
  const state = row?.state;
  if (!state || !Array.isArray(state.functions) || !Array.isArray(state.triggers)) {
    return { present: false, absent: false };
  }
  return {
    present: state.column === true && state.functions.length === 2 && state.triggers.length === 2,
    absent: !state.columnAny && state.functions.length === 0 && state.triggers.length === 0,
  };
}

const READERS = {
  '20261015225832_public_inquiries': readPublicInquiries,
  '20261022120000_application_report_snapshot': readReportSnapshot,
};

async function ensureMigration(prisma, target, migration, options) {
  const read = (options.readers || READERS)[migration.name];
  const before = await read(prisma);
  if (before.present) return { name: migration.name, applied: false };
  if (!before.absent) throw new Error(`Migration ${migration.name} is partially present; refusing to alter it.`);
  try {
    await (options.execute || executeMigration)(target, migration.name, options);
  } catch {
    // Another preview can win the migration after our initial read. Accept only its
    // fully verified result; never repair a failed or partial migration.
    if ((await read(prisma)).present) return { name: migration.name, applied: false };
    throw new Error(`Preview migration ${migration.name} failed and its schema is not verified.`);
  }
  if (!(await read(prisma)).present) throw new Error(`Migration ${migration.name} postconditions were not satisfied.`);
  return { name: migration.name, applied: true };
}

async function ensurePendingMigrations(target, options = {}) {
  verifyMigrationFiles(options);
  const migrations = options.migrations || MIGRATIONS;
  const PrismaClient = options.PrismaClient || require('@prisma/client').PrismaClient;
  const prisma = new PrismaClient({ datasources: { db: { url: target.directDatabaseUrl } } });
  const results = [];
  try {
    for (const migration of migrations) results.push(await ensureMigration(prisma, target, migration, options));
  } finally { await prisma.$disconnect(); }
  return results;
}

async function main() {
  const target = validatePreviewTarget();
  console.log('[preview-pending-migrations] target verified: Vercel Preview + DEMO Supabase.');
  if (process.argv.includes('--check')) {
    verifyMigrationFiles();
    console.log('[preview-pending-migrations] target and migration files verified; no database command executed.');
    return;
  }
  for (const result of await ensurePendingMigrations(target)) {
    console.log(`[preview-pending-migrations] ${result.name} verified (${result.applied ? 'applied' : 'already present'}).`);
  }
}

if (require.main === module) main().catch(() => {
  console.error('[preview-pending-migrations] BLOCKED: target guard, file hash or schema verification failed.');
  process.exitCode = 1;
});

module.exports = { MIGRATIONS, verifyMigrationFiles, executeMigration, readPublicInquiries, readReportSnapshot, ensurePendingMigrations, main };
