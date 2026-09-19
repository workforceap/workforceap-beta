import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { requireAdminOrCounselor, isSuperAdmin, isAdmin } from '@/lib/auth/roles';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import { getRiskLevel, THRESHOLDS } from '@/lib/member/atRiskScoring';
import { loadPersistedAtRiskMembers } from '@/lib/member/persistedAtRisk';

import { withApiGuc } from '@/lib/db/withRequestGuc';
import { auditLog } from '@/lib/audit';

async function _GET(req: Request) {
  try {
    const auth = await requireAdminOrCounselor(req);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
  
    const superAdmin = await isSuperAdmin(auth.userId);
    const orgId = superAdmin ? null : await getActorOrganizationId(auth.userId);

    const { searchParams } = new URL(req.url);
    const rawThreshold = searchParams.get('threshold');
    const parsedThreshold = rawThreshold !== null && /^\d+$/.test(rawThreshold) ? Number(rawThreshold) : NaN;
    const threshold = Number.isSafeInteger(parsedThreshold) && parsedThreshold <= 100 ? parsedThreshold : THRESHOLDS.HIGH;
    const limit = Math.max(1, Math.min(parseInt(searchParams.get('limit') ?? '20', 10) || 20, 100));
    const status = searchParams.get('status') ?? undefined;

    try {
      const admin = superAdmin || await isAdmin(auth.userId);
      const result = await loadPersistedAtRiskMembers(superAdmin
        ? { platform: true }
        : { organizationId: orgId!, ...(admin ? {} : { counselorUserId: auth.userId }) },
      { threshold, status, limit });
      return NextResponse.json({
        count: result.rows.length,
        total: result.total,
        threshold,
        // One representative saved case per member; count is the loaded page,
        // total is the complete scoped member count, never an alert-row count.
        results: result.rows.map((row) => ({ ...row, riskLevel: getRiskLevel(row.score) })),
      });
    } catch (error) {
      console.error('[admin/members/at-risk] Failed:', error);
      return NextResponse.json(
        { error: 'Failed to fetch at-risk members', details: error instanceof Error ? error.message : String(error) },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('/admin/members/at-risk:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
export const GET = withApiGuc(_GET);

async function _PATCH(req: Request) {
  try {
    const auth = await requireAdminOrCounselor(req);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
  
    const superAdmin = await isSuperAdmin(auth.userId);
    const patchOrgId = superAdmin ? null : await getActorOrganizationId(auth.userId);

    try {
      const body: unknown = await req.json().catch(() => null);
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
      }
      const { alertId, status } = body as { alertId?: unknown; status?: unknown };
      if (
        typeof alertId !== 'string' || !alertId ||
        typeof status !== 'string' || !['acknowledged', 'resolved', 'escalated'].includes(status)
      ) {
        return NextResponse.json({ error: 'Invalid alertId or status' }, { status: 400 });
      }
  
      const existing = await prisma.atRiskAlert.findFirst({
        where: { id: alertId, ...(patchOrgId ? { user: { organizationId: patchOrgId } } : {}) },
        select: { id: true },
      });
      if (!existing) return NextResponse.json({ error: 'Alert not found' }, { status: 404 });

      const alert = await prisma.$transaction((tx) => tx.atRiskAlert.update({
        where: { id: alertId },
        data: {
          status,
          ...(status === 'acknowledged'
            ? { acknowledgedAt: new Date(), counselorId: auth.userId }
            : status === 'resolved'
              ? { resolvedAt: new Date() }
              : { escalatedAt: new Date(), counselorId: auth.userId }),
        },
      }));
  
      void auditLog({ actorUserId: auth.userId, action: 'admin_at_risk_alert_update', targetType: 'user', targetId: alertId, metadata: { status } }).catch(() => {});

      return NextResponse.json({ success: true, alert });
    } catch (error) {
      console.error('[admin/members/at-risk] Patch failed:', error);
      return NextResponse.json(
        { error: 'Failed to update alert', details: error instanceof Error ? error.message : String(error) },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('/admin/members/at-risk:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
export const PATCH = withApiGuc(_PATCH);
