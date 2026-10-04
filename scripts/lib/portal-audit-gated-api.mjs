/**
 * Expected gated two-stage billing API responses.
 *
 * `lib/billing/twoStage/api/gates.ts` closes every two-stage J5/J6 billing
 * route with HTTP 503 and a JSON `code` until the environment opts in (for
 * example `BILLING_TWO_STAGE_MIGRATION_APPLIED=true`). That is a recorded
 * engineering decision (`docs/BILLING-PACKETS.md`, "release gates"), pinned by
 * `tests/api/billing-two-stage-routes.spec.ts`, and the admin billing page
 * deliberately renders a gated state for it.
 *
 * The portal audit must not read that designed answer as a broken route, and
 * must not start tolerating 503s in general. The exemption therefore requires
 * all three of: the two-stage billing API path, status exactly 503, and a JSON
 * body whose `code` is an allowlisted gate code.
 *
 * The allowlist is duplicated here as plain data because the audit scripts are
 * ESM `.mjs` and cannot import the TypeScript source of truth. The split is
 * kept honest by `tests/portal-audit-gated-api.test.ts`, which imports
 * `GATE_CODES` from `lib/billing/twoStage/dto.ts` and fails when a new gate
 * code is added upstream without being classified here.
 */

/** The only status a closed gate answers with (`throwIfClosed`). */
export const GATED_API_STATUS = 503;

/**
 * Gate codes that mean "this environment has not switched the feature on".
 * A gated environment is the expected state of every audited preview, so these
 * are not route failures.
 */
export const EXPECTED_GATE_CODES = Object.freeze([
  'MIGRATION_NOT_APPLIED',
  'SIGNER_NOT_CONFIGURED',
  'SIGNED_RENDERER_UNAVAILABLE',
  'SIGNER_PRINCIPAL_UNSET',
  'EMAIL_NOT_ENABLED',
]);

/**
 * Gate codes that stay audit failures. Both report a dependency that the
 * environment was meant to have: a misconfigured provider organization id, and
 * a finance archive bucket that failed its preflight. Treating either as
 * "expected" would let a real misconfiguration ship green.
 */
export const AUDITED_GATE_CODES = Object.freeze(['PROVIDER_ORG_MISCONFIGURED', 'FINANCE_ARCHIVE_UNAVAILABLE']);

const EXPECTED_GATE_CODE_SET = new Set(EXPECTED_GATE_CODES);

/** `/api/admin/members/{id}/billing/two-stage/**` — the gated API, nothing else. */
const GATED_API_PATHNAME = /^\/api\/admin\/members\/[^/]+\/billing\/two-stage(?:\/|$)/;

/** True for a two-stage billing API pathname. */
export function isGatedTwoStageBillingApiPath(pathname) {
  return typeof pathname === 'string' && GATED_API_PATHNAME.test(pathname);
}

/**
 * True when this response is worth reading a body for: a 503 on the gated API
 * path. Unparseable URLs are not candidates, so they keep the existing
 * `>= 400` handling.
 */
export function isGatedApiResponseCandidate({ status, url }) {
  if (status !== GATED_API_STATUS) return false;
  try {
    return isGatedTwoStageBillingApiPath(new URL(url).pathname);
  } catch {
    return false;
  }
}

/**
 * True when a candidate's body is a JSON object carrying an allowlisted gate
 * code. A body that is missing, unreadable, not JSON, or carries any other
 * code is not expected.
 */
export function isExpectedGatedApiBody(body) {
  if (typeof body !== 'string' || body.length === 0) return false;
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    return false;
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return false;
  return typeof parsed.code === 'string' && EXPECTED_GATE_CODE_SET.has(parsed.code);
}

/** Whole decision for a same-origin data response whose body has been read. */
export function isExpectedGatedApiResponse({ status, url, body }) {
  return isGatedApiResponseCandidate({ status, url }) && isExpectedGatedApiBody(body);
}

/** Chromium's resource diagnostic, never an application's general 503 message. */
export function isGatedApiResourceConsoleError({ text, url, argumentCount }) {
  return argumentCount === 0 && typeof text === 'string' &&
    /^Failed to load resource: the server responded with a status of 503 \((?:Service Unavailable)?\)$/.test(text) &&
    isGatedApiResponseCandidate({ status: GATED_API_STATUS, url });
}

/**
 * Correlate before redaction/deduplication. URLs live only in memory, and an
 * expected response can excuse at most one matching native resource message.
 * Mixed, unreadable or still-pending 503 bodies at that exact URL stay strict.
 */
export function applicationConsoleErrors(diagnostics, responsesByUrl) {
  const consumed = new Map();
  return diagnostics.filter((diagnostic) => {
    const response = responsesByUrl.get(diagnostic.url);
    const used = consumed.get(diagnostic.url) ?? 0;
    if (isGatedApiResourceConsoleError(diagnostic) && response &&
        response.failed === 0 && response.pending === 0 && used < response.expected) {
      consumed.set(diagnostic.url, used + 1);
      return false;
    }
    return true;
  }).map(({ text }) => text);
}
