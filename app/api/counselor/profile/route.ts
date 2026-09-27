import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getUser } from '@/lib/auth/server';
import { isCounselor } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';
import { auditLog } from '@/lib/audit';
import { withApiGuc } from '@/lib/db/withRequestGuc';
import { interactiveTransactionsGuaranteed } from '@/lib/db/transactionPolicy';
import { lockBillingMemberLifecycle } from '@/lib/billing/erasureGuard';

/**
 * Counselor Profile (9/2/26, issue 10): counselors — including Community
 * Ambassadors — set up their own profile after accepting their invitation.
 * Only the counselor's own row is ever read or written here.
 */

const profileBody = z.object({
  fullName: z.string().trim().min(2).max(200),
  phone: z.string().trim().max(40).optional().nullable(),
  title: z.string().trim().max(120).optional().nullable(),
});

async function loadOwnCounselorProfile(userId: string) {
  return prisma.$transaction(async (tx) => {
    const counselor = await tx.counselor.findFirst({
      where: { userId, active: true },
      select: {
        id: true,
        title: true,
        affiliation: true,
        partner: { select: { name: true } },
        user: { select: { fullName: true, email: true, phone: true } },
        _count: { select: { assignments: { where: { active: true } } } },
      },
    });
    return counselor;
  });
}

export const GET = withApiGuc(async () => {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!(await isCounselor(user.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const counselor = await loadOwnCounselorProfile(user.id);
    if (!counselor) return NextResponse.json({ error: 'Counselor profile not found' }, { status: 404 });

    return NextResponse.json({
      profile: {
        fullName: counselor.user.fullName ?? '',
        email: counselor.user.email,
        phone: counselor.user.phone ?? '',
        title: counselor.title ?? '',
        affiliation: counselor.affiliation,
        partnerName: counselor.partner?.name ?? null,
        activeAssignments: counselor._count.assignments,
      },
    });
  } catch (error) {
    console.error('/counselor/profile GET:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});

export const PATCH = withApiGuc(async (request: NextRequest) => {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!(await isCounselor(user.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    let json: unknown;
    try {
      json = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }
    const parsed = profileBody.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0]?.message ?? 'Invalid profile' },
        { status: 400 },
      );
    }
    const { fullName, phone, title } = parsed.data;

    const result = await prisma.$transaction(async (tx) => {
      // A send claim takes this lifecycle lock before locking User and
      // Counselor rows. Match that order so profile edits cannot deadlock a
      // claim or update an account after deletion has taken ownership.
      // Preview flattens transactions and disables billing claims; its User
      // update still checks the committed deletion marker below.
      if (interactiveTransactionsGuaranteed()) await lockBillingMemberLifecycle(tx, user.id);
      const own = await tx.counselor.findFirst({
        where: { userId: user.id, active: true },
        select: { id: true },
      });
      if (!own) return { kind: 'missing' as const };
      const updated = await tx.user.updateMany({
        where: { id: user.id, deletedAt: null, billingDeletionPendingAt: null, billingDeletionOperationId: null },
        data: { fullName, phone: phone?.trim() || null },
      });
      if (updated.count !== 1) return { kind: 'inactive' as const };
      await tx.profile.updateMany({
        where: { userId: user.id },
        data: { profilePhone: phone?.trim() || null },
      });
      const counselor = await tx.counselor.update({
        where: { id: own.id },
        data: { title: title?.trim() || null },
        select: { id: true },
      });
      return { kind: 'updated' as const, counselor };
    });
    if (result.kind === 'missing') return NextResponse.json({ error: 'Counselor profile not found' }, { status: 404 });
    if (result.kind === 'inactive') return NextResponse.json({ error: 'Counselor account is being changed or deleted' }, { status: 409 });

    auditLog({
      actorUserId: user.id,
      action: 'counselor_profile_update',
      targetType: 'Counselor',
      targetId: result.counselor.id,
      metadata: { fullName, title: title ?? null },
    }).catch(() => {});

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('/counselor/profile PATCH:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
