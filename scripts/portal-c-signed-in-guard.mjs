#!/usr/bin/env node
/**
 * CLI pre-login guard for `.github/workflows/dev-member-safety-net.yml`.
 * Exit 0 only when the preview serves the trusted SHA on DEMO Supabase.
 * Exit 2 for configuration errors; exit 1 when the target fails the gate.
 * Never prints the origin, bypass secret, or member credentials.
 */
import {
  DEFAULT_HEALTH_GATE_INTERVAL_MS,
  DEFAULT_HEALTH_GATE_TIMEOUT_MS,
} from './lib/portal-audit-health-gate.mjs';
import {
  DEMO_SUPABASE_REF,
  describeDestinationGuardFailure,
  describeGuardConfigError,
  resolveTargetOrigin,
  resolveTrustedBranch,
  resolveTrustedSha,
  runSignedInDestinationGuard,
} from './lib/portal-c-signed-in-guard.mjs';

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const trustedSha = resolveTrustedSha(process.env);
if (!trustedSha) {
  console.error(`[signed-in-guard] ${describeGuardConfigError('missing_sha')}`);
  process.exit(2);
}

const origin = resolveTargetOrigin(process.env);
if (!origin) {
  console.error(`[signed-in-guard] ${describeGuardConfigError('missing_origin')}`);
  process.exit(2);
}

const trustedBranch = resolveTrustedBranch(process.env);
if (!trustedBranch) {
  console.error(`[signed-in-guard] ${describeDestinationGuardFailure({ ok: false, stage: 'config', reason: 'missing_branch' })}`);
  process.exit(2);
}

const timeoutMs = positiveInteger(
  process.env.PORTAL_C_HEALTH_TIMEOUT_MS,
  DEFAULT_HEALTH_GATE_TIMEOUT_MS,
);
const intervalMs = positiveInteger(
  process.env.PORTAL_C_HEALTH_INTERVAL_MS,
  DEFAULT_HEALTH_GATE_INTERVAL_MS,
);

console.log(
  `[signed-in-guard] trusted=${trustedSha.slice(0, 7)} expectedSupabase=${DEMO_SUPABASE_REF} ` +
    `window=${timeoutMs}ms interval=${intervalMs}ms`,
);

const outcome = await runSignedInDestinationGuard({
  origin,
  trustedSha,
  trustedBranch,
  vercelToken: process.env.VERCEL_TOKEN ?? '',
  bypassSecret: process.env.VERCEL_AUTOMATION_BYPASS_SECRET ?? '',
  timeoutMs,
  intervalMs,
});

if (outcome.ok) {
  const health = outcome.health;
  console.log(
    `[signed-in-guard] OK — Vercel provenance verified for branch ${trustedBranch}; ` +
      `health serves ${health.version ?? 'n/a'} on Supabase project ` +
      `${health.supabaseRef ?? 'n/a'} with Prisma ${health.prismaProject ?? 'n/a'} ` +
      `after ${health.attempts} attempt(s).`,
  );
  process.exit(0);
}

console.error(`[signed-in-guard] FAILED — ${describeDestinationGuardFailure(outcome)}`);
process.exit(1);
