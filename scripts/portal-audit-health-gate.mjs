#!/usr/bin/env node
/**
 * CLI wrapper around scripts/lib/portal-audit-health-gate.mjs, used by
 * .github/workflows/authenticated-portal-smoke.yml before any credentialed
 * browser step.
 *
 * Environment:
 *   PORTAL_AUDIT_MODE                    local | isolated_preview | production_canary
 *   PORTAL_AUDIT_TARGET_ORIGIN           origin to probe (falls back to PLAYWRIGHT_BASE_URL)
 *   PORTAL_AUDIT_TRUSTED_PREVIEW_ORIGIN  required for isolated_preview; must equal the target
 *   PORTAL_AUDIT_TRUSTED_SHA             full commit SHA the target must serve (falls back to
 *                                        GITHUB_SHA; optional only for the local policy)
 *   PORTAL_AUDIT_HEALTH_TIMEOUT_MS       polling window (default 10 minutes)
 *   PORTAL_AUDIT_HEALTH_INTERVAL_MS      delay between attempts (default 15 seconds)
 *
 * Exit codes: 0 gate passed · 1 gate failed · 2 configuration rejected.
 * The target origin is never written to stdout/stderr.
 */
import {
  DEFAULT_HEALTH_GATE_INTERVAL_MS,
  DEFAULT_HEALTH_GATE_TIMEOUT_MS,
  describeHealthGateFailure,
  formatPortalAuditTargetErrors,
  normalizeTrustedSha,
  resolveHealthGateTarget,
  waitForTrustedHealth,
} from './lib/portal-audit-health-gate.mjs';

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const mode = process.env.PORTAL_AUDIT_MODE ?? '';
const target = resolveHealthGateTarget({
  mode,
  baseURL: process.env.PORTAL_AUDIT_TARGET_ORIGIN ?? process.env.PLAYWRIGHT_BASE_URL ?? '',
  trustedPreviewOrigin: process.env.PORTAL_AUDIT_TRUSTED_PREVIEW_ORIGIN ?? '',
});

if (!target.ok) {
  console.error(formatPortalAuditTargetErrors(target));
  process.exit(2);
}

const trustedSha = normalizeTrustedSha(
  process.env.PORTAL_AUDIT_TRUSTED_SHA ?? process.env.GITHUB_SHA ?? '',
);
if (!trustedSha && target.mode !== 'local') {
  console.error(
    '[health-gate] PORTAL_AUDIT_TRUSTED_SHA (or GITHUB_SHA) must be the full 40-hex commit the target is expected to serve.',
  );
  process.exit(2);
}

const timeoutMs = positiveInteger(
  process.env.PORTAL_AUDIT_HEALTH_TIMEOUT_MS,
  DEFAULT_HEALTH_GATE_TIMEOUT_MS,
);
const intervalMs = positiveInteger(
  process.env.PORTAL_AUDIT_HEALTH_INTERVAL_MS,
  DEFAULT_HEALTH_GATE_INTERVAL_MS,
);

console.log(
  `[health-gate] policy=${target.mode} targetClass=${target.targetClass} ` +
    `trusted=${trustedSha ? trustedSha.slice(0, 7) : 'n/a'} window=${timeoutMs}ms interval=${intervalMs}ms`,
);

const outcome = await waitForTrustedHealth({
  origin: target.origin,
  trustedSha,
  mode: target.mode,
  timeoutMs,
  intervalMs,
});

if (outcome.ok) {
  console.log(
    `[health-gate] OK — target serves ${outcome.version ?? 'n/a'} on Supabase project ` +
      `${outcome.supabaseRef ?? 'n/a'} with Prisma ${outcome.prismaProject ?? 'n/a'} ` +
      `after ${outcome.attempts} attempt(s).`,
  );
  process.exit(0);
}

console.error(`[health-gate] FAILED — ${describeHealthGateFailure(outcome)}`);
process.exit(1);
