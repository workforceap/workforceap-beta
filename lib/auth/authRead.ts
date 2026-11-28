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

/**
 * auth-js logs its own copy of an expired-session refresh failure: every
 * `createServerClient` registers an `onAuthStateChange` listener, and the
 * library's initial-session emission refreshes an expired access token and
 * `console.error`s the AuthApiError when the refresh token is gone (auth-js
 * GoTrueClient `_emitInitialSession`). Our own read of the same failure is
 * already classified and handled as a signed-out visitor, so that duplicate
 * must not reach error logs. Only a lone AuthError argument that classifies
 * as a stale session is downgraded; every other console.error passes through.
 */
export function isSupabaseStaleSessionLog(args: readonly unknown[]): boolean {
  if (args.length !== 1) return false;
  const [value] = args;
  return typeof value === 'object' && value !== null && '__isAuthError' in value
    && classifyAuthReadFailure(value) === 'stale_session';
}

const STALE_SESSION_CONSOLE_FILTER = Symbol.for('wap.auth.staleSessionConsoleFilter');
type FilterableConsole = Pick<Console, 'error' | 'info'> & { [STALE_SESSION_CONSOLE_FILTER]?: true };

/** Idempotent; stateless per call, so concurrent requests in one isolate are unaffected. */
export function installSupabaseStaleSessionConsoleFilter(target: Pick<Console, 'error' | 'info'> = console): void {
  const filterable = target as FilterableConsole;
  if (filterable[STALE_SESSION_CONSOLE_FILTER]) return;
  const original = target.error;
  target.error = function filteredConsoleError(this: unknown, ...args: unknown[]) {
    if (isSupabaseStaleSessionLog(args)) {
      // Never forward the error itself: its message/stack is not needed and keeps tokens out of logs.
      target.info('[supabase-auth] Session is no longer valid');
      return;
    }
    return original.apply(this, args);
  };
  filterable[STALE_SESSION_CONSOLE_FILTER] = true;
}

/** Keep expected session expiry out of error logs, without logging cookie/token data. */
export function reportAuthReadFailure(error: unknown, context: string): AuthReadFailure {
  const kind = classifyAuthReadFailure(error);
  if (kind === 'stale_session') console.info(`[${context}] Session is no longer valid`);
  else console.error(`[${context}] Authentication read failed`, { kind });
  return kind;
}
