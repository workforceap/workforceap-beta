import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { requireAdmin, isSuperAdmin } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';
import { withTenantScope } from '@/lib/tenant/withTenantScope';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import { z } from 'zod';
import { auditLog } from '@/lib/audit';
import { auditRequestMeta, logAuditEvent } from '@/lib/audit/log';

import { withApiGuc } from '@/lib/db/withRequestGuc';

const bodySchema = z.object({
  reassignToPartnerId: z.string().uuid().optional().nullable(),
});export const POST = withApiGuc(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  try {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    await requireAdmin(user.id);
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id: partnerId } = await params;
  // Partner is tenant-scoped. Wrap reads + writes so an Org A admin
  // cannot deactivate (or reassign referrals from) an Org B partner.
  const orgId = await getActorOrganizationId(user.id);
  const partner = await withTenantScope(orgId, (db) =>
    db.partner.findFirst({ where: { id: partnerId } }),
  );
  if (!partner) return NextResponse.json({ error: 'Partner not found' }, { status: 404 });

  if (!partner.active) {
    return NextResponse.json({ error: 'Partner is already inactive' }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  const reassignToPartnerId = parsed.success ? parsed.data.reassignToPartnerId : undefined;

  if (reassignToPartnerId) {
    // Target partner must also be in actor's org.
    const target = await withTenantScope(orgId, (db) =>
      db.partner.findFirst({ where: { id: reassignToPartnerId, active: true } }),
    );
    if (!target) {
      return NextResponse.json({ error: 'Invalid or inactive target partner for reassignment' }, { status: 400 });
    }
    if (reassignToPartnerId === partnerId) {
      return NextResponse.json({ error: 'Cannot reassign to the same partner' }, { status: 400 });
    }
  }

  // Set-based move of EVERY referral, keeping each one's original referredAt.
  // assignedPartnerUserId is not carried over: the old assignee belongs to the
  // old partner. A member the target partner already has keeps that row.
  const { moved, skippedExisting } = await prisma.$transaction(async (tx) => {
    let moved = 0;
    let skippedExisting = 0;
    if (reassignToPartnerId) {
      const src = await tx.partnerReferral.findMany({
        where: { partnerId },
        select: { memberId: true, referredAt: true },
      });
      if (src.length > 0) {
        const { count } = await tx.partnerReferral.createMany({
          data: src.map((r) => ({ partnerId: reassignToPartnerId, memberId: r.memberId, referredAt: r.referredAt })),
          skipDuplicates: true,
        });
        moved = count;
        skippedExisting = src.length - count;
        await tx.partnerReferral.deleteMany({ where: { partnerId } });
      }
    }
    await tx.partner.update({
      where: { id: partnerId, organizationId: orgId },
      data: { active: false },
    });
    return { moved, skippedExisting };
  });

  await auditLog({
    actorUserId: user.id,
    action: 'partner_deactivate',
    targetType: 'partner',
    targetId: partnerId,
    metadata: { orgId, reassignToPartnerId, moved, skippedExisting },
  });
  const actorRole = (await isSuperAdmin(user.id)) ? 'super_admin' : 'admin';
  await logAuditEvent({
    user: { id: user.id, role: actorRole },
    verb: 'voided',
    object: { type: 'Partner', id: partnerId },
    result: { success: true, extensions: { reassignToPartnerId, orgId, moved, skippedExisting } },
    request: auditRequestMeta(request),
    orgId,
  }).catch((err) => console.error('[audit] partner deactivate:', err));

  return NextResponse.json({ ok: true, active: false });

  } catch (error) {
    console.error('/admin/partners/[id]/deactivate error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});

