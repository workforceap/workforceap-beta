import { NextRequest, NextResponse, after } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { isAdmin } from '@/lib/auth/roles';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import { withTenantScope, memberInOrg } from '@/lib/tenant/withTenantScope';
import { withApiGuc } from '@/lib/db/withRequestGuc';
import { auditLog } from '@/lib/audit';
import { auditRequestMeta, logAuditEvent } from '@/lib/audit/log';
import { runCertificationApprovedEffects } from '@/lib/certifications/certificationApproved';

/**
 * Admin credential-review endpoint.
 *
 * POST { certId: string, action: 'approve' | 'reject' }
 *
 * Approves or rejects a member-submitted certification. Only certs in
 * `pending` status are reviewable: every self-report starts there (WAP-20) and
 * a proof upload moves an unverified row back there (an `approved` row keeps
 * its status; the new file is audit-logged, WAP-197). The first approval of a
 * row fires the credential's downstream effects (lifecycle event, points,
 * notification, partner milestone); a re-approval after a proof upload does
 * not repeat them. The decision is a compare-and-set on `pending`: a second
 * concurrent review gets 409 with the winning status and fires nothing.
 * Tenant-scoped
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
        select: { id: true, status: true, userId: true, certName: true, reviewedAt: true },
      }),
    );

    if (!cert) {
      return NextResponse.json({ error: 'Certification not found' }, { status: 404 });
    }
    if (cert.status !== 'pending') {
      return NextResponse.json({ error: 'Certification is not pending review' }, { status: 400 });
    }

    const nextStatus = action === 'approve' ? 'approved' : 'rejected';

    // Compare-and-set (O02/M06): the write only lands while the row is still
    // pending, so two admins (or a double-click) cannot both decide it, and an
    // approve racing a reject cannot overwrite the first decision. A row we
    // read as never-reviewed must still be never-reviewed, so a stale read
    // cannot count as the first approval and repeat the credential effects.
    const isFirstReview = cert.reviewedAt === null;
    const { count } = await withTenantScope(orgId, (db) =>
      db.userCertification.updateMany({
        where: {
          id: certId,
          status: 'pending',
          ...(isFirstReview ? { reviewedAt: null } : {}),
          ...memberInOrg(orgId),
        },
        data: {
          status: nextStatus,
          reviewedAt: new Date(),
          reviewedById: user.id,
        },
      }),
    );

    if (count === 0) {
      // Lost the race: report the decision that won. No effects, no audit.
      const current = await withTenantScope(orgId, (db) =>
        db.userCertification.findFirst({
          where: { id: certId, ...memberInOrg(orgId) },
          select: { status: true },
        }),
      );
      if (!current) {
        return NextResponse.json({ error: 'Certification not found' }, { status: 404 });
      }
      return NextResponse.json(
        { error: 'Certification was already reviewed', status: current.status },
        { status: 409 },
      );
    }

    const updated = await withTenantScope(orgId, (db) =>
      db.userCertification.findFirst({
        where: { id: certId, ...memberInOrg(orgId) },
        select: {
          id: true,
          status: true,
          reviewedAt: true,
          reviewedById: true,
        },
      }),
    );

    if (action === 'approve' && isFirstReview) {
      after(() => runCertificationApprovedEffects({ userId: cert.userId, certName: cert.certName }));
    }

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
