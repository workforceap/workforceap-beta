#!/usr/bin/env node

/**
 * Preview-only DEMO bootstrap for the two-attempt preassessment columns.
 * Prisma already selects `assessment_attempt_count` and
 * `assessment_retake_requested_at` on `/dashboard`; DEMO was missing them, so
 * the signed-in member home crashed. Never runs outside Vercel Preview + DEMO.
 */
const { validatePreviewTarget } = require('./apply-preview-training-workspace-schema.cjs');

const REQUIRED_COLUMNS = [
  'assessment_attempt_count',
  'assessment_retake_requested_at',
  'assessment_history',
];

async function readColumnState(prisma) {
  const rows = await prisma.$queryRawUnsafe(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name IN (
        'assessment_attempt_count',
        'assessment_retake_requested_at',
        'assessment_history'
      )
    ORDER BY column_name
  `);
  return new Set(rows.map((row) => row.column_name));
}

function columnsReady(present) {
  return REQUIRED_COLUMNS.every((name) => present.has(name));
}

async function applyColumns(prisma) {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS assessment_attempt_count INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS assessment_retake_requested_at TIMESTAMP(3),
      ADD COLUMN IF NOT EXISTS assessment_history JSONB NOT NULL DEFAULT '[]'::jsonb
  `);
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'users_assessment_attempt_count_nonnegative'
      ) THEN
        ALTER TABLE users ADD CONSTRAINT users_assessment_attempt_count_nonnegative
          CHECK (assessment_attempt_count >= 0);
      END IF;
    END $$
  `);
  await prisma.$executeRawUnsafe(`
    CREATE OR REPLACE FUNCTION guard_assessment_attempt_fields() RETURNS trigger
    LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $fn$
    BEGIN
      IF current_user IN ('anon', 'authenticated')
         OR current_setting('role', true) IN ('anon', 'authenticated') THEN
        IF TG_OP = 'INSERT' THEN
          IF NEW.assessment_attempt_count <> 0 OR NEW.assessment_retake_requested_at IS NOT NULL
             OR NEW.assessment_history <> '[]'::jsonb THEN
            RAISE EXCEPTION 'Assessment attempt fields are server-owned' USING ERRCODE = '42501';
          END IF;
        ELSIF ROW(NEW.assessment_attempt_count, NEW.assessment_retake_requested_at, NEW.assessment_history)
           IS DISTINCT FROM ROW(OLD.assessment_attempt_count, OLD.assessment_retake_requested_at, OLD.assessment_history) THEN
          RAISE EXCEPTION 'Assessment attempt fields are server-owned' USING ERRCODE = '42501';
        END IF;
      END IF;
      RETURN NEW;
    END;
    $fn$
  `);
  await prisma.$executeRawUnsafe(`REVOKE ALL ON FUNCTION guard_assessment_attempt_fields() FROM PUBLIC`);
  await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS users_guard_assessment_attempt_fields ON users`);
  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER users_guard_assessment_attempt_fields
    BEFORE INSERT OR UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION guard_assessment_attempt_fields()
  `);
}

async function ensurePreviewSchema(target, options = {}) {
  const PrismaClient = options.PrismaClient || require('@prisma/client').PrismaClient;
  const prisma = new PrismaClient({ datasources: { db: { url: target.directDatabaseUrl } } });
  try {
    if (columnsReady(await readColumnState(prisma))) return { applied: false };
    await (options.applyColumns || applyColumns)(prisma);
    if (!columnsReady(await readColumnState(prisma))) {
      throw new Error('Assessment-attempt columns were not present after apply.');
    }
    return { applied: true };
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const target = validatePreviewTarget();
  console.log('[preview-assessment-attempts] target verified: Vercel Preview + DEMO Supabase.');
  if (process.argv.includes('--check')) {
    console.log('[preview-assessment-attempts] target verified; no database command executed.');
    return;
  }
  const result = await ensurePreviewSchema(target);
  console.log(
    `[preview-assessment-attempts] schema verified (${result.applied ? 'applied' : 'already present'}).`,
  );
}

if (require.main === module) {
  main().catch(() => {
    console.error('[preview-assessment-attempts] BLOCKED: target guard or schema verification failed.');
    process.exitCode = 1;
  });
}

module.exports = {
  REQUIRED_COLUMNS,
  validatePreviewTarget,
  columnsReady,
  ensurePreviewSchema,
  main,
};
