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
 * Vercel builds always report the runtime port/Prisma pool params (never the
 * URL) so a deploy can be verified from its build log. Optional
 * --check-pool-contract additionally *enforces* them. Enforcement is not in
 * the default build: verify the reported parameters first. Note that the flag
 * also disables the CI short-circuit below, so it must never be added to a
 * build command that GitHub Actions runs against stub URLs.
 * Exit 0 = ok, 1 = misconfigured (block the deploy).
 */

import guard from './lib/supabase-project-guard.cjs';
import poolContract from './lib/runtime-pool-contract.cjs';

// Opt-in until deployed runtime parameters have been verified. Never rewrites URLs.
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

// Report on every Vercel build so a deploy's actual parameters are visible
// before enforcement is turned on; only --check-pool-contract can block.
if (checkPoolContract || process.env.VERCEL === '1') {
  const pool = poolContract.inspectRuntimePoolContract(process.env.POSTGRES_PRISMA_URL);
  console.log('[supabase-env-guard] runtime pool parameters:', pool.parameters);
  if (checkPoolContract) errors.push(...pool.errors.map((message) => `  - ${message}`));
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
