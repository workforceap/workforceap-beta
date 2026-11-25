import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getUser } from '@/lib/auth/server';
import { withApiGuc } from '@/lib/db/withRequestGuc';
import { canUseGameLab } from '@/lib/game-lab/access';
import { resolveGameLabAsset } from '@/lib/game-lab/manifest';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const BASE_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0',
  Vary: 'Cookie',
  'X-Content-Type-Options': 'nosniff',
};

function deny(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { ...BASE_HEADERS, 'Content-Type': 'application/json' },
  });
}

/**
 * Admin-only, flag-gated static server for the Game Lab prototypes. Rule:
 * no session -> 401; any authenticated user who fails the gate (non-admin or
 * flag off) -> 404 so the surface is not revealed; unknown or traversal path
 * -> 404. Serves only manifest entries.
 */
async function _GET(
  _request: Request,
  { params }: { params: Promise<{ game: string; asset: string[] }> },
): Promise<Response> {
  const user = await getUser();
  if (!user) return deny(401, 'Unauthorized');
  if (!(await canUseGameLab(user.id))) return deny(404, 'Not found');

  const { game, asset } = await params;
  const entry = resolveGameLabAsset(game, asset ?? []);
  if (!entry) return deny(404, 'Not found');

  let body: Buffer;
  try {
    body = await readFile(join(process.cwd(), entry.file));
  } catch {
    return deny(404, 'Not found');
  }
  return new Response(new Uint8Array(body), {
    status: 200,
    headers: { ...BASE_HEADERS, 'Content-Type': entry.contentType },
  });
}

export const GET = withApiGuc(_GET);
