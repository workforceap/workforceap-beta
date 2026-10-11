import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { requireAdminOrCounselor } from '@/lib/auth/roles';
import { buildMemberExport } from '@/lib/member/exportData';
import { prisma } from '@/lib/db/prisma';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import { auditLog } from '@/lib/audit';
import { auditRequestMeta, logAuditEvent } from '@/lib/audit/log';
import { withApiGuc } from '@/lib/db/withRequestGuc';
import { assertStaffCanAccessMemberRecord } from '@/lib/counselor/staffMemberAccess';

/**
 * GET /api/admin/members/[id]/export-data
 *
 * Tenant admins and assigned counselors can export a member's data.
 * Returns the same comprehensive JSON structure as the member self-export.
 *
 * Tenant scope: only members of the actor's organization are exportable.
 * Without this filter, an admin from Org A could dump full PII (resume,
 * contact info, wioa qualification answers, assessment answers, etc.)
 * for any Org B member by guessing their UUID. P0.
 */
async function _GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdminOrCounselor(req);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { id } = await params;

    // Verify the member belongs to the actor's org before building
    // the export. buildMemberExport() does not enforce org scoping.
    const actor = await getUser();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const orgId = await getActorOrganizationId(actor.id);
    const member = await prisma.user.findFirst({
      where: { id, organizationId: orgId },
      select: { id: true },
    });
    if (!member) return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    if (!(await assertStaffCanAccessMemberRecord(actor.id, id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const exportData = await buildMemberExport(id);

    auditLog({
      actorUserId: actor.id,
      action: 'export_member_data',
      targetType: 'User',
      targetId: id,
      metadata: { orgId },
    }).catch(() => {});
    logAuditEvent({
      user: { id: actor.id, role: 'admin' },
      verb: 'export_member_data',
      object: { type: 'User', id },
      result: { success: true },
      request: auditRequestMeta(req),
      orgId,
    }).catch((err) => console.error('[audit] export_member_data:', err));

    return NextResponse.json(exportData, {
      headers: {
        'Content-Disposition': `attachment; filename="workforceap-data-export-${id}.json"`,
      },
    });
  } catch (error) {
    console.error('/admin/members/[id]/export-data error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    if (message === 'User not found') {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
export const GET = withApiGuc(_GET);
