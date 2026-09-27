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
 */
const { DEMO_REF, projectForUrl } = require('./supabase-project-guard.cjs');

const DEMO_ORIGIN = `https://${DEMO_REF}.supabase.co`;
const PROBE_PATH = '/auth/v1/admin/users?page=1&per_page=1';
const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Fixed labels only: { urlProject, key }. `key` is valid only for HTTP 200.
 * @param {{ url?: string, key?: string, fetchImpl?: typeof fetch, timeoutMs?: number }} [options]
 * @returns {Promise<{ urlProject: string, key: 'valid' | 'rejected' | 'unavailable' | 'not-checked' | 'missing' | 'invalid' }>}
 */
async function probeDemoServiceKey({ url, key, fetchImpl = globalThis.fetch, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const urlValue = typeof url === 'string' ? url : '';
  const urlProject = projectForUrl(urlValue, 'public');
  const canonical = urlValue.replace(/\/$/, '') === DEMO_ORIGIN;
  if (urlProject !== 'demo' || !canonical) {
    return { urlProject: urlProject === 'demo' ? 'demo-noncanonical' : urlProject, key: 'not-checked' };
  }
  if (typeof key !== 'string' || key.length === 0) return { urlProject, key: 'missing' };
  // A header value must be printable ASCII; anything else is refused locally.
  if (!/^[\x21-\x7e]+$/.test(key)) return { urlProject, key: 'invalid' };

  let response;
  try {
    response = await fetchImpl(`${DEMO_ORIGIN}${PROBE_PATH}`, {
      method: 'GET',
      headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' },
      redirect: 'manual',
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    return { urlProject, key: 'unavailable' };
  }
  // Discard the body unread: no user data and no error bodies.
  try {
    await response?.body?.cancel?.();
  } catch {
    // Nothing to report; the status alone decides.
  }
  const status = response?.status;
  if (status === 200) return { urlProject, key: 'valid' };
  if (status === 401 || status === 403) return { urlProject, key: 'rejected' };
  return { urlProject, key: 'unavailable' };
}

module.exports = { DEMO_ORIGIN, PROBE_PATH, probeDemoServiceKey };
