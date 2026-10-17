import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getUser } from '@/lib/auth/server';
import { isAdmin } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';
import { withTenantScope, counselorInOrg } from '@/lib/tenant/withTenantScope';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import { withApiGuc } from '@/lib/db/withRequestGuc';
import { auditLog } from '@/lib/audit';
import { WAP_STAFF_COUNSELOR_AFFILIATION } from '@/lib/counselor/autoAssign';
import { assignMemberCounselor } from '@/lib/counselor/assignment';

const patchBody = z.object({
  active: z.boolean(),
  /** Required when deactivating a counselor who still has an active caseload. */
  reassignToCounselorUserId: z.string().uuid().optional().nullable(),
});

type Props = { params: Promise<{ id: string }> };

/**
 * Activate / deactivate a counselor row (reversible). Deactivating removes them
 * from the self-serve assignment pool and unassigned-message notify list.
 * Active caseload must be handed off (or already empty) before deactivate.
 */
async function _PATCH(request: NextRequest, { params }: Props) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!(await isAdmin(user.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { id: counselorId } = await params;
    let json: unknown;
    try {
      json = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }
    const parsed = patchBody.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const orgId = await getActorOrganizationId(user.id);
    const counselor = await withTenantScope(orgId, (db) =>
      db.counselor.findFirst({
        where: { id: counselorId, ...counselorInOrg(orgId) },
        select: {
          id: true,
          userId: true,
          active: true,
          affiliation: true,
          user: { select: { fullName: true, email: true } },
        },
      }),
    );
    if (!counselor) return NextResponse.json({ error: 'Counselor not found' }, { status: 404 });

    if (parsed.data.active === counselor.active) {
      return NextResponse.json({ ok: true, active: counselor.active, unchanged: true });
    }

    if (parsed.data.active) {
      await prisma.counselor.update({
        where: { id: counselor.id },
        data: { active: true },
      });
      void auditLog({
        actorUserId: user.id,
        action: 'admin_counselor_activate',
        targetType: 'counselor',
        targetId: counselor.id,
        metadata: { email: counselor.user.email, affiliation: counselor.affiliation },
      }).catch(() => {});
      return NextResponse.json({ ok: true, active: true });
    }

    // Deactivate path.
    const activeCaseload = await prisma.counselorAssignment.count({
      where: { counselorId: counselor.id, active: true },
    });

    if (
      counselor.affiliation === WAP_STAFF_COUNSELOR_AFFILIATION
    ) {
      const otherActive = await withTenantScope(orgId, (db) =>
        db.counselor.count({
          where: {
            id: { not: counselor.id },
            active: true,
            affiliation: WAP_STAFF_COUNSELOR_AFFILIATION,
            ...counselorInOrg(orgId),
          },
        }),
      );
      if (otherActive === 0) {
        return NextResponse.json(
          {
            error:
              'Cannot deactivate the last active WorkforceAP staff counselor. Assign or activate another WAP staff counselor first.',
          },
          { status: 400 },
        );
      }
    }

    const reassignTo = parsed.data.reassignToCounselorUserId ?? null;
    if (activeCaseload > 0 && !reassignTo) {
      return NextResponse.json(
        {
          error: `Counselor still has ${activeCaseload} active assignment(s). Pass reassignToCounselorUserId to hand them off before deactivating.`,
          activeCaseload,
        },
        { status: 400 },
      );
    }

    if (reassignTo === counselor.userId) {
      return NextResponse.json({ error: 'Cannot reassign caseload to the same counselor' }, { status: 400 });
    }

    const moved = await prisma.$transaction(async (tx) => {
      let handoffs = 0;
      if (reassignTo && activeCaseload > 0) {
        const target = await tx.counselor.findFirst({
          where: {
            userId: reassignTo,
            active: true,
            user: { organizationId: orgId, deletedAt: null },
          },
          select: { userId: true },
        });
        if (!target) throw new Error('Target counselor is not active in this organization.');

        const members = await tx.counselorAssignment.findMany({
          where: { counselorId: counselor.id, active: true },
          select: { memberId: true },
        });
        for (const row of members) {
          await assignMemberCounselor(tx, {
            memberId: row.memberId,
            organizationId: orgId,
            counselorUserId: target.userId,
          });
          handoffs += 1;
        }
      }

      await tx.counselor.update({
        where: { id: counselor.id },
        data: { active: false },
      });
      return handoffs;
    });

    void auditLog({
      actorUserId: user.id,
      action: 'admin_counselor_deactivate',
      targetType: 'counselor',
      targetId: counselor.id,
      metadata: {
        email: counselor.user.email,
        affiliation: counselor.affiliation,
        reassignToCounselorUserId: reassignTo,
        handoffs: moved,
      },
    }).catch(() => {});

    return NextResponse.json({ ok: true, active: false, handoffs: moved });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    if (message.includes('Target counselor') || message.includes('no longer')) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    console.error('/admin/counselors/[id] PATCH error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const PATCH = withApiGuc(_PATCH);
