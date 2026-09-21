/**
 * Per-IP limiter for the public CSP report sink (`POST /api/csp-report`).
 *
 * Follows the pattern the other unauthenticated public POST sinks use in
 * `lib/rate-limit.ts` (`checkWebhookRateLimit`, `checkPlacementSurveyRateLimit`,
 * `checkPublicWioaQualificationRateLimit`): an Upstash sliding window keyed on
 * the proxy-trusted client IP, FAIL-OPEN when Upstash is not configured. The
 * sink writes nothing but a counted log line, so a missing limiter cannot
 * amplify into storage or email; the production boot assertion for missing
 * Upstash already lives in `lib/rate-limit.ts` and covers every deploy.
 *
 * Lives in its own module because `lib/rate-limit.ts` is owned by concurrent
 * branches at the time of WAP-36 phase 1; fold it in when that file is free.
 *
 * 60 reports / minute / IP: one page load can legitimately emit a dozen
 * reports during the soak (every un-nonced script is one), and browsers
 * batch `report-to` deliveries, so this only trims deliberate floods.
 */
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

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

/** POST /api/csp-report — fail-open without Redis, like the other public sinks. */
export async function checkCspReportRateLimit(ip: string): Promise<{ success: boolean }> {
  const active = getLimiter();
  if (!active) return { success: true };
  const result = await active.limit(ip);
  return { success: result.success };
}

/** Test seam: forget the cached limiter so env changes take effect. */
export function resetCspReportRateLimiterForTests(): void {
  limiter = undefined;
}
