/**
 * Pre-login guard for the Portal C signed-in preview job.
 *
 * Proves two facts before any member credential is sent:
 *   1. `/api/health` `version` is a prefix of the PR/deploy SHA under test
 *   2. the deployment is wired to DEMO Supabase (`esbdrgaonplpvzmtrdhw`)
 *
 * Never logs the target origin, bypass secret, or member credentials.
 */
import { isVercelDeploymentOrigin } from './preview-smoke.mjs';
import {
  DEFAULT_HEALTH_GATE_INTERVAL_MS,
  DEFAULT_HEALTH_GATE_TIMEOUT_MS,
  describeHealthGateFailure,
  normalizeTrustedSha,
  waitForTrustedHealth,
} from './portal-audit-health-gate.mjs';
import {
  describeVercelProvenanceFailure,
  parseHttpsOrigin,
  runVercelProvenanceGuard,
} from './portal-c-vercel-provenance.mjs';

export const DEMO_SUPABASE_REF = 'esbdrgaonplpvzmtrdhw';
export const PORTAL_C_SIGNED_IN_MODE = 'isolated_preview';

export function normalizeOrigin(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\r\n]+/g, '').trim().replace(/\/+$/, '');
}

/** Extra headers for the health probe. The bypass secret only goes to *.vercel.app. */
export function healthGateHeaders({ origin, bypassSecret }) {
  const headers = {
    accept: 'application/json',
    'cache-control': 'no-cache',
  };
  const secret = typeof bypassSecret === 'string' ? bypassSecret.trim() : '';
  if (secret && isVercelDeploymentOrigin(origin)) {
    headers['x-vercel-protection-bypass'] = secret;
  }
  return headers;
}

export function createHealthGateFetch({ origin, bypassSecret, fetchImpl = globalThis.fetch }) {
  const extra = healthGateHeaders({ origin, bypassSecret });
  return (url, init = {}) => {
    const headers = { ...(init.headers ?? {}), ...extra };
    return fetchImpl(url, { ...init, headers });
  };
}

export function resolveTrustedSha(env = process.env) {
  return normalizeTrustedSha(
    env.PORTAL_C_TRUSTED_SHA ?? env.DEPLOY_SHA ?? env.GITHUB_SHA ?? '',
  );
}

export function resolveTargetOrigin(env = process.env) {
  return normalizeOrigin(env.PLAYWRIGHT_BASE_URL ?? env.PORTAL_AUDIT_TARGET_ORIGIN ?? '');
}

export function resolveTrustedBranch(env = process.env) {
  const branch =
    env.PORTAL_C_TRUSTED_BRANCH ??
    env.GITHUB_HEAD_REF ??
    env.GITHUB_REF_NAME ??
    '';
  return typeof branch === 'string' ? branch.trim() : '';
}

export function describeGuardConfigError(kind) {
  switch (kind) {
    case 'missing_sha':
      return 'PORTAL_C_TRUSTED_SHA (or DEPLOY_SHA / GITHUB_SHA) must be the full 40-hex commit the preview is expected to serve.';
    case 'missing_origin':
      return 'PLAYWRIGHT_BASE_URL must be the preview origin to probe.';
    default: {
      const _exhaustive = kind;
      return `guard configuration rejected (${_exhaustive})`;
    }
  }
}

export async function runSignedInHealthGuard({
  origin,
  trustedSha,
  bypassSecret = '',
  timeoutMs = DEFAULT_HEALTH_GATE_TIMEOUT_MS,
  intervalMs = DEFAULT_HEALTH_GATE_INTERVAL_MS,
  fetchImpl = globalThis.fetch,
  log = (line) => console.log(line),
}) {
  return waitForTrustedHealth({
    origin,
    trustedSha,
    mode: PORTAL_C_SIGNED_IN_MODE,
    timeoutMs,
    intervalMs,
    fetchImpl: createHealthGateFetch({ origin, bypassSecret, fetchImpl }),
    log,
  });
}

export async function runSignedInDestinationGuard({
  origin,
  trustedSha,
  trustedBranch,
  vercelToken = '',
  bypassSecret = '',
  timeoutMs = DEFAULT_HEALTH_GATE_TIMEOUT_MS,
  intervalMs = DEFAULT_HEALTH_GATE_INTERVAL_MS,
  fetchImpl = globalThis.fetch,
  log = (line) => console.log(line),
}) {
  const https = parseHttpsOrigin(origin);
  if (!https.ok) {
    return { ok: false, stage: 'origin', ...https };
  }
  if (!trustedBranch) {
    return { ok: false, stage: 'config', reason: 'missing_branch' };
  }
  const vercel = await runVercelProvenanceGuard({
    origin,
    trustedSha,
    trustedBranch,
    vercelToken,
    fetchImpl,
  });
  if (!vercel.ok) {
    return { ok: false, stage: 'vercel', ...vercel };
  }
  const health = await runSignedInHealthGuard({
    origin,
    trustedSha,
    bypassSecret,
    timeoutMs,
    intervalMs,
    fetchImpl,
    log,
  });
  if (!health.ok) {
    return { ok: false, stage: 'health', ...health };
  }
  return { ok: true, stage: 'complete', vercel, health };
}

export function describeDestinationGuardFailure(outcome) {
  if (outcome.stage === 'origin' || outcome.stage === 'vercel') {
    return describeVercelProvenanceFailure(outcome);
  }
  if (outcome.stage === 'config' && outcome.reason === 'missing_branch') {
    return 'PORTAL_C_TRUSTED_BRANCH (or GITHUB_HEAD_REF) must name the PR head branch.';
  }
  return describeHealthGateFailure(outcome);
}

export { describeHealthGateFailure, describeVercelProvenanceFailure, parseHttpsOrigin };
