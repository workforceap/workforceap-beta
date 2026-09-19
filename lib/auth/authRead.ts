/** Shared by Edge middleware and Node auth reads; no Node-only imports. */
export type AuthReadFailure = 'stale_session' | 'transient' | 'unexpected';
const STALE_SESSION_CODES = new Set([
  'refresh_token_not_found', 'refresh_token_already_used', 'session_not_found',
  'session_expired', 'bad_jwt', 'user_not_found',
]);
const NETWORK_CODES = new Set(['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EAI_AGAIN']);
export const AUTH_READ_RETRY_DELAY_MS = 300;

export function classifyAuthReadFailure(error: unknown): AuthReadFailure {
  if (!error || typeof error !== 'object') return 'unexpected';
  const value = error as { name?: unknown; code?: unknown; status?: unknown; message?: unknown; cause?: unknown };
  if (value.name === 'AuthSessionMissingError' ||
      (typeof value.code === 'string' && STALE_SESSION_CODES.has(value.code)) ||
      (value.name === 'AuthApiError' && value.message === 'Invalid Refresh Token: Refresh Token Not Found')) {
    return 'stale_session';
  }
  if (typeof value.status === 'number' && value.status >= 500 && value.status <= 599) return 'transient';
  if (value.name === 'AuthRetryableFetchError' && (value.status === 0 || value.status === undefined)) return 'transient';
  if (value.name === 'TypeError' && typeof value.message === 'string' && /^(fetch failed|failed to fetch|networkerror when attempting to fetch resource\.?)$/i.test(value.message)) return 'transient';
  if (typeof value.code === 'string' && NETWORK_CODES.has(value.code)) return 'transient';
  if (value.cause && typeof value.cause === 'object') {
    const code = (value.cause as { code?: unknown }).code;
    if (typeof code === 'string' && NETWORK_CODES.has(code)) return 'transient';
  }
  return 'unexpected';
}

/**
 * At most one additional auth-read call and 300ms additional backoff.
 * This is not a deadline: auth-js can retry token refresh internally for a
 * 30-second backoff window, and its underlying request has its own latency.
 * Never race an uncancelled refresh against a timeout and lose rotated cookies.
 */
export async function readAuthWithRetry<T extends { error?: unknown }>(
  read: () => Promise<T>,
): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      const result = await read();
      if (!result.error || attempt === 1 || classifyAuthReadFailure(result.error) !== 'transient') return result;
    } catch (error) {
      if (attempt === 1 || classifyAuthReadFailure(error) !== 'transient') throw error;
    }
    await new Promise<void>((resolve) => setTimeout(resolve, AUTH_READ_RETRY_DELAY_MS));
  }
}

/** Keep expected session expiry out of error logs, without logging cookie/token data. */
export function reportAuthReadFailure(error: unknown, context: string): AuthReadFailure {
  const kind = classifyAuthReadFailure(error);
  if (kind === 'stale_session') console.info(`[${context}] Session is no longer valid`);
  else console.error(`[${context}] Authentication read failed`, { kind });
  return kind;
}
