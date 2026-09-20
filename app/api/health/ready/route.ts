import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { withApiGuc } from '@/lib/db/withRequestGuc';
import { getClientIpFromRequest } from '@/lib/http/clientIp';
import { publicApiCorsHeaders } from '@/lib/http/publicApiCors';
import { checkPublicHealthRateLimit, getRateLimiterMode } from '@/lib/rate-limit';
import { DEFAULT_ORG_SLUG } from '@/lib/tenant/organization';
import { CACHE_TTL_MS, readyCache } from './_readyCache';

const HEALTH_CORS = publicApiCorsHeaders('GET, HEAD, OPTIONS');

export const dynamic = 'force-dynamic';

/**
 * GET /api/health/ready — **readiness** / dependency probe.
 *
 * Fails (HTTP 503, `status: "fail"`) when Prisma cannot reach the default
 * organization row. That is the same lookup `app/layout.tsx` needs on every
 * request — if this is red, public pages 500 even when `/api/health` is green.
 *
 * Operators: page 504 / “site down” alerts off **this** probe (and Vercel
 * runtime timeouts on `/dashboard`, `/admin`, `/counselor`), not liveness
 * `/api/health`. See `docs/HEALTH-PROBES.md` and
 * `docs/POSTMORTEM-2026-06-18-PORTAL-OUTAGE.md`.
 *
 * One org `findUnique` covers Prisma + org. Do not add this query to the
 * public liveness probe.
 *
 * Also reports `rateLimiter: redis | fail-open | fail-closed` — the posture of
 * the security-mode limiters (WAP-13 / TODO-088). It never changes the HTTP
 * status here; `/api/cron/smoke-test` is what fails when it is not `redis`.
 */

type CheckStatus = 'ok' | 'fail';

type CheckResult = {
  status: CheckStatus;
  responseTimeMs: number;
  slug?: string;
  reason?: string;
};

function liveVersion(): string {
  return process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || 'local';
}

async function checkDefaultOrganization(): Promise<CheckResult> {
  const started = Date.now();
  try {
    // Must run inside $transaction — Prisma middleware fail-closes on
    // queries under an active GUC context outside one (see login route).
    const row = await prisma.$transaction((tx) =>
      tx.organization.findUnique({
        where: { slug: DEFAULT_ORG_SLUG },
        select: { id: true },
      }),
    );
    const responseTimeMs = Date.now() - started;
    if (!row) {
      return {
        status: 'fail',
        responseTimeMs,
        slug: DEFAULT_ORG_SLUG,
        reason: `Default organization missing (slug=${DEFAULT_ORG_SLUG})`,
      };
    }
    return { status: 'ok', responseTimeMs, slug: DEFAULT_ORG_SLUG };
  } catch (error) {
    // Keep the driver/connection error server-side; the probe is public and
    // Prisma messages can carry hostnames, ports and statement text.
    console.error('/health/ready database check failed:', error);
    return {
      status: 'fail',
      responseTimeMs: Date.now() - started,
      slug: DEFAULT_ORG_SLUG,
      reason: 'Database unavailable',
    };
  }
}

export async function OPTIONS() {
  try {
    return new NextResponse(null, { status: 204, headers: HEALTH_CORS });
  } catch (error) {
    console.error('/health/ready OPTIONS:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withApiGuc(async (request: Request) => {
  try {
    const ip = getClientIpFromRequest(request);
    const { success: withinHealthLimit } = await checkPublicHealthRateLimit(ip);
    if (!withinHealthLimit) {
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: { ...HEALTH_CORS, 'Cache-Control': 'no-store' } },
      );
    }

    const cached = readyCache.current;
    if (cached && cached.until > Date.now()) {
      return NextResponse.json(cached.body, {
        status: cached.status,
        headers: cached.headers,
      });
    }

    const organization = await checkDefaultOrganization();
    const ok = organization.status === 'ok';
    const rateLimiter = getRateLimiterMode();
    const body = {
      status: ok ? ('ok' as const) : ('fail' as const),
      probe: 'ready' as const,
      version: liveVersion(),
      timestamp: new Date().toISOString(),
      rateLimiter,
      checks: {
        rateLimiter: {
          status: rateLimiter === 'redis' ? ('ok' as const) : ('warn' as const),
          mode: rateLimiter,
        },
        database: {
          status: organization.status,
          responseTimeMs: organization.responseTimeMs,
        },
        organization: {
          status: organization.status,
          slug: organization.slug,
          responseTimeMs: organization.responseTimeMs,
          ...(organization.reason ? { reason: organization.reason } : {}),
        },
      },
    };

    const headers: Record<string, string> = {
      ...HEALTH_CORS,
      'Cache-Control': 'no-store',
    };
    const httpStatus = ok ? 200 : 503;

    readyCache.current = { body, status: httpStatus, headers, until: Date.now() + CACHE_TTL_MS };

    return NextResponse.json(body, { status: httpStatus, headers });
  } catch (error) {
    console.error('/health/ready GET:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
