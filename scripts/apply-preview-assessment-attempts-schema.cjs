#!/usr/bin/env node

/**
 * Preview-only DEMO bootstrap for the two-attempt preassessment columns.
 * Applies columns, constraints, and triggers atomically and verifies the end
 * state so an interrupted run cannot report success with protections missing.
 */
const { validatePreviewTarget } = require('./apply-preview-training-workspace-schema.cjs');

const REQUIRED_COLUMNS = [
  'assessment_attempt_count',
  'assessment_retake_requested_at',
  'assessment_history',
];

const REQUIRED_CONSTRAINT = 'users_assessment_attempt_count_nonnegative';
const REQUIRED_TRIGGER = 'users_guard_assessment_attempt_fields';
const REQUIRED_FUNCTION = 'guard_assessment_attempt_fields';

async function readColumnState(prisma) {
  const rows = await prisma.$queryRawUnsafe(`
    SELECT column_name, data_type, is_nullable, column_default
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
  return new Set(rows.filter(columnDefinitionReady).map((row) => row.column_name));
}

function columnDefinitionReady(row) {
  if (row.column_name === 'assessment_attempt_count') return row.data_type === 'integer' && row.is_nullable === 'NO' && row.column_default === '0';
  if (row.column_name === 'assessment_history') return row.data_type === 'jsonb' && row.is_nullable === 'NO' && row.column_default === "'[]'::jsonb";
  return row.column_name === 'assessment_retake_requested_at' && row.data_type === 'timestamp without time zone' && row.is_nullable === 'YES' && row.column_default == null;
}

function columnsReady(present) {
  return REQUIRED_COLUMNS.every((name) => present.has(name));
}

async function readProtectionState(prisma) {
  const columns = await readColumnState(prisma);
  const constraints = await prisma.$queryRawUnsafe(`
    SELECT conname
    FROM pg_constraint
    WHERE conname = '${REQUIRED_CONSTRAINT}' AND conrelid = 'public.users'::regclass AND convalidated
  `);
  const triggers = await prisma.$queryRawUnsafe(`
    SELECT tgname
    FROM pg_trigger
    WHERE tgname = '${REQUIRED_TRIGGER}'
      AND NOT tgisinternal AND tgrelid = 'public.users'::regclass AND tgenabled IN ('O', 'A')
      AND tgtype = 23 AND tgfoid = to_regprocedure('public.guard_assessment_attempt_fields()')
  `);
  const functions = await prisma.$queryRawUnsafe(`
    SELECT proname
    FROM pg_proc
    JOIN pg_namespace n ON n.oid = pg_proc.pronamespace
    WHERE n.nspname = 'public'
      AND proname = '${REQUIRED_FUNCTION}'
      AND NOT prosecdef AND pronargs = 0
  `);
  return {
    columns,
    constraint: constraints.length > 0,
    trigger: triggers.length > 0,
    function: functions.length > 0,
  };
}

function protectionsReady(state) {
  return (
    columnsReady(state.columns) &&
    state.constraint &&
    state.trigger &&
    state.function
  );
}

async function applyAllProtections(prisma) {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(902902)');
    await tx.$executeRawUnsafe(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS assessment_attempt_count INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS assessment_retake_requested_at TIMESTAMP(3),
        ADD COLUMN IF NOT EXISTS assessment_history JSONB NOT NULL DEFAULT '[]'::jsonb
    `);
    await tx.$executeRawUnsafe(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = '${REQUIRED_CONSTRAINT}' AND conrelid = 'public.users'::regclass
        ) THEN
          ALTER TABLE users ADD CONSTRAINT ${REQUIRED_CONSTRAINT}
            CHECK (assessment_attempt_count >= 0);
        END IF;
      END $$
    `);
    await tx.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION ${REQUIRED_FUNCTION}() RETURNS trigger
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
    await tx.$executeRawUnsafe(`REVOKE ALL ON FUNCTION ${REQUIRED_FUNCTION}() FROM PUBLIC`);
    await tx.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${REQUIRED_TRIGGER} ON users`);
    await tx.$executeRawUnsafe(`
      CREATE TRIGGER ${REQUIRED_TRIGGER}
      BEFORE INSERT OR UPDATE ON users
      FOR EACH ROW EXECUTE FUNCTION ${REQUIRED_FUNCTION}()
    `);
    await assertAssessmentAttemptProtections(tx);
  });
}

async function assertAssessmentAttemptProtections(prisma) {
  const state = await readProtectionState(prisma);
  const missing = [];
  if (!columnsReady(state.columns)) missing.push('columns');
  if (!state.constraint) missing.push('constraint');
  if (!state.function) missing.push('function');
  if (!state.trigger) missing.push('trigger');
  if (missing.length > 0) {
    throw new Error(
      `Assessment attempt protections incomplete on DEMO (${missing.join(', ')}). Refusing to continue.`,
    );
  }
}

async function ensurePreviewSchema(target, options = {}) {
  const PrismaClient = options.PrismaClient || require('@prisma/client').PrismaClient;
  const prisma = new PrismaClient({ datasources: { db: { url: target.directDatabaseUrl } } });
  const apply = options.applyColumns || applyAllProtections;
  try {
    const before = await readProtectionState(prisma);
    if (protectionsReady(before)) {
      await assertAssessmentAttemptProtections(prisma);
      return { applied: false };
    }
    await apply(prisma);
    await assertAssessmentAttemptProtections(prisma);
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
  REQUIRED_CONSTRAINT,
  REQUIRED_TRIGGER,
  REQUIRED_FUNCTION,
  validatePreviewTarget,
  columnsReady,
  columnDefinitionReady,
  readProtectionState,
  protectionsReady,
  applyAllProtections,
  assertAssessmentAttemptProtections,
  ensurePreviewSchema,
  main,
};
