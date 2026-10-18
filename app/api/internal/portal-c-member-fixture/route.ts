import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { handlePortalCMemberFixture } from '@/lib/portal-c/memberFixtureHandler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * DEMO-only fixture writes for the Portal C signed-in job.
 * The preview deployment's own Prisma URL is already classified as demo by
 * /api/health. GitHub's PREVIEW_POSTGRES_* secrets are a different, production
 * pooler and must not be used. Callers present a GitHub Actions OIDC token
 * for this repository's safety-net workflow. Production returns 404.
 */
export async function POST(request: Request) {
  let payload: unknown = null;
  try {
    payload = await request.json();
  } catch {
    payload = null;
  }
  const result = await handlePortalCMemberFixture({
    authorization: request.headers.get('authorization'),
    payload,
    prisma,
  });
  return NextResponse.json(result.body, { status: result.status });
}
