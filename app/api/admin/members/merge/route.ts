import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { requireAdmin, isAdminInOrg, isSuperAdmin } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';
import { executeMemberMerge, buildMergePreview } from '@/lib/admin/memberMerge';
import { interactiveTransactionsGuaranteed } from '@/lib/db/transactionPolicy';
import { BILLING_LIFECYCLE_UNAVAILABLE_ERROR } from '@/lib/billing/erasureGuard';

import { withApiGuc } from '@/lib/db/withRequestGuc';
import { auditLog } from '@/lib/audit';
import { auditRequestMeta, logAuditEvent } from '@/lib/audit/log';

// Verifies both members involved in a merge belong to the same tenant
// AND that the requesting admin can act on that tenant. Without this,
// an admin in Org A could merge any two members across orgs (AUDIT §C-T3).
async function assertMergeTenantOk(
  adminUserId: string,
  primaryId: string,
  secondaryId: string
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const rows = await prisma.$transaction((tx) => tx.user.findMany({
    where: { id: { in: [primaryId, secondaryId] } },
    select: { id: true, organizationId: true },
  }));
  if (rows.length !== 2) {
    return { ok: false, status: 404, error: 'One or both members not found' };
  }
  const [a, b] = rows;
  if (!a.organizationId || a.organizationId !== b.organizationId) {
    return { ok: false, status: 403, error: 'Members must belong to the same organization' };
  }
  // Super admins bypass the admin-in-org authorization check, but NOT the same-tenant validation
  if (await isSuperAdmin(adminUserId)) return { ok: true };
  if (!(await isAdminInOrg(adminUserId, a.organizationId))) {
    return { ok: false, status: 403, error: 'Forbidden' };
  }
  return { ok: true };
}async function _GET(req: NextRequest) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    try { await requireAdmin(user.id); } catch {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = req.nextUrl;
    const primaryId = searchParams.get('primaryId')?.trim() ?? '';
    const secondaryId = searchParams.get('secondaryId')?.trim() ?? '';

    if (!primaryId || !secondaryId || primaryId === secondaryId) {
      return NextResponse.json({ error: 'primaryId and secondaryId required and must differ' }, { status: 400 });
    }

    const tenantCheck = await assertMergeTenantOk(user.id, primaryId, secondaryId);
    if (!tenantCheck.ok) {
      return NextResponse.json({ error: tenantCheck.error }, { status: tenantCheck.status });
    }

    const preview = await prisma.$transaction(async (tx) => {
      return buildMergePreview(tx, primaryId, secondaryId);
    });

    return NextResponse.json({ ok: true, preview });
  } catch (error) {
    console.error('/admin/members/merge preview error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
export const GET = withApiGuc(_GET);async function _POST(req: NextRequest) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    try { await requireAdmin(user.id); } catch {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (!interactiveTransactionsGuaranteed()) return NextResponse.json({
      error: BILLING_LIFECYCLE_UNAVAILABLE_ERROR, code: 'billing_lifecycle_unavailable',
    }, { status: 503 });

    const body = ((await req.json().catch(() => ({}))) ?? {}) as { primaryId?: string; secondaryId?: string };
    const { primaryId, secondaryId } = body;
    if (!primaryId || !secondaryId || primaryId === secondaryId) {
      return NextResponse.json({ error: 'primaryId and secondaryId required and must differ' }, { status: 400 });
    }

    const tenantCheck = await assertMergeTenantOk(user.id, primaryId, secondaryId);
    if (!tenantCheck.ok) {
      return NextResponse.json({ error: tenantCheck.error }, { status: tenantCheck.status });
    }

    const result = await prisma.$transaction(async (tx) => {
      return executeMemberMerge(tx, primaryId, secondaryId, user.id);
    });

    auditLog({
      actorUserId: user.id,
      action: 'admin_member_merge',
      targetType: 'User',
      targetId: primaryId,
      metadata: { secondaryId },
    }).catch(() => {});
    logAuditEvent({
      user: { id: user.id, role: 'admin' },
      verb: 'merge_members',
      object: { type: 'User', id: primaryId },
      result: { success: true, extensions: { secondaryId } },
      request: auditRequestMeta(req),
    }).catch((err) => console.error('[audit] merge_members:', err));
    auditLog({ actorUserId: user.id, action: 'admin_members_merged', targetType: 'User', targetId: primaryId, metadata: { secondaryId } }).catch(() => {});

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error('/admin/members/merge error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
export const POST = withApiGuc(_POST);
