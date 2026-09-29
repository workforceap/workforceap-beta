import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { isAdmin } from '@/lib/auth/roles';
import { withApiGuc } from '@/lib/db/withRequestGuc';
import { loadPacketForViewer } from '@/lib/billing/packetAccess';

/** Keep historic packets readable, but prevent further sends through the retired workflow. */
export const POST = withApiGuc(async (_request: Request, { params }: { params: Promise<{ packetId: string }> }) => {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!(await isAdmin(user.id))) return NextResponse.json({ error: 'Forbidden: admin access required' }, { status: 403 });
    const { packetId } = await params;
    if (!/^[0-9a-f-]{36}$/i.test(packetId)) return NextResponse.json({ error: 'Document not found' }, { status: 404 });

    const loaded = await loadPacketForViewer(packetId, user.id, { requireAdmin: true });
    if (!loaded.ok) return NextResponse.json({ error: loaded.error }, { status: loaded.status });

    return NextResponse.json(
      {
        code: 'LEGACY_BILLING_FLOW_RETIRED',
        error: 'The combined J5 invoice and J6 letter workflow has been retired. Existing documents remain available for review.',
      },
      { status: 410 },
    );
  } catch (error) {
    console.error('[billing-packets send]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
