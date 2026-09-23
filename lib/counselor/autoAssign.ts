import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { assignMemberCounselor } from '@/lib/counselor/assignment';
import { createNotification } from '@/lib/notifications/create';
import { hasAdminAccess } from '@/lib/auth/roleAccess';

export const WAP_STAFF_COUNSELOR_AFFILIATION = 'wap_staff' as const;

export type EnsureSelfServeCounselorResult = {
  assigned: boolean;
  counselorUserId: string | null;
  reason:
    | 'assigned'
    | 'already_assigned'
    | 'partner_referred'
    | 'no_counselors'
    | 'member_unavailable'
    | 'staff_account';
};

type CounselorPickClient = {
  counselor: Pick<Prisma.TransactionClient['counselor'], 'findMany'>;
  counselorAssignment: Pick<Prisma.TransactionClient['counselorAssignment'], 'groupBy' | 'findFirst'>;
};

/**
 * Least-loaded active WorkforceAP staff counselor in the org.
 * Ties go to the oldest counselor row so the pick is deterministic.
 * Community ambassadors, partner, and independent counselors stay out of
 * the self-serve pool.
 */
export async function pickLeastLoadedWapCounselor(
  tx: CounselorPickClient,
  organizationId: string,
): Promise<{ counselorId: string; userId: string } | null> {
  const counselors = await tx.counselor.findMany({
    where: {
      active: true,
      affiliation: WAP_STAFF_COUNSELOR_AFFILIATION,
      user: { organizationId, deletedAt: null },
    },
    select: { id: true, userId: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
  if (counselors.length === 0) return null;

  const loads = await tx.counselorAssignment.groupBy({
    by: ['counselorId'],
    where: {
      active: true,
      counselorId: { in: counselors.map((counselor) => counselor.id) },
    },
    _count: { _all: true },
  });
  const countById = new Map(loads.map((row) => [row.counselorId, row._count._all]));

  let best = counselors[0];
  let bestLoad = countById.get(best.id) ?? 0;
  for (const counselor of counselors.slice(1)) {
    const load = countById.get(counselor.id) ?? 0;
    if (load < bestLoad) {
      best = counselor;
      bestLoad = load;
    }
  }
  return { counselorId: best.id, userId: best.userId };
}

async function findActiveAssignment(
  tx: Pick<CounselorPickClient, 'counselorAssignment'>,
  memberId: string,
): Promise<string | null> {
  const existing = await tx.counselorAssignment.findFirst({
    where: { memberId, active: true },
    orderBy: { assignedAt: 'desc' },
    select: { counselor: { select: { userId: true, active: true } } },
  });
  return existing?.counselor?.active ? existing.counselor.userId : null;
}

/**
 * A member who arrived through a partner (has a `PartnerReferral` row) is
 * the partner's caseload, not the WorkforceAP self-serve pool. Owner decision
 * 2026-09-19: "self service are just wap counselors" — partner-referred
 * members are left for the partner (or an explicit admin assignment).
 */
async function hasPartnerReferral(memberId: string): Promise<boolean> {
  const referral = await prisma.partnerReferral.findFirst({
    where: { memberId },
    select: { id: true },
  });
  return referral !== null;
}

/**
 * A staff account (active Counselor row, or admin / super_admin by
 * profiles.role or user_roles) that opens the member inbox is not a member:
 * it must never be put on a counselor's caseload.
 */
async function isStaffAccount(userId: string): Promise<boolean> {
  const [counselor, profile, userRoles] = await Promise.all([
    prisma.counselor.findFirst({ where: { userId, active: true }, select: { id: true } }),
    prisma.profile.findUnique({ where: { userId }, select: { role: true } }),
    prisma.userRole.findMany({ where: { userId }, select: { role: { select: { name: true } } } }),
  ]);
  if (counselor) return true;
  return hasAdminAccess(
    profile?.role ?? '',
    userRoles.map((entry) => entry.role.name),
  );
}

async function notifyNewSelfServeAssignment(input: {
  memberId: string;
  counselorUserId: string;
  threadId: string | null;
}) {
  const [member, counselor] = await Promise.all([
    prisma.user.findUnique({
      where: { id: input.memberId },
      select: { fullName: true, email: true },
    }),
    prisma.user.findUnique({
      where: { id: input.counselorUserId },
      select: { fullName: true },
    }),
  ]);
  const counselorName = counselor?.fullName?.trim() || 'your counselor';
  const memberLabel = member?.fullName?.trim() || member?.email || 'A member';
  await Promise.all([
    createNotification({
      userId: input.memberId,
      type: 'task_assigned',
      title: 'You have a new advisor',
      body: `${counselorName} has been assigned as your career advisor.`,
      data: {
        counselorUserId: input.counselorUserId,
        threadId: input.threadId,
      },
    }),
    createNotification({
      userId: input.counselorUserId,
      type: 'task_assigned',
      title: 'A new member is on your caseload',
      body: `${memberLabel} was assigned to you.`,
      data: {
        memberId: input.memberId,
        link: `/counselor/students/${input.memberId}`,
      },
    }),
  ]);
}

/**
 * Assign a self-serve member with no active counselor to an active WAP staff
 * counselor. Read-only when already assigned, a staff account,
 * partner-referred, or the pool is empty — those paths must not bump
 * `users.updated_at`. The lock + assignMemberCounselor commit only runs when
 * there is someone to assign.
 */
export async function ensureSelfServeCounselorAssigned(input: {
  memberId: string;
  organizationId: string;
}): Promise<EnsureSelfServeCounselorResult> {
  const existingUserId = await findActiveAssignment(prisma, input.memberId);
  if (existingUserId) {
    return {
      assigned: true,
      counselorUserId: existingUserId,
      reason: 'already_assigned',
    };
  }

  if (await isStaffAccount(input.memberId)) {
    return { assigned: false, counselorUserId: null, reason: 'staff_account' };
  }

  if (await hasPartnerReferral(input.memberId)) {
    return { assigned: false, counselorUserId: null, reason: 'partner_referred' };
  }

  const preview = await pickLeastLoadedWapCounselor(prisma, input.organizationId);
  if (!preview) {
    return { assigned: false, counselorUserId: null, reason: 'no_counselors' };
  }

  const result = await prisma.$transaction(async (tx) => {
    const locked = await tx.user.updateMany({
      where: {
        id: input.memberId,
        organizationId: input.organizationId,
        deletedAt: null,
      },
      data: { updatedAt: new Date() },
    });
    if (locked.count !== 1) {
      return { assigned: false, counselorUserId: null, reason: 'member_unavailable' } as const;
    }

    const again = await findActiveAssignment(tx, input.memberId);
    if (again) {
      return {
        assigned: true,
        counselorUserId: again,
        reason: 'already_assigned',
      } as const;
    }

    const pick = await pickLeastLoadedWapCounselor(tx, input.organizationId);
    if (!pick) {
      return { assigned: false, counselorUserId: null, reason: 'no_counselors' } as const;
    }

    const assigned = await assignMemberCounselor(tx, {
      memberId: input.memberId,
      organizationId: input.organizationId,
      counselorUserId: pick.userId,
    });
    return {
      assigned: true,
      counselorUserId: pick.userId,
      reason: 'assigned',
      threadId: assigned.thread.id,
    } as const;
  });

  if (result.reason === 'assigned' && result.counselorUserId) {
    await notifyNewSelfServeAssignment({
      memberId: input.memberId,
      counselorUserId: result.counselorUserId,
      threadId: result.threadId ?? null,
    }).catch(() => {});
  }

  return {
    assigned: result.assigned,
    counselorUserId: result.counselorUserId,
    reason: result.reason,
  };
}
