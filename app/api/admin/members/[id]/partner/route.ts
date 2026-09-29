import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { requireAdmin } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import { sendPartnerNewMemberAssignedEmail } from '@/lib/notifications/partner-notify';
import { z } from 'zod';

import { withApiGuc } from '@/lib/db/withRequestGuc';
import { auditLog } from '@/lib/audit';

const patchSchema = z.object({
  /** Clear with null; empty string from forms coerces to null */
  partnerId: z.preprocess(
    (v) => (v === '' || v === undefined ? null : v),
    z.string().uuid().nullable()
  ),
});

const REFERRAL_PROVENANCE = { partnerId: true, referredAt: true, assignedPartnerUserId: true } as const;

/** What the audit row keeps about a referral this route removed. */
function provenance(r: { partnerId: string; referredAt: Date; assignedPartnerUserId: string | null }) {
  return { partnerId: r.partnerId, referredAt: r.referredAt.toISOString(), assignedPartnerUserId: r.assignedPartnerUserId };
}

export const PATCH = withApiGuc(async (
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) => {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    try {
      await requireAdmin(user.id);
    } catch {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  
    const { id: memberId } = await params;
    const orgId = await getActorOrganizationId(user.id);
    const member = await prisma.$transaction((tx) => tx.user.findFirst({ where: { id: memberId, organizationId: orgId }, select: { id: true, deletedAt: true } }));
    if (!member || member.deletedAt) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    }
  
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }
  
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0]?.message ?? 'Validation failed' }, { status: 400 });
    }
  
    const { partnerId } = parsed.data;
  
    try {
      // Only this org's partners' rows are this admin's to change. A referral
      // to another organization's partner is left untouched.
      const inOrg = { memberId, partner: { organizationId: orgId } };

      if (!partnerId) {
        const removed = await prisma.$transaction(async (tx) => {
          const rows = await tx.partnerReferral.findMany({ where: inOrg, select: REFERRAL_PROVENANCE });
          await tx.partnerReferral.deleteMany({ where: inOrg });
          return rows;
        });
        void auditLog({ actorUserId: user.id, action: 'member_partner_remove', targetType: 'user', targetId: memberId, metadata: { removed: removed.map(provenance) } }).catch(() => {});
        return NextResponse.json({ ok: true });
      }

      const partner = await prisma.$transaction((tx) => tx.partner.findFirst({ where: { id: partnerId, active: true, organizationId: orgId } }));
      if (!partner) {
        return NextResponse.json({ error: 'Invalid or inactive partner' }, { status: 400 });
      }

      // Keep the target row (its referredAt and partner-side assignee) when it
      // already exists; remove only the member's OTHER in-org referrals.
      const result = await prisma.$transaction(async (tx) => {
        const rows = await tx.partnerReferral.findMany({ where: inOrg, select: REFERRAL_PROVENANCE });
        const created = !rows.some((r) => r.partnerId === partnerId);
        if (!created && rows.length === 1) return { unchanged: true as const };
        await tx.partnerReferral.upsert({
          where: { partnerId_memberId: { partnerId, memberId } },
          create: { partnerId, memberId },
          update: {},
        });
        await tx.partnerReferral.deleteMany({ where: { ...inOrg, partnerId: { not: partnerId } } });
        return { unchanged: false as const, created, removed: rows.filter((r) => r.partnerId !== partnerId) };
      });

      if (result.unchanged) {
        return NextResponse.json({ ok: true, unchanged: true });
      }

      if (result.created) {
        try {
          await sendPartnerNewMemberAssignedEmail(memberId, partnerId);
        } catch (notifyErr) {
          console.error('[admin] Partner assignment saved; notification failed:', notifyErr);
        }
      }

      void auditLog({ actorUserId: user.id, action: 'member_partner_assign', targetType: 'user', targetId: memberId, metadata: { partnerId, created: result.created, removed: result.removed.map(provenance) } }).catch(() => {});
      return NextResponse.json({ ok: true });
    } catch (e) {
      // The Prisma text stays in the server log; the client gets one sentence.
      console.error('[admin] PATCH member partner:', e);
      return NextResponse.json({ error: 'Could not update partner assignment.' }, { status: 500 });
    }
  } catch (error) {
    console.error('/admin/members/[id]/partner:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
