#!/usr/bin/env node
/**
 * Read-only DEMO preflight; never applies or resolves a migration.
 * node scripts/check-preview-public-inquiries-schema.cjs --project-ref esbdrgaonplpvzmtrdhw
 * Requires the existing preview/development Supabase environment. No dotenv file
 * is loaded, no account credentials are created, and no URL is written to logs.
 */
const { DEMO_REF, assertSupabaseEnvironment, projectForUrl } = require('./lib/supabase-project-guard.cjs');
const { MIGRATION_NAME, readSchemaState, evaluateSchema } = require('./lib/public-inquiries-schema-contract.cjs');

function validatePreviewTarget(env, projectRef) {
  if (projectRef !== DEMO_REF || !['preview', 'development'].includes(env.VERCEL_ENV)) {
    throw new Error('Explicit DEMO project and preview/development environment required.');
  }
  const target = assertSupabaseEnvironment(env);
  // This command deliberately rejects even unused conflicting fallback URLs.
  if (target.expected !== 'demo' || (env.DATABASE_URL && projectForUrl(env.DATABASE_URL) !== 'demo')) {
    throw new Error('Every configured database URL must identify DEMO.');
  }
  return { databaseUrl: env.POSTGRES_PRISMA_URL, projectRef: DEMO_REF };
}

function projectArgument(args) {
  if (args.length !== 2 || args[0] !== '--project-ref') throw new Error('Expected --project-ref.');
  return args[1];
}

async function main(options = {}) {
  const env = options.env ?? process.env;
  const args = options.args ?? process.argv.slice(2);
  const log = options.log ?? console.log;
  const error = options.error ?? console.error;
  let target;
  try {
    target = validatePreviewTarget(env, projectArgument(args));
  } catch {
    error(`[public-inquiries-schema] BLOCKED: target refused. Use --project-ref ${DEMO_REF} with consistent DEMO preview/development variables. No database connection was opened.`);
    return 2;
  }
  let prisma;
  let verdict;
  let failed = false;
  try {
    const createClient = options.createClient ?? ((url) => {
      const { PrismaClient } = require('@prisma/client');
      return new PrismaClient({ datasources: { db: { url } }, log: [] });
    });
    prisma = createClient(target.databaseUrl);
    verdict = evaluateSchema(await readSchemaState(prisma));
  } catch {
    // Driver errors can contain credentials, SQL and connection details.
    failed = true;
  } finally {
    if (prisma) {
      try { await prisma.$disconnect(); } catch { failed = true; }
    }
  }
  if (failed) {
    error(`[public-inquiries-schema] BLOCKED: schema could not be verified on DEMO. Required migration: ${MIGRATION_NAME}. No schema or data changes were made.`);
    return 1;
  }
  if (!verdict.ok) {
    error(`[public-inquiries-schema] BLOCKED: ${verdict.errors.join(', ')}. Required migration: ${MIGRATION_NAME}. No schema or data changes were made.`);
    return 1;
  }
  log(`[public-inquiries-schema] PASS: DEMO table, columns, keys, indexes and server-only access prerequisites verified for ${MIGRATION_NAME}. Authenticated behavior and migration history require separate acceptance.`);
  return 0;
}

if (require.main === module) main().then((code) => { process.exitCode = code; }).catch(() => {
  console.error('[public-inquiries-schema] BLOCKED: preflight did not complete.');
  process.exitCode = 1;
});

module.exports = { validatePreviewTarget, main };
