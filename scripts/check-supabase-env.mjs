#!/usr/bin/env node
/**
 * Supabase env guard — prevents pointing the wrong environment at the wrong DB.
 *
 *   Preview / Development  MUST use the DEMO project (esbdrgaonplpvzmtrdhw)
 *   Production             MUST use the REAL project (jqddnyuszufndwwezdwp)
 *
 * Run in CI / as a predeploy / build step. Reads NEXT_PUBLIC_SUPABASE_URL,
 * NEXT_PUBLIC_SUPABASE_ANON_KEY, and the connection URLs and fails loud if a
 * scope is wired to the wrong project or auth is missing the public anon key.
 *
 * The runtime port / Prisma pool params are checked too, without ever
 * printing the URL. --check-pool-contract forces that check on anywhere.
 * Exit 0 = ok, 1 = misconfigured (block the deploy).
 *
 * WAP-17: GO-LIVE-AND-SCALE-LIST.md:101,146 require the runtime
 * POSTGRES_PRISMA_URL on :6543 with connection_limit=1, but production's own
 * P2024 errors report Prisma's default of 5 — so the runbook and production
 * disagree and nothing in the build noticed. Two changes here:
 *
 *   - Every real Vercel build now REPORTS the non-secret pool parameters
 *     (port, connection_limit, pool_timeout, pgbouncer — never the URL, user,
 *     password or options). That is the evidence the enforcement below was
 *     waiting on, and it is safe: reporting cannot fail a deploy.
 *   - Enforcement per Vercel env is a one-word flip in
 *     POOL_CONTRACT_ENFORCED_VERCEL_ENVS. Production is enforced (see the
 *     note on that constant for the evidence); preview stays report-only
 *     until one preview build has logged on-contract parameters. Never add an
 *     env before its POSTGRES_PRISMA_URL has been seen on-contract in a build
 *     log, or the next deploy is blocked by an env var only an operator can fix.
 */

import guard from './lib/supabase-project-guard.cjs';
import poolContract from './lib/runtime-pool-contract.cjs';

// Never rewrites URLs. Enforced on production since the production
// POSTGRES_PRISMA_URL was brought on-contract (Mike, 2026-09-20 21:57 UTC) and
// the first production build after #2424 — Vercel deployment
// dpl_FmbefGN4GHD8z2qvUEMfRiV5EQmB, commit 87e60a12 — logged, verbatim:
//   [supabase-env-guard] runtime pool parameters: { port: 6543, connectionLimit: 1, poolTimeout: 10, pgbouncer: true }
// with no off-runbook WARNING. Preview stays report-only: the contract wants
// four params (port, connection_limit, pool_timeout, pgbouncer) and the
// runbook shape in docs/HANDOFF.md:40 names three, so nothing yet shows
// preview's URL carries all four. Add 'preview' after one preview build has
// logged the parameters line below and they match (WAP-17).
const POOL_CONTRACT_ENFORCED_VERCEL_ENVS = new Set(['production']);
const checkPoolContract = process.argv.includes('--check-pool-contract');

const {
  DEMO_REF,
  PROD_REF,
  formatSupabaseEnvGuardFailure,
  inspectSupabaseEnvironment,
  projectForAnonKey,
  projectForUrl,
} = guard;

// VERCEL_ENV is 'production' | 'preview' | 'development'. Fall back to NODE_ENV.
// CI uses stub DB URLs, but Vercel also sets CI=1. A real Vercel deployment
// must never bypass this guard before a database-mutating build command.
if (
  !checkPoolContract && process.env.VERCEL !== '1' &&
  (process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true')
) {
  console.log('[supabase-env-guard] CI — skipping project ref check');
  process.exit(0);
}

const env = process.env.VERCEL_ENV || process.env.NODE_ENV || 'development';

const urls = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  POSTGRES_PRISMA_URL: process.env.POSTGRES_PRISMA_URL || '',
  POSTGRES_URL_NON_POOLING: process.env.POSTGRES_URL_NON_POOLING || '',
  DATABASE_URL: process.env.DATABASE_URL || '',
};

const expected = env === 'production' ? 'prod' : 'demo';
const errors = [];
const seen = {};

for (const [name, value] of Object.entries(urls)) {
  const ref = projectForUrl(value, name === 'NEXT_PUBLIC_SUPABASE_URL' ? 'public' : 'database');
  seen[name] = ref;
  if (ref === 'unset' || ref === 'unknown') continue; // don't fail on unset here
  if (ref !== expected) {
    errors.push(
      `  ✗ ${name} points at the ${ref.toUpperCase()} project, but VERCEL_ENV="${env}" must use ${expected.toUpperCase()}.`
    );
  }
}

seen.NEXT_PUBLIC_SUPABASE_ANON_KEY = projectForAnonKey(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

if (process.env.VERCEL === '1') {
  const strict = inspectSupabaseEnvironment(process.env, {
    requireVercel: true,
    requireDirectUrl: true,
  });
  errors.push(...strict.errors.map((message) => `  ✗ ${message}`));
}

const onVercel = process.env.VERCEL === '1';
const enforcePoolContract = checkPoolContract || (onVercel && POOL_CONTRACT_ENFORCED_VERCEL_ENVS.has(env));

if (enforcePoolContract || onVercel) {
  const pool = poolContract.inspectRuntimePoolContract(process.env.POSTGRES_PRISMA_URL);
  console.log('[supabase-env-guard] runtime pool parameters:', pool.parameters);
  if (enforcePoolContract) {
    errors.push(...pool.errors.map((message) => `  - ${message}`));
  } else if (pool.errors.length) {
    // Report-only on production (WAP-17). Loud, because an off-runbook pool is
    // what produced `P2024 ... (pool timeout: 10, connection limit: 5)`.
    console.warn(
      `\n[supabase-env-guard] WARNING — runtime pool contract is off-runbook for VERCEL_ENV="${env}":\n` +
        pool.errors.map((message) => `  - ${message}`).join('\n') +
        '\nSee docs/GO-LIVE-AND-SCALE-LIST.md:101,146. Fix POSTGRES_PRISMA_URL, then add' +
        ` '${env}' to POOL_CONTRACT_ENFORCED_VERCEL_ENVS in this file to make it blocking.\n`,
    );
  }
}

console.log(`[supabase-env-guard] env=${env} expected=${expected} →`, seen);

if (errors.length) {
  const { header, hint } = formatSupabaseEnvGuardFailure(errors, { demo: DEMO_REF, prod: PROD_REF });
  console.error(`\n${header}`);
  console.error(errors.join('\n'));
  console.error(`\n${hint}\n`);
  process.exit(1);
}

console.log('[supabase-env-guard] OK — environment is wired to the correct Supabase project.');
