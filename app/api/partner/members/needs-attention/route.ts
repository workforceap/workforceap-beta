import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { getPartnerForUser } from '@/lib/auth/roles';
import { loadPartnerAttentionPage } from '@/lib/partner/attentionQueue';
import { withApiGuc } from '@/lib/db/withRequestGuc';
import { AttentionQueryError, parseAttentionQuery } from '@/lib/partner/attentionPagination';

async function _GET(req: Request) {
  try {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const ctx = await getPartnerForUser(user.id);
  if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const options = parseAttentionQuery(new URL(req.url).searchParams, { partnerId: ctx.partnerId, organizationId: ctx.partner.organizationId });
  const page = await loadPartnerAttentionPage(ctx.partnerId, ctx.partner.organizationId, options);
  return NextResponse.json(page);

  } catch (error) {
    if (error instanceof AttentionQueryError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error('/partner/members/needs-attention error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
export const GET = withApiGuc(_GET);
