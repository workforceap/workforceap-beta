import * as Sentry from '@sentry/nextjs';
import { getGucContext } from '@/lib/db/gucContext';
import { hasReportedApiError, markApiErrorReported } from './apiErrorScope';

/**
 * Log and report API route failures. Sentry captures in production when SENTRY_DSN is set
 * (see sentry.server.config.ts); otherwise this is a structured console.error only.
 */
export function captureApiError(
  err: unknown,
  context: { route: string; extra?: Record<string, unknown>; userId?: string | null }
): void {
  const error =
    err instanceof Error
      ? err
      : new Error(typeof err === 'string' ? err : 'Non-Error API exception');
  if (!markApiErrorReported(error)) return;
  console.error(`[${context.route}]`, error);
  // Tag with the authenticated user's ID only (never email/name/other PII).
  // Prefer an explicit `context.userId` from the caller; fall back to the
  // per-request GUC context (AsyncLocalStorage) populated by withApiGuc /
  // withAuthGuc / the root layout — same fallback sentry.server.config.ts /
  // sentry.edge.config.ts apply in beforeSend, kept here too as defense in
  // depth since this call site already has the exception + route in scope.
  const userId = context.userId ?? getGucContext()?.userId ?? undefined;
  try {
    Sentry.captureException(error, {
      tags: { api_route: context.route },
      extra: context.extra,
      user: userId ? { id: userId } : undefined,
    });
  } catch {
    // Telemetry failure must not replace an API result or trigger a second mutation.
    console.error('[captureApiError] Error reporting unavailable');
  }
}

/** Report swallowed handler failures without consuming a response body/stream. */
export function captureApiResponseError(response: unknown, route: string): void {
  if (!response || typeof response !== 'object' || !('status' in response)) return;
  const status = response.status;
  if (typeof status !== 'number' || status < 500 || hasReportedApiError()) return;
  captureApiError(new Error(`API handler returned HTTP ${status}`), { route, extra: { status } });
}
