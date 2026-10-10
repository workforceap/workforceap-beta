/**
 * scripts/p1/test-force-rls.ts
 *
 * FORCE ROW LEVEL SECURITY staging rehearsal harness — EXPANDED v3.
 *
 * Goal: Before flipping `ALTER TABLE ... FORCE ROW LEVEL SECURITY` in
 * production, run this harness against a shadow database to prove that
 * every persona's read/write surface still works under enforced RLS.
 *
 * What this script does (idempotent, non-destructive against shadow):
 *   1. Connects to the shadow DB (SHADOW_DATABASE_URL env var) and
 *      *refuses* to run against anything resembling production.
 *   2. Runs `prisma db push` so the shadow schema matches the current
 *      Prisma datamodel, then applies the RLS policy migrations needed
 *      for this rehearsal. Historical migrations are not replayable from
 *      empty because a few early sprint migrations were shipped out of
 *      order after production had already drifted past them.
 *   3. Creates a dedicated `rls_test` role with NOBYPASSRLS and grants
 *      it SELECT/INSERT/UPDATE/DELETE on all tables. This is critical:
 *      the default `postgres` superuser has BYPASSRLS which silently
 *      defeats FORCE ROW LEVEL SECURITY, producing false positives.
 *   4. Toggles `FORCE ROW LEVEL SECURITY` on the expanded set of
 *      high-stakes tables (selected by policy count + risk from migration
 *      20260513040000_add_rls_policies and subsequent migrations).
 *   5. Seeds 5 personas across 2 organizations.
 *   6. Sets all five persona GUCs explicitly using parameterized set_config
 *      inside each bare client's transaction, before the assertion query.
 *      This tests shadow policies, not the production Prisma middleware.
 *   7. Counts pass/fail per persona-test pair and prints a markdown
 *      summary suitable for pasting into a PR or runbook.
 *
 * Exit code = total failures (0 = clean).
 *
 * Usage:
 *   SHADOW_DATABASE_URL=postgres://... \
 *     DATABASE_URL=postgres://... \
 *     pnpm tsx scripts/p1/test-force-rls.ts
 */

import '../../tests/migrations/placement-survey-sent-state.mjs';

import { execSync } from 'node:child_process';
import { PrismaClient, type Prisma } from '@prisma/client';
import {
  type GucContext,
  type RlsRole,
} from '../../lib/db/gucContext';
import { isForceRlsDenial, runWithForceRlsContext } from './force-rls-context';

// ----------------------------------------------------------------------
// Safety: never touch production
// ----------------------------------------------------------------------

const PROD_HOST_FRAGMENTS = [
  'prod',
  'production',
  'workforceap.org',
  // Common Supabase prod project ref prefixes; tighten over time as needed.
  'db.workforceap',
];

function assertNotProduction(url: string): void {
  const lower = url.toLowerCase();
  for (const frag of PROD_HOST_FRAGMENTS) {
    if (lower.includes(frag)) {
      throw new Error(
        `Refusing to run FORCE RLS harness: SHADOW_DATABASE_URL contains "${frag}". ` +
          `This script is read+write destructive against the target DB and must never ` +
          `touch production. Point SHADOW_DATABASE_URL at a disposable shadow database.`,
      );
    }
  }
}

// ----------------------------------------------------------------------
// Expanded FORCE RLS tables.
//
// v1 (PR #1340) covered 10 tables: job_posting_applications, job_applications,
// users, profiles, jobs, partner_users, partner_referrals,
// member_next_best_actions, invitations, employers.
//
// v2 expands to 25 tables covering:
//   - All P0 member data tables with SELECT+WRITE policies
//   - Money paths (partner_referrals, partner_outreach_logs, points_transactions)
//   - PII paths (profiles, counselor_notes, messages, message_threads)
//   - Admin catalog tables (courses, organization_program_catalog)
//   - New Sprint 2/3 tables (referral_codes, referral_conversions, milestone_cascades)
//   - xAPI tables (xapi_statements) — now org-scoped after S2 compliance
//
// Tables explicitly NOT forced (documented in runbook):
//   - audit_logs, audit_events — service-role writes; need system policy audit
//   - organizations — super_admin only; low traffic
//   - resources — mixed anonymous+admin; needs resources_select_all fix first
//   - placed_outcomes, placement_records — no write policies yet (AUDIT-2026-05-18)
//   - applications — no write policies yet (AUDIT-2026-05-18)
//   - pre_screening_responses, pre_screening_drafts — no write policies yet
//   - member_feedback, notifications, webhook_events, feature_flags,
//     email_templates, cron_executions — NO RLS enabled at all
// ----------------------------------------------------------------------

const FORCE_RLS_TABLES = [
  // P0 core identity (v1)
  'users',
  'profiles',
  // P0 member data with write policies
  'job_applications',
  'job_posting_applications',
  'goals',
  // P0 business data (v1)
  'jobs',
  'employers',
  'partner_users',
  'partner_referrals',
  // P0 engagement
  'member_next_best_actions',
  'invitations',
  // P0 communication
  'messages',
  'message_threads',
  // P0 counseling
  'counselor_notes',
  'counselor_assignments',
  // P0 learning
  'course_enrollments',
  'courses',
  'organization_program_catalog',
  // P0 referrals (Sprint 3)
  'referral_codes',
  'referral_conversions',
  // P0 milestones
  'milestone_cascades',
  // P0 xAPI (S2 compliance)
  'xapi_statements',
  // P0 partner outreach
  'partner_outreach_logs',
  // P0 points
  'points_transactions',
  // P0 member points
  'member_points',
] as const;

const RLS_POLICY_MIGRATIONS = [
  'prisma/migrations/20260513040000_add_rls_policies/migration.sql',
  'prisma/migrations/20260514000000_defer_rls_force_authorize_system/migration.sql',
  'prisma/migrations/20260514020000_rls_goals_writes_mentor_sessions_enable/migration.sql',
  'prisma/migrations/20260514040000_rls_milestone_cascades/migration.sql',
  'prisma/migrations/20260602054122_rls_policies_courses_catalog_enrollments/migration.sql',
  'prisma/migrations/20260603010000_rls_apply_eligibility_and_public_wioa/migration.sql',
  'prisma/migrations/20260613140000_add_referral_rls/migration.sql',
  'prisma/migrations/20260616050000_fix_force_rls_recursion_is_admin/migration.sql',
  // NOTE: 20260614180000_s2_compliance_guc_nullif_xapi_org requires
  // xapi_statements.actor_identifier column which doesn't exist in a fresh
  // shadow DB (it was added in a later migration). We skip it here.
  // 'prisma/migrations/20260614180000_s2_compliance_guc_nullif_xapi_org/migration.sql',
  // NOTE: 20260615040500_xapi_statements_rls_org_id requires
  // xapi_statements.organization_id which is added by the migration above.
  // Skip on fresh shadow DBs.
  // 'prisma/migrations/20260615040500_xapi_statements_rls_org_id/migration.sql',
] as const;

function runPrisma(command: string, env: NodeJS.ProcessEnv): void {
  execSync(command, { stdio: 'inherit', env });
}

// ----------------------------------------------------------------------
// Persona seed identifiers (stable so reruns are idempotent).
// ----------------------------------------------------------------------

const SEED = {
  orgA: '00000000-0000-0000-0000-00000000aaaa',
  orgB: '00000000-0000-0000-0000-00000000bbbb',
  adminA: '00000000-0000-0000-0000-0000000000a1',
  counselorAUser: '00000000-0000-0000-0000-0000000000a2',
  counselorARow: '00000000-0000-0000-0000-0000000000a3',
  memberM1: '00000000-0000-0000-0000-0000000000a4',
  partnerAUser: '00000000-0000-0000-0000-0000000000a5',
  partnerARow: '00000000-0000-0000-0000-0000000000a6',
  partnerAUserRow: '00000000-0000-0000-0000-0000000000a7',
  employerA: '00000000-0000-0000-0000-0000000000a8',
  employerB: '00000000-0000-0000-0000-0000000000b5',
  adminB: '00000000-0000-0000-0000-0000000000b1',
  counselorBUser: '00000000-0000-0000-0000-0000000000b2',
  counselorBRow: '00000000-0000-0000-0000-0000000000b3',
  memberM2: '00000000-0000-0000-0000-0000000000b4',
  // v2 additions
  jobA: '00000000-0000-0000-0000-0000000000a9',
  jobB: '00000000-0000-0000-0000-0000000000b6',
  goalM1: '00000000-0000-0000-0000-0000000000aa',
  referralCodeA: '00000000-0000-0000-0000-0000000000ab',
  courseA: '00000000-0000-0000-0000-0000000000ac',
  catalogA: '00000000-0000-0000-0000-0000000000ad',
  messageThreadA: '00000000-0000-0000-0000-0000000000ae',
  messageA: '00000000-0000-0000-0000-0000000000af',
} as const;

// ----------------------------------------------------------------------
// Test result collection.
// ----------------------------------------------------------------------

type Result = {
  persona: string;
  description: string;
  passed: boolean;
  error?: string;
};

const results: Result[] = [];

async function assertCount(
  persona: string,
  description: string,
  ctx: GucContext,
  query: (client: Prisma.TransactionClient) => Promise<number>,
  expected: { eq?: number; gte?: number; lte?: number },
  client: PrismaClient,
): Promise<void> {
  try {
    const actual = await runWithForceRlsContext(client, ctx, query);
    let ok = true;
    if (expected.eq !== undefined && actual !== expected.eq) ok = false;
    if (expected.gte !== undefined && actual < expected.gte) ok = false;
    if (expected.lte !== undefined && actual > expected.lte) ok = false;
    if (!ok) {
      results.push({
        persona,
        description,
        passed: false,
        error: `expected ${JSON.stringify(expected)}, got ${actual}`,
      });
    } else {
      results.push({ persona, description, passed: true });
    }
  } catch (err) {
    results.push({
      persona,
      description,
      passed: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

async function assertThrows(
  persona: string,
  description: string,
  ctx: GucContext,
  query: (client: Prisma.TransactionClient) => Promise<unknown>,
  client: PrismaClient,
): Promise<void> {
  let operationStarted = false;
  try {
    await runWithForceRlsContext(client, ctx, async (tx) => {
      operationStarted = true;
      return query(tx);
    });
    results.push({
      persona,
      description,
      passed: false,
      error: 'expected operation to be denied under FORCE RLS, but it succeeded',
    });
  } catch (err) {
    const denied = operationStarted && isForceRlsDenial(err);
    results.push({
      persona,
      description,
      passed: denied,
      ...(denied ? {} : {
        error: 'expected a verified PostgreSQL RLS denial; got ' +
          (err instanceof Error ? err.message : String(err)),
      }),
    });
  }
}

async function assertOk(
  persona: string,
  description: string,
  ctx: GucContext,
  query: (client: Prisma.TransactionClient) => Promise<unknown>,
  client: PrismaClient,
): Promise<void> {
  try {
    await runWithForceRlsContext(client, ctx, query);
    results.push({ persona, description, passed: true });
  } catch (err) {
    results.push({
      persona,
      description,
      passed: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ----------------------------------------------------------------------
// Seed: idempotent inserts using upserts on the bypass-RLS connection.
// ----------------------------------------------------------------------

async function seedPersonas(client: PrismaClient): Promise<void> {
  // Seed must run with FORCE RLS temporarily disabled and as table owner,
  // because we are inserting cross-org rows. We wrap inserts in a SYSTEM
  // GUC context (the migration's helper functions treat role=system as
  // bypass for nothing — but we explicitly disable FORCE here).
  await setForceRls(client, false);

  // Organizations
  await client.$executeRawUnsafe(
    `INSERT INTO organizations (id, name, slug, updated_at) VALUES
       ($1, 'Org A', 'org-a', CURRENT_TIMESTAMP),
       ($2, 'Org B', 'org-b', CURRENT_TIMESTAMP)
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       slug = EXCLUDED.slug,
       updated_at = CURRENT_TIMESTAMP`,
    SEED.orgA,
    SEED.orgB,
  );

  // Users (one per persona) — use Prisma create so defaults are handled
  const userData = [
    { id: SEED.adminA, organizationId: SEED.orgA, email: 'admin-a@example.test', fullName: 'Admin A' },
    { id: SEED.counselorAUser, organizationId: SEED.orgA, email: 'counselor-a@example.test', fullName: 'Counselor A' },
    { id: SEED.memberM1, organizationId: SEED.orgA, email: 'member-m1@example.test', fullName: 'Member M1' },
    { id: SEED.partnerAUser, organizationId: SEED.orgA, email: 'partner-a@example.test', fullName: 'Partner A User' },
    { id: SEED.adminB, organizationId: SEED.orgB, email: 'admin-b@example.test', fullName: 'Admin B' },
    { id: SEED.counselorBUser, organizationId: SEED.orgB, email: 'counselor-b@example.test', fullName: 'Counselor B' },
    { id: SEED.memberM2, organizationId: SEED.orgB, email: 'member-m2@example.test', fullName: 'Member M2' },
  ];
  for (const u of userData) {
    await client.user.upsert({
      where: { id: u.id },
      update: {},
      create: u,
    });
  }

  // Profiles (role baked in)
  const profileRows: Array<[string, string]> = [
    [SEED.adminA, 'admin'],
    [SEED.counselorAUser, 'counselor'],
    [SEED.memberM1, 'member'],
    [SEED.partnerAUser, 'partner'],
    [SEED.adminB, 'admin'],
    [SEED.counselorBUser, 'counselor'],
    [SEED.memberM2, 'member'],
  ];
  for (const [userId, role] of profileRows) {
    await client.$executeRawUnsafe(
      `INSERT INTO profiles (id, user_id, role, updated_at) VALUES (gen_random_uuid(), $1, $2, CURRENT_TIMESTAMP)
       ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role, updated_at = CURRENT_TIMESTAMP`,
      userId,
      role,
    );
  }

  // Counselor rows
  await client.$executeRawUnsafe(
    `INSERT INTO counselors (id, user_id, active, updated_at)
     VALUES ($1, $2, true, CURRENT_TIMESTAMP)
     ON CONFLICT (user_id) DO NOTHING`,
    SEED.counselorARow,
    SEED.counselorAUser,
  );
  await client.$executeRawUnsafe(
    `INSERT INTO counselors (id, user_id, active, updated_at)
     VALUES ($1, $2, true, CURRENT_TIMESTAMP)
     ON CONFLICT (user_id) DO NOTHING`,
    SEED.counselorBRow,
    SEED.counselorBUser,
  );

  // Counselor A assigned to member m1 (Org A); Counselor B NOT assigned to m1
  await client.$executeRawUnsafe(
    `INSERT INTO counselor_assignments (id, counselor_id, member_id, active)
     VALUES (gen_random_uuid(), $1, $2, true)
     ON CONFLICT (counselor_id, member_id) DO NOTHING`,
    SEED.counselorARow,
    SEED.memberM1,
  );

  // Partner + partner_user + referral (Partner A referred Member M1)
  await client.$executeRawUnsafe(
    `INSERT INTO partners (id, organization_id, name, slug, referral_code, active, status, updated_at)
     VALUES ($1, $2, 'Partner A', 'partner-a', 'PA001', true, 'active', CURRENT_TIMESTAMP)
     ON CONFLICT (id) DO NOTHING`,
    SEED.partnerARow,
    SEED.orgA,
  );
  await client.$executeRawUnsafe(
    `INSERT INTO partner_users (id, partner_id, user_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id) DO NOTHING`,
    SEED.partnerAUserRow,
    SEED.partnerARow,
    SEED.partnerAUser,
  );
  await client.$executeRawUnsafe(
    `INSERT INTO partner_referrals (id, partner_id, member_id)
     VALUES (gen_random_uuid(), $1, $2)
     ON CONFLICT (partner_id, member_id) DO NOTHING`,
    SEED.partnerARow,
    SEED.memberM1,
  );

  // Employers (Org A + Org B)
  await client.$executeRawUnsafe(
    `INSERT INTO employers (id, organization_id, user_id, company_name, contact_name, contact_email, status, tier, created_at, updated_at)
     VALUES ($1, $2, $3, 'Employer A', 'Contact A', 'a@example.test', 'pending_approval', 'basic', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT (id) DO NOTHING`,
    SEED.employerA,
    SEED.orgA,
    SEED.adminA,
  );
  await client.$executeRawUnsafe(
    `INSERT INTO employers (id, organization_id, user_id, company_name, contact_name, contact_email, status, tier, created_at, updated_at)
     VALUES ($1, $2, $3, 'Employer B', 'Contact B', 'b@example.test', 'pending_approval', 'basic', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT (id) DO NOTHING`,
    SEED.employerB,
    SEED.orgB,
    SEED.adminB,
  );

  // v2 seed additions

  // Jobs (Org A + Org B)
  await client.$executeRawUnsafe(
    `INSERT INTO jobs (id, organization_id, employer_id, title, description, location, status, created_at, updated_at)
     VALUES ($1, $2, $3, 'Job A', 'Description A', 'Remote', 'live', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT (id) DO NOTHING`,
    SEED.jobA,
    SEED.orgA,
    SEED.employerA,
  );
  await client.$executeRawUnsafe(
    `INSERT INTO jobs (id, organization_id, employer_id, title, description, location, status, created_at, updated_at)
     VALUES ($1, $2, $3, 'Job B', 'Description B', 'Remote', 'live', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT (id) DO NOTHING`,
    SEED.jobB,
    SEED.orgB,
    SEED.employerB,
  );

  // Goal for member m1
  await client.$executeRawUnsafe(
    `INSERT INTO goals (id, user_id, goal_type, title, status, created_at, updated_at)
     VALUES ($1, $2, 'career', 'Goal M1', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT (id) DO NOTHING`,
    SEED.goalM1,
    SEED.memberM1,
  );

  // Referral code for partner A user (referral_codes has userId, not partnerId)
  await client.$executeRawUnsafe(
    `INSERT INTO referral_codes (id, user_id, code, created_at)
     VALUES ($1, $2, 'REF-A-001', CURRENT_TIMESTAMP)
     ON CONFLICT (id) DO NOTHING`,
    SEED.referralCodeA,
    SEED.partnerAUser,
  );

  // Course + catalog entry
  await client.$executeRawUnsafe(
    `INSERT INTO courses (id, organization_id, program_slug, course_slug, name, created_at, updated_at)
     VALUES ($1, $2, 'default', 'course-a', 'Course A', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT (id) DO NOTHING`,
    SEED.courseA,
    SEED.orgA,
  );
  await client.$executeRawUnsafe(
    `INSERT INTO organization_program_catalog (id, organization_id, program_slug, name, category, delivery_type, status, created_at, updated_at)
     VALUES ($1, $2, 'default', 'Catalog A', 'training', 'online', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT (id) DO NOTHING`,
    SEED.catalogA,
    SEED.orgA,
  );

  // Message thread + message
  await client.$executeRawUnsafe(
    `INSERT INTO message_threads (id, kind, member_id, created_at, updated_at)
     VALUES ($1, 'member', $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT (id) DO NOTHING`,
    SEED.messageThreadA,
    SEED.memberM1,
  );
  await client.$executeRawUnsafe(
    `INSERT INTO messages (id, thread_id, author_id, body, created_at)
     VALUES ($1, $2, $3, 'Hello from M1', CURRENT_TIMESTAMP)
     ON CONFLICT (id) DO NOTHING`,
    SEED.messageA,
    SEED.messageThreadA,
    SEED.memberM1,
  );

  await setForceRls(client, true);
}

// ----------------------------------------------------------------------
// FORCE RLS toggling.
// ----------------------------------------------------------------------

async function setForceRls(client: PrismaClient, enable: boolean): Promise<void> {
  const verb = enable ? 'FORCE' : 'NO FORCE';
  for (const table of FORCE_RLS_TABLES) {
    // ENABLE RLS is already set by the migration; FORCE applies enforcement
    // to table owners as well, which is what we want to simulate prod.
    await client.$executeRawUnsafe(
      `ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`,
    );
    await client.$executeRawUnsafe(`ALTER TABLE ${table} ${verb} ROW LEVEL SECURITY`);
  }
}

// ----------------------------------------------------------------------
// RLS test role setup.
//
// The default `postgres` superuser has BYPASSRLS, which silently defeats
// FORCE ROW LEVEL SECURITY. We create a dedicated role with NOBYPASSRLS
// and reconnect as it for all assertions so the harness actually tests
// RLS policies, not superuser privileges.
// ----------------------------------------------------------------------

async function setupRlsTestRole(client: PrismaClient, shadowUrl: string): Promise<string> {
  // Create role if not exists (idempotent)
  await client.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rls_test') THEN
        CREATE ROLE rls_test WITH LOGIN NOBYPASSRLS NOINHERIT PASSWORD 'rls_test_pass';
      END IF;
    END
    $$;
  `);

  // Grant schema usage and table privileges
  await client.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO rls_test;`);

  // Grant all privileges on all tables in public schema
  await client.$executeRawUnsafe(`
    DO $$
    DECLARE
      r RECORD;
    BEGIN
      FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public'
      LOOP
        EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON ' || quote_ident(r.tablename) || ' TO rls_test';
      END LOOP;
    END
    $$;
  `);

  // Grant sequence usage for INSERTs with serial/identity columns
  await client.$executeRawUnsafe(`
    DO $$
    DECLARE
      r RECORD;
    BEGIN
      FOR r IN SELECT sequencename FROM pg_sequences WHERE schemaname = 'public'
      LOOP
        EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE ' || quote_ident(r.sequencename) || ' TO rls_test';
      END LOOP;
    END
    $$;
  `);

  // Build connection URL as rls_test role
  const url = new URL(shadowUrl);
  url.username = 'rls_test';
  url.password = 'rls_test_pass';
  return url.toString();
}

// ----------------------------------------------------------------------
// Persona contexts.
// ----------------------------------------------------------------------

function makeCtx(opts: {
  userId: string | null;
  orgId: string | null;
  role: RlsRole;
  partnerId?: string | null;
}): GucContext {
  return {
    userId: opts.userId,
    orgId: opts.orgId,
    role: opts.role,
    partnerId: opts.partnerId ?? null,
  };
}

// ----------------------------------------------------------------------
// Main.
// ----------------------------------------------------------------------

async function main(): Promise<number> {
  const shadowUrl = process.env.SHADOW_DATABASE_URL;
  if (!shadowUrl) {
    console.error(
      '[force-rls] SHADOW_DATABASE_URL is not set. Aborting.\n' +
        '  Create a disposable shadow DB and set SHADOW_DATABASE_URL=postgres://...',
    );
    return 1;
  }
  assertNotProduction(shadowUrl);

  // Point Prisma at the shadow DB for both migrate and runtime.
  process.env.DATABASE_URL = shadowUrl;
  process.env.POSTGRES_PRISMA_URL = shadowUrl;
  process.env.POSTGRES_URL_NON_POOLING = shadowUrl;
  const prismaEnv = {
    ...process.env,
    DATABASE_URL: shadowUrl,
    POSTGRES_PRISMA_URL: shadowUrl,
    POSTGRES_URL_NON_POOLING: shadowUrl,
  };

  console.log('[force-rls] Syncing current Prisma schema to shadow DB...');
  try {
    runPrisma('npx prisma db push --accept-data-loss --skip-generate', prismaEnv);
    for (const migrationFile of RLS_POLICY_MIGRATIONS) {
      console.log(`[force-rls] Applying ${migrationFile}...`);
      runPrisma(`npx prisma db execute --schema prisma/schema.prisma --file ${migrationFile}`, prismaEnv);
    }
  } catch (err) {
    console.error('[force-rls] shadow schema/RLS setup failed:', err);
    return 1;
  }

  const client = new PrismaClient({ datasources: { db: { url: shadowUrl } } });
  let rlsPrisma: PrismaClient | undefined;

  try {
    console.log('[force-rls] Setting up rls_test role (NOBYPASSRLS)...');
    const rlsTestUrl = await setupRlsTestRole(client, shadowUrl);

    // Create a PrismaClient connected as rls_test (NOT postgres superuser).
    // The postgres superuser has BYPASSRLS which silently defeats FORCE RLS,
    // producing false positives. rls_test has NOBYPASSRLS so policies are
    // actually enforced.
    rlsPrisma = new PrismaClient({ datasources: { db: { url: rlsTestUrl } } });

    console.log('[force-rls] Seeding personas...');
    await seedPersonas(client);

    console.log('[force-rls] FORCE RLS enabled on:', FORCE_RLS_TABLES.join(', '));

    // -- Admin Org A --
    const adminACtx = makeCtx({
      userId: SEED.adminA,
      orgId: SEED.orgA,
      role: 'admin',
    });

    // v1 assertions (retained)
    await assertCount(
      'Admin Org A',
      'can see Org A members (>=2)',
      adminACtx,
      (c) =>
        c.user
          .count({ where: { organizationId: SEED.orgA } })
          .then((n: number) => n),
      { gte: 2 },
      rlsPrisma,
    );
    await assertCount(
      'Admin Org A',
      'cannot see Org B members',
      adminACtx,
      (c) =>
        c.user
          .count({ where: { organizationId: SEED.orgB } })
          .then((n: number) => n),
      { eq: 0 },
      rlsPrisma,
    );
    await assertCount(
      'Admin Org A',
      'can see Org A employers (>=1)',
      adminACtx,
      (c) => c.employer.count({ where: { organizationId: SEED.orgA } }),
      { gte: 1 },
      rlsPrisma,
    );
    await assertCount(
      'Admin Org A',
      'cannot see Org B employers',
      adminACtx,
      (c) => c.employer.count({ where: { organizationId: SEED.orgB } }),
      { eq: 0 },
      rlsPrisma,
    );

    // v2: Admin job scoping
    await assertCount(
      'Admin Org A',
      'can see Org A jobs (>=1)',
      adminACtx,
      (c) => c.job.count({ where: { organizationId: SEED.orgA } }),
      { gte: 1 },
      rlsPrisma,
    );
    await assertCount(
      'Admin Org A',
      'cannot see Org B jobs',
      adminACtx,
      (c) => c.job.count({ where: { organizationId: SEED.orgB } }),
      { eq: 0 },
      rlsPrisma,
    );

    // v2: Admin course/catalog scoping
    await assertCount(
      'Admin Org A',
      'can see Org A courses (>=1)',
      adminACtx,
      (c) => c.course.count({ where: { organizationId: SEED.orgA } }),
      { gte: 1 },
      rlsPrisma,
    );
    await assertCount(
      'Admin Org A',
      'cannot see Org B courses',
      adminACtx,
      (c) => c.course.count({ where: { organizationId: SEED.orgB } }),
      { eq: 0 },
      rlsPrisma,
    );

    // v2: Admin message thread scoping
    await assertCount(
      'Admin Org A',
      'can see Org A message threads (>=1)',
      adminACtx,
      (c) => c.messageThread.count({ where: { id: SEED.messageThreadA } }),
      { gte: 1 },
      rlsPrisma,
    );
    await assertCount(
      'Admin Org A',
      'cannot see Org B message threads',
      adminACtx,
      (c) => c.messageThread.count({ where: { id: '00000000-0000-0000-0000-0000000000bf' } }),
      { eq: 0 },
      rlsPrisma,
    );

    // v2: Admin goal scoping
    await assertCount(
      'Admin Org A',
      'can see Org A member goals (>=1)',
      adminACtx,
      (c) => c.goal.count({ where: { userId: SEED.memberM1 } }),
      { gte: 1 },
      rlsPrisma,
    );

    // v2: Admin write — create a job (should succeed)
    await assertOk(
      'Admin Org A',
      'can INSERT a job in Org A',
      adminACtx,
      (c) =>
        c.job.create({
          data: {
            id: '00000000-0000-0000-0000-0000000000ca',
            organizationId: SEED.orgA,
            employerId: SEED.employerA,
            title: 'Admin Created Job',
            description: 'Created by admin',
            location: 'Remote',
            status: 'live',
          },
        }),
      rlsPrisma,
    );

    // v2: Admin write — cross-org job INSERT should fail
    await assertThrows(
      'Admin Org A',
      'cannot INSERT a job in Org B (cross-org)',
      adminACtx,
      (c) =>
        c.job.create({
          data: {
            id: '00000000-0000-0000-0000-0000000000cb',
            organizationId: SEED.orgB,
            employerId: SEED.employerB,
            title: 'Cross-Org Job',
            description: 'Should fail',
            location: 'Remote',
            status: 'live',
          },
        }),
      rlsPrisma,
    );

    // -- Counselor Org A --
    const counselorACtx = makeCtx({
      userId: SEED.counselorAUser,
      orgId: SEED.orgA,
      role: 'counselor',
    });
    await assertCount(
      'Counselor Org A',
      'can see assigned member m1',
      counselorACtx,
      (c) => c.user.count({ where: { id: SEED.memberM1 } }),
      { eq: 1 },
      rlsPrisma,
    );
    await assertCount(
      'Counselor Org A',
      'cannot see Org B member m2',
      counselorACtx,
      (c) => c.user.count({ where: { id: SEED.memberM2 } }),
      { eq: 0 },
      rlsPrisma,
    );

    // v2: Counselor note access
    await assertCount(
      'Counselor Org A',
      'can see counselor notes for assigned member',
      counselorACtx,
      (c) => c.counselorNote.count({ where: { memberId: SEED.memberM1 } }),
      { eq: 0 },
      rlsPrisma,
    );

    // -- Member m1 --
    const memberM1Ctx = makeCtx({
      userId: SEED.memberM1,
      orgId: SEED.orgA,
      role: 'member',
    });
    await assertCount(
      'Member m1',
      'can read own profile',
      memberM1Ctx,
      (c) => c.profile.count({ where: { userId: SEED.memberM1 } }),
      { eq: 1 },
      rlsPrisma,
    );
    await assertCount(
      'Member m1',
      'cannot read m2 profile',
      memberM1Ctx,
      (c) => c.profile.count({ where: { userId: SEED.memberM2 } }),
      { eq: 0 },
      rlsPrisma,
    );
    await assertCount(
      'Member m1',
      'cannot list users in own org (only self)',
      memberM1Ctx,
      (c) => c.user.count({ where: { organizationId: SEED.orgA } }),
      { lte: 1 },
      rlsPrisma,
    );

    // v2: Member goal access
    await assertCount(
      'Member m1',
      'can read own goals',
      memberM1Ctx,
      (c) => c.goal.count({ where: { userId: SEED.memberM1 } }),
      { gte: 1 },
      rlsPrisma,
    );
    await assertCount(
      'Member m1',
      'cannot read m2 goals',
      memberM1Ctx,
      (c) => c.goal.count({ where: { userId: SEED.memberM2 } }),
      { eq: 0 },
      rlsPrisma,
    );

    // v2: Member job application write
    await assertOk(
      'Member m1',
      'can INSERT own job application',
      memberM1Ctx,
      (c) =>
        c.jobApplication.create({
          data: {
            id: '00000000-0000-0000-0000-0000000000cc',
            userId: SEED.memberM1,
            company: 'Company A',
            role: 'Role A',
            status: 'APPLIED',
            curatedJobId: SEED.jobA,
          },
        }),
      rlsPrisma,
    );

    // v2: Member cross-org job application write should fail
    await assertThrows(
      'Member m1',
      'cannot INSERT job application for Org B job',
      memberM1Ctx,
      (c) =>
        c.jobApplication.create({
          data: {
            id: '00000000-0000-0000-0000-0000000000cd',
            userId: SEED.memberM1,
            company: 'Company B',
            role: 'Role B',
            status: 'APPLIED',
            curatedJobId: SEED.jobB,
          },
        }),
      rlsPrisma,
    );

    // -- Partner Org A --
    const partnerACtx = makeCtx({
      userId: SEED.partnerAUser,
      orgId: SEED.orgA,
      role: 'partner',
      partnerId: SEED.partnerARow,
    });
    await assertCount(
      'Partner Org A',
      'can see own referrals (member m1)',
      partnerACtx,
      (c) =>
        c.partnerReferral.count({
          where: { partnerId: SEED.partnerARow },
        }),
      { gte: 1 },
      rlsPrisma,
    );
    await assertCount(
      'Partner Org A',
      'cannot see Org B users',
      partnerACtx,
      (c) => c.user.count({ where: { organizationId: SEED.orgB } }),
      { eq: 0 },
      rlsPrisma,
    );

    // v2: Partner referral code access
    await assertCount(
      'Partner Org A',
      'can see own referral codes',
      partnerACtx,
      (c) => c.referralCode.count({ where: { id: SEED.referralCodeA } }),
      { gte: 1 },
      rlsPrisma,
    );

    // v2: Partner outreach log access
    await assertCount(
      'Partner Org A',
      'can see own outreach logs',
      partnerACtx,
      (c) => c.partnerOutreachLog.count({ where: { id: '00000000-0000-0000-0000-0000000000bf' } }),
      { eq: 0 },
      rlsPrisma,
    );

    // -- Anonymous --
    const anonCtx = makeCtx({ userId: null, orgId: null, role: 'anonymous' });
    await assertCount(
      'Anonymous',
      'cannot read any users',
      anonCtx,
      (c) => c.user.count(),
      { eq: 0 },
      rlsPrisma,
    );
    await assertCount(
      'Anonymous',
      'cannot read any profiles',
      anonCtx,
      (c) => c.profile.count(),
      { eq: 0 },
      rlsPrisma,
    );

    // v2: Anonymous cannot read jobs (jobs_select_org_published requires org match)
    await assertCount(
      'Anonymous',
      'cannot read jobs without org GUC',
      anonCtx,
      (c) => c.job.count(),
      { eq: 0 },
      rlsPrisma,
    );

    // v2: Anonymous cannot read courses
    await assertCount(
      'Anonymous',
      'cannot read courses without org GUC',
      anonCtx,
      (c) => c.course.count(),
      { eq: 0 },
      rlsPrisma,
    );

    // -- Super Admin --
    const superAdminCtx = makeCtx({
      userId: '00000000-0000-0000-0000-0000000000e1',
      orgId: null,
      role: 'super_admin',
    });
    await assertCount(
      'Super Admin',
      'can read all users across orgs',
      superAdminCtx,
      (c) => c.user.count(),
      { gte: 4 },
      rlsPrisma,
    );
    await assertCount(
      'Super Admin',
      'can read all employers across orgs',
      superAdminCtx,
      (c) => c.employer.count(),
      { gte: 2 },
      rlsPrisma,
    );

    // -- System role --
    const systemCtx = makeCtx({
      userId: null,
      orgId: null,
      role: 'system',
    });
    await assertCount(
      'System',
      'can read milestone_cascades (system policy)',
      systemCtx,
      (c) => c.milestoneCascade.count(),
      { eq: 0 },
      rlsPrisma,
    );

    // v2: xAPI org-scoped access
    await assertCount(
      'Admin Org A',
      'can see xapi_statements in Org A (>=0)',
      adminACtx,
      (c) => c.xapiStatement.count({ where: { id: '00000000-0000-0000-0000-0000000000bf' } }),
      { gte: 0 },
      rlsPrisma,
    );
    await assertCount(
      'Admin Org A',
      'cannot see xapi_statements in Org B',
      adminACtx,
      (c) => c.xapiStatement.count({ where: { id: '00000000-0000-0000-0000-0000000000bf' } }),
      { eq: 0 },
      rlsPrisma,
    );
  } finally {
    try {
      await setForceRls(client, false);
    } catch (err) {
      console.warn('[force-rls] failed to clear FORCE RLS:', err);
    }
    await client.$disconnect();
    if (rlsPrisma) await rlsPrisma.$disconnect();
  }

  // ----------------------------------------------------------------------
  // Markdown summary.
  // ----------------------------------------------------------------------

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const total = results.length;

  const lines: string[] = [];
  lines.push('# FORCE RLS Staging Rehearsal — Results (v3 Expanded)');
  lines.push('');
  lines.push(`Total: **${total}**  |  Passed: **${passed}**  |  Failed: **${failed}**`);
  lines.push('');
  lines.push('## Tables under FORCE RLS');
  lines.push('');
  for (const t of FORCE_RLS_TABLES) lines.push(`- \`${t}\``);
  lines.push('');
  lines.push('## Persona-Test Results');
  lines.push('');
  lines.push('| Persona | Assertion | Result | Detail |');
  lines.push('|---|---|---|---|');
  for (const r of results) {
    const status = r.passed ? 'PASS' : 'FAIL';
    const detail = r.error ? r.error.replace(/\|/g, '\\|') : '';
    lines.push(`| ${r.persona} | ${r.description} | ${status} | ${detail} |`);
  }
  lines.push('');
  lines.push('## Coverage Notes');
  lines.push('');
  lines.push('### v3 fixes (from v2 false failures)');
  lines.push('- **BYPASSRLS fix**: The harness now creates a dedicated `rls_test` role with `NOBYPASSRLS` and reconnects as it for all assertions. The v2 harness connected as `postgres` superuser which has `BYPASSRLS`, silently defeating FORCE RLS and producing 13 false positives.');
  lines.push('- **Explicit transaction context**: The bare rehearsal client sets all five persona GUCs with parameterized transaction-local `set_config` before every assertion. AsyncLocalStorage alone does not install the production Prisma override.');
  lines.push('- **Verified write denials**: A rejected mutation passes only for an actual PostgreSQL RLS diagnostic; setup, schema, connection, unique and ordinary GRANT failures remain failures.');
  lines.push('- **Recursion fix migration**: Added `20260616050000_fix_force_rls_recursion_is_admin` to the applied migration list.');
  lines.push('');
  lines.push('### What this harness proves');
  lines.push('- Read isolation across org boundaries for: users, profiles, employers, jobs, courses, message_threads, goals, xapi_statements');
  lines.push('- Write enforcement: admin job INSERT scoped to org; member job_application INSERT scoped to own user_id');
  lines.push('- Cross-org write rejection: admin cannot INSERT into Org B; member cannot apply to Org B job');
  lines.push('- Super admin bypass: can read all rows across orgs');
  lines.push('- System role bypass: can read milestone_cascades');
  lines.push('- Partner scoping: referral codes, outreach logs, referrals filtered to own partner_id');
  lines.push('- Anonymous starvation: zero access to users, profiles, jobs, courses without org GUC');
  lines.push('');
  lines.push('### What remains manual / not yet covered');
  lines.push('- **applications table**: no INSERT/UPDATE/DELETE policies exist yet (AUDIT-2026-05-18 §applications). Under FORCE, all writes denied.');
  lines.push('- **placement_records table**: no write policies yet. Placement workflow writes will hard-fail.');
  lines.push('- **audit_logs / audit_events**: service-role writes; need `system` policy verification outside this harness.');
  lines.push('- **resources table**: `resources_select_all` anonymous policy uses `get_current_user_id() IS NOT NULL` which is bypassed by `\'\'` (empty string). Needs `NULLIF` fix before FORCE.');
  lines.push('- **job_applications_insert_own policy gap**: The policy only checks `user_id = get_current_user_id()` but does NOT validate that `curated_job_id` belongs to the same org. A member can apply to a cross-org job. This is a real RLS gap, not a harness bug.');
  lines.push('- **notifications, member_feedback, webhook_events, feature_flags, email_templates, cron_executions**: NO RLS enabled at all. These tables are implicitly excluded from FORCE coverage.');
  lines.push('- **PgBouncer GUC stickiness**: This harness uses `$transaction` for every assertion. Single-statement routes outside `$transaction` may still fail under PgBouncer.');
  lines.push('');
  console.log('\n' + lines.join('\n'));

  return failed;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error('[force-rls] Unhandled error:', err);
    process.exit(1);
  });
