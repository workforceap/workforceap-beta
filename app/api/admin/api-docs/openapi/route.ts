import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { isSuperAdmin } from '@/lib/auth/roles';
import { withApiGuc } from '@/lib/db/withRequestGuc';
import { apiDocsOpenApi } from '@/lib/api-docs/catalog';

export const dynamic = 'force-dynamic';

export const GET = withApiGuc(async () => {
  const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie', 'X-Robots-Tag': 'noindex, nofollow' };
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
  if (!(await isSuperAdmin(user.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers });
  return NextResponse.json(apiDocsOpenApi, { headers });
});
