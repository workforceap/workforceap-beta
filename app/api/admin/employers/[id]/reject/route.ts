import { after, NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { requireAdmin, isSuperAdmin } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';
import { sendEmployerRejectedEmail } from '@/lib/email';
import { withTenantScope } from '@/lib/tenant/withTenantScope';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import { auditLog } from '@/lib/audit';
import { auditRequestMeta, logAuditEvent } from '@/lib/audit/log';

import { withApiGuc } from '@/lib/db/withRequestGuc';
import { invalidateJobListings } from '@/lib/jobs/listingCache';

export const POST = withApiGuc(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    try {
      await requireAdmin(user.id);
    } catch {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id: employerId } = await params;
    // Use the actor's organization, not the global default (AUDIT §C-T7).
    const orgId = await getActorOrganizationId(user.id);

    let body: { reason?: string } = {};
    try {
      const parsed: unknown = await request.json();
      body = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      // reason is optional
    }

    const employer = await withTenantScope(orgId, (db) =>
      db.employer.findFirst({
        where: { id: employerId },
        select: {
          id: true, status: true, contactEmail: true, companyName: true, contactName: true,
        },
      }),
    );

    if (!employer) {
      return NextResponse.json({ error: 'Employer not found' }, { status: 404 });
    }

    if (employer.status === 'inactive') {
      return NextResponse.json({ error: 'Employer is already rejected' }, { status: 400 });
    }

    const updated = await withTenantScope(orgId, (db) =>
      db.employer.update({
        where: { id: employerId },
        data: {
          status: 'inactive',
          approvedAt: null,
          approvedById: user.id,
          approvalNotes: body.reason || null,
        },
        select: { id: true, status: true, companyName: true, contactEmail: true, contactName: true },
      }),
    );

    // Its jobs stay `live` but members no longer see them; drop the cached
    // member job list so they disappear now, not after the cache TTL.
    await invalidateJobListings().catch(() => {});

    // Best-effort rejection email via `after()` so Vercel does not freeze early.
    if (employer.contactEmail) {
      after(() =>
        sendEmployerRejectedEmail({
          to: employer.contactEmail!,
          companyName: employer.companyName,
          contactName: employer.contactName || 'there',
          reason: body.reason,
        }).catch((err) => console.error('Employer rejection email failed:', err))
      );
    }

    await auditLog({
      actorUserId: user.id,
      action: 'employer_reject',
      targetType: 'employer',
      targetId: employerId,
      metadata: { orgId, previousStatus: employer.status, reason: body.reason },
    });
    const actorRole = (await isSuperAdmin(user.id)) ? 'super_admin' : 'admin';
    await logAuditEvent({
      user: { id: user.id, role: actorRole },
      verb: 'voided',
      object: { type: 'Employer', id: employerId },
      result: { success: true, extensions: { previousStatus: employer.status, reason: body.reason, orgId } },
      request: auditRequestMeta(request),
      orgId,
    }).catch((err) => console.error('[audit] employer reject:', err));

    return NextResponse.json({ success: true, employer: updated });
  } catch (err) {
    console.error('Reject employer error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
