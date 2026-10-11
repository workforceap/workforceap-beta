import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { isAdminInOrg, isSuperAdmin } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';
import { logger } from '@/lib/observability/logger';
import { withApiGuc } from '@/lib/db/withRequestGuc';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import { measureCourseraIngestion, measureEmailDelivery, type SloReport } from '@/lib/observability/sloMetrics';

/**
 * GET /api/health/slo
 *
 * Admin-only SLO snapshot. Sprint P2 (observability uplift) replaced the
 * Sprint D.1 stub helpers with real measurements. Every metric either
 * returns a real value (computed from our own DB) or honestly reports
 * `current: null` / `status: 'unknown'` with a configuration note — we
 * still never emit synthetic numbers (see NOTE TO MAINTAINERS below).
 *
 * Auth: ADMIN-ONLY. Same posture as before: the data here (latencies,
 * error rates, isolation status) is operational and we don't want it
 * scraped. /api/health remains the public probe.
 *
 * Sources, post Sprint P2:
 *   - Latency p95s: Vercel Analytics REST API IFF `VERCEL_ANALYTICS_TOKEN`
 *     (and `VERCEL_PROJECT_ID` + `VERCEL_TEAM_ID` if applicable) are set.
 *     Otherwise the SLO is reported as `unknown` with a "not configured"
 *     note — we do not fabricate a number.
 *   - Error rate: `member_events` rows in the last 24h where eventName
 *     ends in `_failed` / `_error`, divided by total events in the window.
 *     This is a real number computed from our own DB; it is not perfectly
 *     correlated with HTTP 5xx (the next iteration will join /api/health
 *     and Sentry) but it is honest.
 *   - DB pool utilization: `pg_stat_activity` via `prisma.$queryRaw`,
 *     returning current backend count vs `max_connections` (super admin only).
 *   - Email: deduplicated non-skipped send logs + immutable signed Resend
 *     delivery evidence, matured over five minutes. Missing evidence is unknown.
 *   - xAPI: recorded authenticated batch attempts + raw persistence within
 *     sixty seconds. Incomplete observations are unknown; matching is separate.
 *   - Tenant admins read their actor organization's observations. Super admins
 *     can read the platform aggregate; the response includes no identifiers.
 *
 * NOTE TO MAINTAINERS: do not "fill in" any helper with synthetic numbers
 * to make a dashboard look populated. Either wire to a real source or keep
 * returning `current: null`. Synthetic SLO numbers shown to a funder or
 * buyer would be a trust violation.
 */

export const dynamic = 'force-dynamic';

type SloEnvelope = {
  generatedAt: string;
  window: string;
  slos: SloReport[];
};

// ---------------------------------------------------------------------------
// Latency: Vercel Analytics REST API. Only attempts the fetch when the env
// is configured; otherwise returns a clear "not configured" status.
// ---------------------------------------------------------------------------

interface VercelAnalyticsConfig {
  token: string;
  projectId: string;
  teamId?: string;
}

function readVercelAnalyticsConfig(): VercelAnalyticsConfig | null {
  const token = process.env.VERCEL_ANALYTICS_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;
  if (!token || !projectId) return null;
  return {
    token,
    projectId,
    teamId: process.env.VERCEL_TEAM_ID,
  };
}

/**
 * Fetch a p95 latency in milliseconds for a given route from Vercel
 * Analytics. The Vercel REST shape varies by plan; we treat any non-2xx
 * response or unexpected shape as "unknown" and never throw to the caller.
 */
async function fetchVercelP95Ms(
  config: VercelAnalyticsConfig,
  route: string,
  windowDays: number,
): Promise<number | null> {
  const since = Date.now() - windowDays * 24 * 60 * 60 * 1000;
  const params = new URLSearchParams({
    projectId: config.projectId,
    since: String(since),
    until: String(Date.now()),
    filter: `route:${route}`,
    metric: 'p95',
  });
  if (config.teamId) params.set('teamId', config.teamId);
  const url = `https://api.vercel.com/v1/web-analytics/timing?${params.toString()}`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${config.token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { p95?: number; value?: number };
    if (typeof data.p95 === 'number' && Number.isFinite(data.p95) && data.p95 >= 0) return data.p95;
    if (typeof data.value === 'number' && Number.isFinite(data.value) && data.value >= 0) return data.value;
    return null;
  } catch (err) {
    logger.warn('vercel analytics fetch failed', { err, route });
    return null;
  }
}

function evaluateLatencySlo(
  id: string,
  name: string,
  route: string,
  thresholdMs: number,
  ms: number | null,
  configured: boolean,
  platformAccess = true,
): SloReport {
  if (!platformAccess) {
    return {
      id, name, target: `< ${thresholdMs} ms`, current: null, status: 'unknown',
      source: `Vercel Analytics — route:${route}, p95`,
      note: 'Project-wide latency telemetry is available to super admins',
    };
  }
  if (!configured) {
    return {
      id,
      name,
      target: `< ${thresholdMs} ms`,
      current: null,
      status: 'unknown',
      source: `Vercel Analytics — route:${route}, p95`,
      note: 'VERCEL_ANALYTICS_TOKEN / VERCEL_PROJECT_ID not set — measurement unavailable',
    };
  }
  if (ms == null) {
    return {
      id,
      name,
      target: `< ${thresholdMs} ms`,
      current: null,
      status: 'unknown',
      source: `Vercel Analytics — route:${route}, p95`,
      note: 'Vercel Analytics returned no usable value (insufficient traffic or API error)',
    };
  }
  return {
    id,
    name,
    target: `< ${thresholdMs} ms`,
    current: `${Math.round(ms)} ms`,
    status: ms < thresholdMs ? 'within' : 'breaching',
    source: `Vercel Analytics — route:${route}, p95`,
  };
}

// ---------------------------------------------------------------------------
// Error rate: MemberEvent rows in the last 24h.
// ---------------------------------------------------------------------------

async function measureMemberEventErrorRate(organizationId: string | null, now: Date): Promise<SloReport> {
  const id = 'event_error_rate_24h';
  const name = 'Member event error rate (24h)';
  const target = '< 1%';
  const source = 'member_events joined to users — literal _failed/_error suffixes / total over 24h, scoped to the actor';
  try {
    const rows = await prisma.$queryRaw<
      Array<{ total: bigint | number; errors: bigint | number }>
    >`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (
          WHERE RIGHT(e.event_name, 7) = '_failed' OR RIGHT(e.event_name, 6) = '_error'
        ) AS errors
      FROM member_events e
      JOIN users u ON u.id = e.user_id
      WHERE e.created_at >= ${new Date(now.getTime() - 86_400_000)} AND e.created_at <= ${now}
        AND (${organizationId}::text IS NULL OR u.organization_id = ${organizationId})
    `;
    const row = rows[0];
    const total = Number(row?.total ?? 0);
    const errors = Number(row?.errors ?? 0);
    if (total === 0) {
      return {
        id,
        name,
        target,
        current: null,
        status: 'unknown',
        source,
        note: 'No member events recorded in the last 24h',
      };
    }
    const rate = errors / total;
    const pct = (rate * 100).toFixed(2);
    return {
      id,
      name,
      target,
      current: `${pct}%`,
      status: rate < 0.01 ? 'within' : 'breaching',
      source,
    };
  } catch (err) {
    logger.error('slo: member event error rate query failed', { err });
    return {
      id,
      name,
      target,
      current: null,
      status: 'unknown',
      source,
      note: 'Query failed — see server logs',
    };
  }
}

// ---------------------------------------------------------------------------
// DB pool utilization: pg_stat_activity vs max_connections.
// ---------------------------------------------------------------------------

async function measureDbPoolUtilization(): Promise<SloReport> {
  const id = 'db_pool_utilization';
  const name = 'Database connection pool utilization';
  const target = '< 80%';
  const source = 'pg_stat_activity / max_connections';
  try {
    const rows = await prisma.$queryRaw<
      Array<{ current: bigint | number; max_conn: bigint | number }>
    >`
      SELECT
        (SELECT COUNT(*) FROM pg_stat_activity)::bigint AS current,
        (current_setting('max_connections'))::bigint AS max_conn
    `;
    const row = rows[0];
    const current = Number(row?.current ?? 0);
    const max = Number(row?.max_conn ?? 0);
    if (max <= 0) {
      return {
        id,
        name,
        target,
        current: null,
        status: 'unknown',
        source,
        note: 'max_connections unavailable',
      };
    }
    const util = current / max;
    const pct = (util * 100).toFixed(1);
    return {
      id,
      name,
      target,
      current: `${current}/${max} (${pct}%)`,
      status: util < 0.8 ? 'within' : 'breaching',
      source,
    };
  } catch (err) {
    logger.error('slo: db pool utilization query failed', { err });
    return {
      id,
      name,
      target,
      current: null,
      status: 'unknown',
      source,
      note: 'Query failed — see server logs',
    };
  }
}

// ---------------------------------------------------------------------------
// Uptime and cross-tenant isolation still depend on external sources. Keep them honest:
// unknown with a clear note.
// ---------------------------------------------------------------------------

function measureUptime(): SloReport {
  return {
    id: 'uptime',
    name: 'Overall uptime',
    target: '99.9%',
    current: null,
    status: 'unknown',
    source: 'Hosted external monitor probing /api/health (liveness) and /api/health/ready (dependencies)',
    note: 'No continuous 30-day external uptime series is configured. GitHub Actions readiness pings can be hours apart and cannot establish 99.9% uptime. See docs/SLO-AND-STATUS.md for setup.',
  };
}

function measureCrossTenantIsolation(): SloReport {
  return {
    id: 'cross_tenant_leaks',
    name: 'Cross-tenant isolation (binary)',
    target: '0 leaks',
    current: null,
    status: 'unknown',
    source: 'Synthetic monitor (Track A.3 deliverable); interim: CI isolation tests',
    note: 'Runtime synthetic probe not yet wired — interim assurance is CI isolation tests',
  };
}

async function _GET() {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const superAdmin = await isSuperAdmin(user.id);
    let organizationId: string | null = null;
    if (!superAdmin) {
      try {
        organizationId = await getActorOrganizationId(user.id);
      } catch {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }
    if (!superAdmin && !(await isAdminInOrg(user.id, organizationId!))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const now = new Date();
    const generatedAt = now.toISOString();
    // Project-wide latency/pool numbers are platform telemetry. Tenant admins
    // may read only their own event, email and ingestion observations.
    const vercelConfig = superAdmin ? readVercelAnalyticsConfig() : null;

    const [dashboardMs, outcomesMs, errorRate, dbPool, emailDelivery, courseraIngestion] = await Promise.all([
      vercelConfig ? fetchVercelP95Ms(vercelConfig, '/dashboard', 7) : Promise.resolve(null),
      vercelConfig ? fetchVercelP95Ms(vercelConfig, '/admin/outcomes', 7) : Promise.resolve(null),
      measureMemberEventErrorRate(organizationId, now),
      superAdmin ? measureDbPoolUtilization() : Promise.resolve({
        id: 'db_pool_utilization', name: 'Database connection pool utilization', target: '< 80%',
        current: null, status: 'unknown' as const, source: 'pg_stat_activity / max_connections',
        note: 'Project-wide database telemetry is available to super admins',
      }),
      measureEmailDelivery(organizationId, now),
      measureCourseraIngestion(organizationId, now),
    ]);

    const slos: SloReport[] = [
      measureUptime(),
      evaluateLatencySlo(
        'dashboard_latency_p95',
        'Dashboard p95 latency',
        '/dashboard',
        500,
        dashboardMs,
        Boolean(vercelConfig),
        superAdmin,
      ),
      evaluateLatencySlo(
        'outcomes_latency_p95',
        '/admin/outcomes p95 latency',
        '/admin/outcomes',
        500,
        outcomesMs,
        Boolean(vercelConfig),
        superAdmin,
      ),
      emailDelivery,
      measureCrossTenantIsolation(),
      courseraIngestion,
      errorRate,
      dbPool,
    ];

    const body: SloEnvelope = {
      generatedAt,
      window: 'rolling 7 days (latency, matured email and recorded xAPI batches) / last 24h (errors) / live (db pool)',
      slos,
    };

    return NextResponse.json(body, {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    logger.error('/health/slo error', { err: error });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
export const GET = withApiGuc(_GET);
