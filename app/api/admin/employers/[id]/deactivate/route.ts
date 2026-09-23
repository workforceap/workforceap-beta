import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { requireAdmin, isSuperAdmin } from '@/lib/auth/roles';
import { withTenantScope } from '@/lib/tenant/withTenantScope';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import { auditLog } from '@/lib/audit';
import { auditRequestMeta, logAuditEvent } from '@/lib/audit/log';

import { withApiGuc } from '@/lib/db/withRequestGuc';
import { invalidateJobListings } from '@/lib/jobs/listingCache';

/**
 * Track A — Tenant Isolation Hardening (Sprint A.2 batch 2).
 * See `docs/PROGRAM-ENTERPRISE-GRADE.md` and `docs/TENANT-ISOLATION.md`.
 *
 * Both the lookup and the status update against `Employer` are wrapped
 * in `withTenantScope`. An Org A admin can no longer deactivate an Org
 * B employer by guessing its UUID.
 */
export const POST = withApiGuc(async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
  try {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    await requireAdmin(user.id);
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id: employerId } = await params;
  const orgId = await getActorOrganizationId(user.id);

  const employer = await withTenantScope(orgId, (db) =>
    db.employer.findFirst({ where: { id: employerId } }),
  );
  if (!employer) return NextResponse.json({ error: 'Employer not found' }, { status: 404 });
  if (employer.status !== 'active') {
    return NextResponse.json({ error: 'Employer is already inactive' }, { status: 400 });
  }

  await withTenantScope(orgId, (db) =>
    db.employer.update({
      where: { id: employerId },
      data: { status: 'inactive' },
    }),
  );

  // Its jobs stay `live` but members no longer see them; drop the cached
  // member job list so they disappear now, not after the cache TTL.
  await invalidateJobListings().catch(() => {});

  await auditLog({
    actorUserId: user.id,
    action: 'employer_deactivate',
    targetType: 'employer',
    targetId: employerId,
    metadata: { orgId },
  });
  const actorRole = (await isSuperAdmin(user.id)) ? 'super_admin' : 'admin';
  await logAuditEvent({
    user: { id: user.id, role: actorRole },
    verb: 'voided',
    object: { type: 'Employer', id: employerId },
    result: { success: true, extensions: { orgId } },
    request: auditRequestMeta(_request),
    orgId,
  }).catch((err) => console.error('[audit] employer deactivate:', err));

  return NextResponse.json({ ok: true, status: 'inactive' });

  } catch (error) {
    console.error('/admin/employers/[id]/deactivate error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});

