import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { isAdmin } from '@/lib/auth/roles';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import { withTenantScope, memberInOrg } from '@/lib/tenant/withTenantScope';
import { withApiGuc } from '@/lib/db/withRequestGuc';
import { auditLog } from '@/lib/audit';
import { auditRequestMeta, logAuditEvent } from '@/lib/audit/log';

/**
 * Admin credential-review endpoint.
 *
 * POST { certId: string, action: 'approve' | 'reject' }
 *
 * Approves or rejects a member-submitted certification proof. Only certs in
 * `pending` status (i.e. with submitted proof) are reviewable. Tenant-scoped
 * via the owning user's organization so an admin from Org A cannot review an
 * Org B submission by guessing its UUID — same hardening as the jobs/approve
 * route. Auth mirrors the other admin POST routes (getUser + isAdmin, DB inside
 * withApiGuc / withTenantScope).
 */
export const POST = withApiGuc(async (request: NextRequest) => {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!(await isAdmin(user.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    let body: { certId?: unknown; action?: unknown } = {};
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const certId = typeof body.certId === 'string' ? body.certId : '';
    const action = body.action;
    if (!certId) {
      return NextResponse.json({ error: 'certId is required' }, { status: 400 });
    }
    if (action !== 'approve' && action !== 'reject') {
      return NextResponse.json({ error: "action must be 'approve' or 'reject'" }, { status: 400 });
    }

    const orgId = await getActorOrganizationId(user.id);

    // Scope to the actor's org via the owning user (UserCertification has no
    // organizationId column, so we constrain through the user relation).
    const cert = await withTenantScope(orgId, (db) =>
      db.userCertification.findFirst({
        where: { id: certId, ...memberInOrg(orgId) },
        select: { id: true, status: true },
      }),
    );

    if (!cert) {
      return NextResponse.json({ error: 'Certification not found' }, { status: 404 });
    }
    if (cert.status !== 'pending') {
      return NextResponse.json({ error: 'Certification is not pending review' }, { status: 400 });
    }

    const nextStatus = action === 'approve' ? 'approved' : 'rejected';

    const updated = await withTenantScope(orgId, (db) =>
      db.userCertification.update({
        where: { id: certId },
        data: {
          status: nextStatus,
          reviewedAt: new Date(),
          reviewedById: user.id,
        },
        select: {
          id: true,
          status: true,
          reviewedAt: true,
          reviewedById: true,
        },
      }),
    );

    // Dual audit (WAP-18): a certification review is a funder-facing decision.
    void auditLog({
      actorUserId: user.id,
      action: `admin_certification_${nextStatus}`,
      targetType: 'user_certification',
      targetId: certId,
      metadata: { action, previousStatus: cert.status, status: nextStatus, orgId },
    }).catch(() => {});
    void logAuditEvent({
      user: { id: user.id, role: 'admin' },
      verb: action === 'approve' ? 'approved' : 'rejected',
      object: { type: 'UserCertification', id: certId },
      result: { success: true, extensions: { previousStatus: cert.status, status: nextStatus } },
      request: auditRequestMeta(request),
      orgId,
    }).catch(() => {});

    return NextResponse.json({ success: true, certification: updated });
  } catch (error) {
    console.error('[admin/certifications/review POST] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
