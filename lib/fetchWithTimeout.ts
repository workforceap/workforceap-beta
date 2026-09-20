/**
 * Fetch with automatic timeout via AbortController.
 * Default timeout: 30s (suitable for most API calls).
 * Auth-critical calls: 15s.
 *
 * A caller's own `init.signal` is honoured alongside the timeout: aborting it
 * (an effect cleanup on unmount or re-render) aborts the request with that
 * signal's reason, so components can tell a cancellation from a timeout.
 */
export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = 30000,
): Promise<Response> {
  const controller = new AbortController();
  const external = init.signal ?? null;
  const forwardAbort = () => controller.abort(external?.reason);
  if (external?.aborted) forwardAbort();
  else external?.addEventListener('abort', forwardAbort, { once: true });
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(input, { ...init, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(id);
    external?.removeEventListener('abort', forwardAbort);
  }
}

/**
 * Shorthand for auth-critical fetches that should fail fast
 * rather than leave the user staring at a spinner.
 */
export async function fetchAuth(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  return fetchWithTimeout(input, init, 15000);
}

/**
 * Extract a user-friendly error message from a fetch Response.
 * Handles 429 rate-limit with optional Retry-After hint.
 */
export async function getErrorMessageFromResponse(res: Response): Promise<string> {
  if (res.status === 429) {
    const retryAfter = res.headers.get('Retry-After');
    if (retryAfter) {
      const seconds = parseInt(retryAfter, 10);
      if (!Number.isNaN(seconds) && seconds > 0) {
        return `Too many requests — please wait ${seconds} second${seconds === 1 ? '' : 's'} and try again.`;
      }
    }
    return 'Too many requests — please wait a moment and try again.';
  }

  // Try to read structured error from JSON body
  try {
    const data = await res.json();
    if (data?.error?.message) return data.error.message;
    if (typeof data?.error === 'string') return data.error;
    if (typeof data?.message === 'string') return data.message;
  } catch {
    // ignore parse failure
  }

  // Fallback to status text
  return res.statusText || `Request failed (${res.status})`;
}
