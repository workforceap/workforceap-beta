import { NextResponse } from 'next/server';
import { getClientIpFromRequest } from '@/lib/http/clientIp';
import { publicApiCorsHeaders } from '@/lib/http/publicApiCors';
import { checkPublicHealthRateLimit } from '@/lib/rate-limit';
import supabaseProjectGuard from '@/scripts/lib/supabase-project-guard.cjs';

const HEALTH_CORS = publicApiCorsHeaders('GET, HEAD, OPTIONS');

export const dynamic = 'force-dynamic';

/**
 * GET /api/health — **liveness** only.
 *
 * Cheap process probe: no Prisma, Redis, or S3. A 200 here means the Next
 * isolate is up. It does **not** mean portal pages can render.
 *
 * The 2026-06-18 portal 504s stayed green here while `/dashboard` / `/admin`
 * timed out (`docs/POSTMORTEM-2026-06-18-PORTAL-OUTAGE.md`). For Prisma /
 * default-org reachability and 504-adjacent dependency alerts, probe
 * `GET /api/health/ready` (see `docs/HEALTH-PROBES.md`). Also alert on
 * Vercel runtime timeouts for `/dashboard`, `/admin`, `/counselor`.
 *
 * `?deep=true` is ignored. Dependency timing lives on `/api/health/ready`.
 *
 * `version`, `supabaseRef` (the public Auth URL), and `prismaProject` (the
 * server's effective Prisma URL classification) let the trusted portal audit
 * refuse a target that serves the wrong commit or database configuration.
 */

function liveVersion(): string {
  // `||` (not `??`): an empty-string SHA must also fall back to 'local'.
  return process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || 'local';
}

/**
 * Project ref of the Supabase instance this deployment is wired to, read from
 * the public `NEXT_PUBLIC_SUPABASE_URL` host (`<ref>.supabase.co`). The ref is
 * already inlined into every client bundle, so publishing it here exposes
 * nothing new. It exists so the trusted portal audit can prove an "isolated
 * preview" really runs on the DEMO project before signing in with five
 * identities (`docs/STAGING_ENV.md`, `scripts/portal-audit-health-gate.mjs`).
 * Costs no dependency call.
 */
function supabaseProjectRef(): string | null {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!raw) return null;
  try {
    const hostname = new URL(raw).hostname.toLowerCase();
    const match = /^([a-z0-9]+)\.supabase\.co$/.exec(hostname);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/** Classify the runtime Prisma datasource without exposing its URL or credentials. */
function prismaProject(): string {
  // schema.prisma binds Prisma Client to POSTGRES_PRISMA_URL. DATABASE_URL is
  // only a build/local fallback and cannot attest the deployed server client.
  return supabaseProjectGuard.projectForUrl(process.env.POSTGRES_PRISMA_URL);
}

export async function OPTIONS() {
  try {
    return new NextResponse(null, { status: 204, headers: HEALTH_CORS });
  } catch (error) {
    console.error('/health OPTIONS:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const ip = getClientIpFromRequest(request);
    const { success: withinHealthLimit } = await checkPublicHealthRateLimit(ip);
    if (!withinHealthLimit) {
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: { ...HEALTH_CORS, 'Cache-Control': 'no-store' } },
      );
    }

    const body = {
      status: 'ok' as const,
      probe: 'live' as const,
      version: liveVersion(),
      supabaseRef: supabaseProjectRef(),
      prismaProject: prismaProject(),
      timestamp: new Date().toISOString(),
      note: 'Liveness only. Use GET /api/health/ready for Prisma/org readiness and 504-adjacent dependency alerts.',
    };

    return NextResponse.json(body, {
      status: 200,
      headers: {
        ...HEALTH_CORS,
        'Cache-Control': 'max-age=5',
      },
    });
  } catch (error) {
    console.error('/health GET:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
