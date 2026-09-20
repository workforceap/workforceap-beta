import { logCronRun } from '@/lib/admin/logCronRun';
import { withCronLogging } from '@/lib/cron/withCronLogging';
import { setCronRecordsProcessed } from '@/lib/cron/cronExecution';
import { splitLocalePrefix } from '@/lib/i18n/config';
import { captureApiError } from '@/lib/observability/captureApiError';

// WAP-177 fix 4: bound the function so a hung run is killed and swept to FAILED
// by data-cleanup instead of pinning a RUNNING row forever.
export const maxDuration = 60;

/**
 * Hourly production journey smoke test.
 *
 * Checks liveness, database/org readiness, public pages, and the login redirects
 * protecting the three portal roots that timed out during the June incident.
 * This cannot prove an authenticated page render; Vercel runtime-timeout alerts
 * remain the second half of that safety net (see docs/HEALTH-PROBES.md).
 */

const PROBE_TIMEOUT_MS = 12_000;
const SLOW_PROBE_MS = 8_000;

type Probe = {
  path: string;
  name: string;
  kind: 'json-health' | 'public-page' | 'protected-redirect';
  bodyMarker?: string;
  /** json-health only: fail unless the body reports `rateLimiter: "redis"` (WAP-13). */
  requireRedisRateLimiter?: boolean;
};

type ProbeResult = {
  ok: boolean;
  status: number;
  durationMs: number;
  bytes: number;
  finalPath?: string;
  reason?: string;
};

const PROBES: Probe[] = [
  { path: '/api/health', name: 'liveness', kind: 'json-health' },
  { path: '/api/health/ready', name: 'readiness', kind: 'json-health', requireRedisRateLimiter: true },
  { path: '/login', name: 'login', kind: 'public-page', bodyMarker: 'Sign In' },
  {
    path: '/programs',
    name: 'programs',
    kind: 'public-page',
    bodyMarker: 'Find the right program',
  },
  { path: '/dashboard', name: 'dashboard', kind: 'protected-redirect' },
  { path: '/admin', name: 'admin', kind: 'protected-redirect' },
  { path: '/counselor', name: 'counselor', kind: 'protected-redirect' },
];

function normalizeBaseUrl(raw: string): string {
  return raw.replace(/\/$/, '');
}

function protectedRedirectMatches(finalUrl: URL, probePath: string, baseUrl: string): boolean {
  const { pathnameWithoutLocale } = splitLocalePrefix(finalUrl.pathname);
  return (
    finalUrl.origin === new URL(baseUrl).origin &&
    pathnameWithoutLocale === '/login' &&
    finalUrl.searchParams.get('redirectTo') === probePath
  );
}

async function runProbe(baseUrl: string, probe: Probe): Promise<ProbeResult> {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

  try {
    const res = await fetch(`${baseUrl}${probe.path}`, {
      method: 'GET',
      cache: 'no-store',
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'user-agent': 'WorkforceAP-Production-Monitor/1.0' },
    });
    const body = await res.text();
    const durationMs = Date.now() - startedAt;
    const finalUrl = new URL(res.url || `${baseUrl}${probe.path}`);

    let reason: string | undefined;
    if (res.status !== 200) {
      reason = `HTTP ${res.status}`;
    } else if (durationMs > SLOW_PROBE_MS) {
      reason = `slow response (${durationMs}ms)`;
    } else if (body.length === 0) {
      reason = 'empty response body';
    } else if (probe.kind === 'json-health') {
      try {
        const parsed = JSON.parse(body) as { status?: unknown; rateLimiter?: unknown };
        if (parsed.status !== 'ok') {
          reason = `health status ${String(parsed.status)}`;
        } else if (probe.requireRedisRateLimiter && parsed.rateLimiter !== 'redis') {
          // Production without Upstash either 429s every contact POST
          // (fail-closed) or runs auth with no brute-force cap (fail-open).
          reason = `rate limiter mode ${String(parsed.rateLimiter)} (expected redis)`;
        }
      } catch {
        reason = 'invalid health JSON';
      }
    } else if (probe.kind === 'protected-redirect') {
      if (!protectedRedirectMatches(finalUrl, probe.path, baseUrl)) {
        reason = `unexpected redirect target ${finalUrl.origin}${finalUrl.pathname}${finalUrl.search}`;
      }
    } else if (probe.bodyMarker && !body.includes(probe.bodyMarker)) {
      reason = `missing page marker: ${probe.bodyMarker}`;
    }

    return {
      ok: !reason,
      status: res.status,
      durationMs,
      bytes: body.length,
      finalPath: `${finalUrl.pathname}${finalUrl.search}`,
      ...(reason ? { reason } : {}),
    };
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    return {
      ok: false,
      status: 0,
      durationMs,
      bytes: 0,
      reason:
        error instanceof Error && error.name === 'AbortError'
          ? `timed out after ${PROBE_TIMEOUT_MS}ms`
          : error instanceof Error
            ? error.message
            : 'network failure',
    };
  } finally {
    clearTimeout(timer);
  }
}

async function handle(_request: Request) {
  const baseUrl = normalizeBaseUrl(
    process.env.NEXT_PUBLIC_SITE_URL ||
      process.env.NEXT_PUBLIC_BASE_URL ||
      'https://www.workforceap.org',
  );
  const results: Record<string, ProbeResult> = Object.fromEntries(
    await Promise.all(
      PROBES.map(async (probe) => [probe.name, await runProbe(baseUrl, probe)] as const),
    ),
  );

  const allOk = Object.values(results).every((r) => r.ok);
  const failed = Object.entries(results)
    .filter(([, r]) => !r.ok)
    .map(([name]) => name);

  const result = {
    ok: allOk,
    checked: PROBES.length,
    failed,
    results,
    checkedAt: new Date().toISOString(),
  };

  console.log(JSON.stringify(result));
  await setCronRecordsProcessed(PROBES.length);
  await logCronRun('cron_smoke_test', result, allOk ? 'ok' : 'error');
  if (!allOk) {
    captureApiError(new Error(`Production smoke failed: ${failed.join(', ')}`), {
      route: '/api/cron/smoke-test',
      extra: {
        failed,
        probes: Object.fromEntries(
          failed.map((name) => [
            name,
            {
              status: results[name]?.status,
              durationMs: results[name]?.durationMs,
              reason: results[name]?.reason,
            },
          ]),
        ),
      },
    });
  }
  return Response.json(result, { status: allOk ? 200 : 503 });
}

export const GET = withCronLogging('cron_smoke_test', handle);
export const POST = withCronLogging('cron_smoke_test', handle);
