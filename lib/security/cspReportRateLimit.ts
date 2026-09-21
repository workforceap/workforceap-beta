/**
 * Per-IP limiter for the public CSP report sink (`POST /api/csp-report`).
 *
 * Same Upstash sliding window the other unauthenticated public POST sinks in
 * `lib/rate-limit.ts` use, keyed on the proxy-trusted client IP, and the SAME
 * missing-Redis policy: importing `lib/rate-limit` here runs its production
 * boot assertion (Upstash env required unless RATE_LIMIT_ALLOW_MISSING_UPSTASH=1),
 * and `getRateLimiterMode()` decides what a null limiter means — `fail-closed`
 * in production blocks (429), `fail-open` in dev / explicit opt-out allows.
 * Since phase 2 the sink writes aggregate rows, so it must not run unmetered
 * in production; the ceiling in `cspViolationStore.ts` is the backstop.
 *
 * Lives in its own module for the prefix and window only.
 *
 * 60 reports / minute / IP: one page load can legitimately emit a dozen
 * reports during the soak (every un-nonced script is one), and browsers
 * batch `report-to` deliveries, so this only trims deliberate floods.
 */
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { logger } from '@/lib/observability/logger';
import { getRateLimiterMode } from '@/lib/rate-limit';

export const CSP_REPORTS_PER_MINUTE_PER_IP = 60;

let limiter: Ratelimit | null | undefined;

function getLimiter(): Ratelimit | null {
  if (limiter !== undefined) return limiter;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  limiter = url && token
    ? new Ratelimit({
        redis: new Redis({ url, token }),
        limiter: Ratelimit.slidingWindow(CSP_REPORTS_PER_MINUTE_PER_IP, '1 m'),
        prefix: 'ratelimit:csp-report',
      })
    : null;
  return limiter;
}

let missingLimiterLogged = false;

/**
 * POST /api/csp-report — Upstash when configured; otherwise the shared
 * `lib/rate-limit` mode: `fail-closed` (production without the explicit
 * opt-out) blocks, anything else allows. Logs the missing limiter once.
 */
export async function checkCspReportRateLimit(ip: string): Promise<{ success: boolean }> {
  const active = getLimiter();
  if (active) {
    const result = await active.limit(ip);
    return { success: result.success };
  }
  const mode = getRateLimiterMode();
  if (!missingLimiterLogged) {
    missingLimiterLogged = true;
    if (mode === 'fail-closed') {
      logger.error('[RATE-LIMIT] csp-report limiter is null in production — blocking reports until Upstash is configured');
    } else {
      logger.warn('[RATE-LIMIT] csp-report limiter is null — allowing reports (fail-open)');
    }
  }
  return { success: mode !== 'fail-closed' };
}

/** Test seam: forget the cached limiter so env changes take effect. */
export function resetCspReportRateLimiterForTests(): void {
  limiter = undefined;
  missingLimiterLogged = false;
}
