/**
 * Health gate for the trusted authenticated portal audit.
 *
 * Before `.github/workflows/authenticated-portal-smoke.yml` signs in with five
 * dedicated identities it must prove two things about the deployment it is
 * about to drive:
 *
 *   1. the target serves the exact commit the workflow checked out
 *      (`/api/health` → `version` is a prefix of the trusted SHA), and
 *   2. both its public Auth URL and runtime Prisma datasource identify the
 *      Supabase project its policy allows — DEMO for `isolated_preview`, real
 *      for `production_canary` (`/api/health` → `supabaseRef`, `prismaProject`).
 *
 * The previous gate was a bare `curl --fail`, which turned every failure into
 * "404" with no way to tell a stale deployment from a typo. This module keeps
 * the decisions pure so they can be unit-tested, and never puts the target
 * origin into its log output (the isolated preview origin is a secret).
 */
import guard from './supabase-project-guard.cjs';
import {
  formatPortalAuditTargetErrors,
  normalizePortalAuditMode,
  validatePortalAuditTarget,
} from './portal-audit-target.mjs';

const { DEMO_REF, PROD_REF } = guard;

export const HEALTH_PATH = '/api/health';
export const DEFAULT_HEALTH_GATE_TIMEOUT_MS = 10 * 60 * 1000;
export const DEFAULT_HEALTH_GATE_INTERVAL_MS = 15 * 1000;
export const HEALTH_REQUEST_TIMEOUT_MS = 15 * 1000;
export const MIN_VERSION_LENGTH = 7;

/**
 * Secrets pasted from a dashboard routinely carry a trailing newline or slash.
 * Strip CR/LF, surrounding whitespace and trailing slashes; everything else is
 * left for URL validation to judge.
 */
export function normalizeOriginInput(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\r\n]+/g, '').trim().replace(/\/+$/, '');
}

/** The only Supabase project each trusted audit policy may touch. */
export function expectedSupabaseRefForMode(mode) {
  const normalized = normalizePortalAuditMode(mode);
  if (normalized === 'isolated_preview') return DEMO_REF;
  if (normalized === 'production_canary') return PROD_REF;
  return null;
}

/**
 * Resolve the origin the gate will probe, applying the same target policy as
 * the audit runner itself (`validatePortalAuditTarget`) after normalizing the
 * pasted inputs.
 */
export function resolveHealthGateTarget({ mode, baseURL, trustedPreviewOrigin = '' }) {
  return validatePortalAuditTarget({
    mode,
    baseURL: normalizeOriginInput(baseURL),
    trustedPreviewOrigin: normalizeOriginInput(trustedPreviewOrigin),
  });
}

/** Accept a full 40-hex commit SHA only; anything else cannot anchor the gate. */
export function normalizeTrustedSha(value) {
  const sha = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return /^[0-9a-f]{40}$/.test(sha) ? sha : null;
}

function failure(reason, extra = {}) {
  return { ok: false, reason, ...extra };
}

/**
 * Judge one `/api/health` response.
 *
 * `retryable` says whether waiting could change the answer: a preview that is
 * still building answers 404 or with the previous commit, so those retry; a
 * target wired to the wrong Supabase project never becomes right by waiting.
 *
 * `trustedSha` may be null only for the `local` policy, where there is no
 * trusted checkout to compare against.
 */
export function evaluateHealthPayload({ status, body, trustedSha, mode }) {
  if (status >= 300 && status < 400) {
    return failure('redirected', { status, retryable: false });
  }
  if (status !== 200) {
    return failure(`http_${status}`, { status, retryable: true });
  }

  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    return failure('invalid_json', { status, retryable: true });
  }
  if (!payload || typeof payload !== 'object') {
    return failure('invalid_json', { status, retryable: true });
  }

  const version = typeof payload.version === 'string' ? payload.version.trim() : '';
  if (trustedSha) {
    if (!version) {
      return failure('version_missing', { status, retryable: true });
    }
    if (version.length < MIN_VERSION_LENGTH) {
      return failure('version_too_short', { status, version, retryable: true });
    }
    if (!trustedSha.startsWith(version.toLowerCase())) {
      return failure('version_mismatch', {
        status,
        version,
        trustedVersion: trustedSha.slice(0, version.length),
        retryable: true,
      });
    }
  }

  const expectedRef = expectedSupabaseRefForMode(mode);
  const supabaseRef =
    typeof payload.supabaseRef === 'string' ? payload.supabaseRef.trim().toLowerCase() : '';
  const prismaProject =
    typeof payload.prismaProject === 'string' ? payload.prismaProject.trim().toLowerCase() : '';
  if (expectedRef) {
    if (!supabaseRef) {
      // The version already matches, so waiting will not add the field.
      return failure('supabase_ref_missing', { status, version, retryable: false });
    }
    if (supabaseRef !== expectedRef) {
      return failure('supabase_ref_mismatch', {
        status,
        version,
        supabaseRef,
        expectedRef,
        retryable: false,
      });
    }
    const expectedPrismaProject = expectedRef === DEMO_REF ? 'demo' : 'prod';
    if (!prismaProject) {
      return failure('prisma_project_missing', { status, version, retryable: false });
    }
    if (prismaProject !== expectedPrismaProject) {
      return failure('prisma_project_mismatch', {
        status,
        version,
        prismaProject,
        expectedPrismaProject,
        retryable: false,
      });
    }
  }

  return {
    ok: true,
    status,
    version: version || null,
    supabaseRef: supabaseRef || null,
    prismaProject: prismaProject || null,
  };
}

function vercelDiagnostics(headers) {
  const get = (name) => (headers && typeof headers.get === 'function' ? headers.get(name) : null);
  const diagnostics = {};
  for (const [key, header] of [
    ['vercelId', 'x-vercel-id'],
    ['vercelError', 'x-vercel-error'],
    ['matchedPath', 'x-matched-path'],
  ]) {
    const value = get(header);
    if (value) diagnostics[key] = value;
  }
  return diagnostics;
}

/** One log line per attempt. Never includes the origin. */
export function formatHealthGateAttempt(attempt, outcome) {
  const parts = [`[health-gate] attempt ${attempt}:`];
  if (outcome.ok) {
    parts.push(
      `ok (version ${outcome.version ?? 'n/a'}, supabaseRef ${outcome.supabaseRef ?? 'n/a'}, ` +
        `prismaProject ${outcome.prismaProject ?? 'n/a'})`,
    );
  } else {
    parts.push(outcome.reason);
    if (outcome.reason === 'version_mismatch') {
      parts.push(`(target ${outcome.version}, trusted ${outcome.trustedVersion})`);
    } else if (outcome.reason === 'supabase_ref_mismatch') {
      parts.push(`(target ${outcome.supabaseRef}, expected ${outcome.expectedRef})`);
    } else if (outcome.reason === 'prisma_project_mismatch') {
      parts.push(`(target ${outcome.prismaProject}, expected ${outcome.expectedPrismaProject})`);
    } else if (outcome.reason === 'fetch_failed' && outcome.detail) {
      parts.push(`(${outcome.detail})`);
    }
  }
  for (const [key, label] of [
    ['vercelId', 'x-vercel-id'],
    ['vercelError', 'x-vercel-error'],
    ['matchedPath', 'x-matched-path'],
  ]) {
    if (outcome[key]) parts.push(`${label}=${outcome[key]}`);
  }
  return parts.join(' ');
}

/** Human-readable verdict for the final outcome. Never includes the origin. */
export function describeHealthGateFailure(outcome) {
  const suffix = outcome.timedOut ? ' (gave up after the polling window)' : '';
  switch (outcome.reason) {
    case 'version_mismatch':
      return (
        `target serves ${outcome.version} but the trusted checkout is ${outcome.trustedVersion}` +
        `${suffix}; is the preview mirror deployed for this commit?`
      );
    case 'supabase_ref_mismatch':
      return (
        `target is wired to Supabase project ${outcome.supabaseRef}, policy requires ${outcome.expectedRef}` +
        '; refusing to sign in against the wrong database (docs/STAGING_ENV.md)'
      );
    case 'supabase_ref_missing':
      return (
        'target serves the trusted commit but its /api/health has no supabaseRef field' +
        '; the deployment predates the health contract the gate relies on'
      );
    case 'prisma_project_missing':
      return 'target serves the trusted commit but /api/health has no Prisma project attestation';
    case 'prisma_project_mismatch':
      return (
        `target server Prisma datasource is ${outcome.prismaProject}, policy requires ${outcome.expectedPrismaProject}` +
        '; refusing to sign in against an unverified database (docs/STAGING_ENV.md)'
      );
    case 'redirected':
      return `target redirected (HTTP ${outcome.status}); the audit origin must answer /api/health directly`;
    case 'fetch_failed':
      return `could not reach /api/health (${outcome.detail ?? 'network error'})${suffix}`;
    default:
      if (typeof outcome.reason === 'string' && outcome.reason.startsWith('http_')) {
        const hint =
          outcome.vercelError === 'DEPLOYMENT_NOT_FOUND'
            ? '; Vercel reports DEPLOYMENT_NOT_FOUND — the origin points at a deleted or never-deployed target'
            : '';
        return `/api/health answered HTTP ${outcome.status}${hint}${suffix}`;
      }
      return `/api/health failed the gate: ${outcome.reason}${suffix}`;
  }
}

/**
 * Poll `/api/health` on `origin` until it passes `evaluateHealthPayload`, a
 * terminal failure is seen, or `timeoutMs` elapses. Dependencies are
 * injectable so the loop is testable without a network or real clock.
 */
export async function waitForTrustedHealth({
  origin,
  trustedSha,
  mode,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_HEALTH_GATE_TIMEOUT_MS,
  intervalMs = DEFAULT_HEALTH_GATE_INTERVAL_MS,
  requestTimeoutMs = HEALTH_REQUEST_TIMEOUT_MS,
  now = () => Date.now(),
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  log = (line) => console.log(line),
}) {
  if (typeof fetchImpl !== 'function') {
    throw new TypeError('waitForTrustedHealth requires a fetch implementation');
  }
  const deadline = now() + Math.max(0, timeoutMs);
  let attempt = 0;

  for (;;) {
    attempt += 1;
    let outcome;
    try {
      const response = await fetchImpl(`${origin}${HEALTH_PATH}`, {
        method: 'GET',
        redirect: 'manual',
        headers: { accept: 'application/json', 'cache-control': 'no-cache' },
        signal:
          typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
            ? AbortSignal.timeout(requestTimeoutMs)
            : undefined,
      });
      const body = await response.text();
      outcome = {
        ...evaluateHealthPayload({ status: response.status, body, trustedSha, mode }),
        ...vercelDiagnostics(response.headers),
      };
    } catch (error) {
      outcome = failure('fetch_failed', {
        retryable: true,
        detail: error && typeof error === 'object' && 'name' in error ? String(error.name) : 'Error',
      });
    }

    log(formatHealthGateAttempt(attempt, outcome));

    if (outcome.ok || !outcome.retryable) {
      return { ...outcome, attempts: attempt, timedOut: false };
    }
    const remaining = deadline - now();
    if (remaining <= 0) {
      return { ...outcome, attempts: attempt, timedOut: true };
    }
    await sleep(Math.min(intervalMs, remaining));
  }
}

export { formatPortalAuditTargetErrors };
