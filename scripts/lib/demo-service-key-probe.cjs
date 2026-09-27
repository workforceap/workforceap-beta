/**
 * One bounded, read-only check that a Supabase service key is valid for the
 * DEMO project, before the Resume Build DEMO acceptance lane makes any Auth
 * write. Used by scripts/check-preview-service-key.mjs (the master-only
 * Preview Service Key Check workflow) and by scripts/resume-demo-member.ts
 * `create`.
 *
 * - The configured Auth URL must be exactly the canonical DEMO origin
 *   (https://<DEMO_REF>.supabase.co) and classify as demo in the shared guard;
 *   otherwise nothing is sent.
 * - The request goes to the HARDCODED DEMO origin, never to the configured
 *   value: GET /auth/v1/admin/users?page=1&per_page=1 with the key in the
 *   apikey and Authorization headers. No retries, no redirects followed, a
 *   short timeout.
 * - The response body is never read; only the status maps to a fixed
 *   category. Errors are never surfaced. The key is never returned or logged.
 *
 * Limit: the headers mirror what the harness's supabase-js admin client sends
 * (apikey + Authorization: Bearer <key>), so a 200 proves DEMO Auth admin READ
 * authorization with the same headers the real run uses. It does NOT prove a
 * later createUser write will succeed. For a new `sb_secret_` key, the
 * Bearer behaviour is whatever the gateway does for supabase-js too, so a
 * refusal shows up here as `rejected`, before any write. A `rejected` is
 * therefore a real harness blocker, but on its own it does not prove the key
 * is invalid: Supabase documents `sb_secret_` keys as non-JWTs meant for the
 * `apikey` header only.
 *
 * `keyFormat` is a local shape category (`modern-secret` / `legacy-jwt` /
 * `unknown`); nothing is decoded and no part of the key is reported.
 *
 * `diagnoseDemoServiceKeyHeaders` (used only by the read-only
 * check-preview-service-key.mjs) runs the same gate request and then ONE more
 * GET to the same hardcoded endpoint with the key in `apikey` only, reporting
 * both fixed categories. The gate stays the both-header result: an apikey-only
 * `valid` never makes the key pass. If both-header is `rejected` while
 * apikey-only is `valid`, the fix is the harness's client headers together
 * with this probe, before any Auth write; not rotating the key.
 */
const { DEMO_REF, projectForUrl } = require('./supabase-project-guard.cjs');

const DEMO_ORIGIN = `https://${DEMO_REF}.supabase.co`;
const PROBE_PATH = '/auth/v1/admin/users?page=1&per_page=1';
const DEFAULT_TIMEOUT_MS = 10_000;

const MODERN_SECRET = /^sb_secret_[A-Za-z0-9_-]+$/;
const LEGACY_JWT = /^eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

/**
 * Shape category only; the key is never decoded, sliced or measured.
 * @param {unknown} key
 * @returns {'modern-secret' | 'legacy-jwt' | 'unknown'}
 */
function keyFormatOf(key) {
  if (typeof key !== 'string') return 'unknown';
  if (MODERN_SECRET.test(key)) return 'modern-secret';
  if (LEGACY_JWT.test(key)) return 'legacy-jwt';
  return 'unknown';
}

/**
 * ONE GET to the hardcoded DEMO endpoint; the body is discarded unread and
 * only the status maps to a fixed category.
 * @param {Record<string, string>} headers
 * @param {typeof fetch} fetchImpl
 * @param {number} timeoutMs
 * @returns {Promise<'valid' | 'rejected' | 'unavailable'>}
 */
async function sendProbe(headers, fetchImpl, timeoutMs) {
  let response;
  try {
    response = await fetchImpl(`${DEMO_ORIGIN}${PROBE_PATH}`, {
      method: 'GET',
      headers,
      redirect: 'manual',
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    return 'unavailable';
  }
  // Discard the body unread: no user data and no error bodies.
  try {
    await response?.body?.cancel?.();
  } catch {
    // Nothing to report; the status alone decides.
  }
  const status = response?.status;
  if (status === 200) return 'valid';
  if (status === 401 || status === 403) return 'rejected';
  return 'unavailable';
}

/**
 * Fixed labels only: { urlProject, key, keyFormat }. `key` is valid only for
 * HTTP 200 to the both-header request (apikey + Authorization: Bearer), which
 * is what the harness's supabase-js client sends; this is the gate.
 * @param {{ url?: string, key?: string, fetchImpl?: typeof fetch, timeoutMs?: number }} [options]
 * @returns {Promise<{ urlProject: string, key: 'valid' | 'rejected' | 'unavailable' | 'not-checked' | 'missing' | 'invalid', keyFormat: 'modern-secret' | 'legacy-jwt' | 'unknown' }>}
 */
async function probeDemoServiceKey({ url, key, fetchImpl = globalThis.fetch, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const keyFormat = keyFormatOf(key);
  const urlValue = typeof url === 'string' ? url : '';
  const urlProject = projectForUrl(urlValue, 'public');
  const canonical = urlValue.replace(/\/$/, '') === DEMO_ORIGIN;
  if (urlProject !== 'demo' || !canonical) {
    return { urlProject: urlProject === 'demo' ? 'demo-noncanonical' : urlProject, key: 'not-checked', keyFormat };
  }
  if (typeof key !== 'string' || key.length === 0) return { urlProject, key: 'missing', keyFormat };
  // A header value must be printable ASCII; anything else is refused locally.
  if (!/^[\x21-\x7e]+$/.test(key)) return { urlProject, key: 'invalid', keyFormat };

  const result = await sendProbe({ apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' }, fetchImpl, timeoutMs);
  return { urlProject, key: result, keyFormat };
}

const SENT = new Set(['valid', 'rejected', 'unavailable']);

/**
 * Read-only diagnosis for the Preview Service Key Check: the gate request of
 * probeDemoServiceKey (both headers), then, only if that request was sent,
 * ONE more GET to the same hardcoded endpoint with `apikey` only. `key` and
 * `bothHeaders` are the same gate result; `apikeyOnly` is informational and
 * never makes the key pass.
 * @param {{ url?: string, key?: string, fetchImpl?: typeof fetch, timeoutMs?: number }} [options]
 * @returns {Promise<{ urlProject: string, key: string, keyFormat: 'modern-secret' | 'legacy-jwt' | 'unknown', bothHeaders: 'valid' | 'rejected' | 'unavailable' | 'not-checked', apikeyOnly: 'valid' | 'rejected' | 'unavailable' | 'not-checked' }>}
 */
async function diagnoseDemoServiceKeyHeaders({ url, key, fetchImpl = globalThis.fetch, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const gate = await probeDemoServiceKey({ url, key, fetchImpl, timeoutMs });
  if (!SENT.has(gate.key) || typeof key !== 'string') {
    return { ...gate, bothHeaders: 'not-checked', apikeyOnly: 'not-checked' };
  }
  const bothHeaders = /** @type {'valid' | 'rejected' | 'unavailable'} */ (gate.key);
  const apikeyOnly = await sendProbe({ apikey: key, Accept: 'application/json' }, fetchImpl, timeoutMs);
  return { ...gate, bothHeaders, apikeyOnly };
}

module.exports = { DEMO_ORIGIN, PROBE_PATH, diagnoseDemoServiceKeyHeaders, keyFormatOf, probeDemoServiceKey };
