import { prisma } from '@/lib/db/prisma';
import { partnerHiddenMemberWhere, type PartnerDataAccess } from '@/lib/partner/dataAccess';

export async function recordEmployerWorkflowEvent(input: {
  employerId: string;
  actorUserId: string;
  kind: string;
  headline: string;
  detail?: string | null;
  entityType?: string | null;
  entityId?: string | null;
}) {
  await prisma.portalWorkflowEvent.create({
    data: {
      scope: 'employer',
      employerId: input.employerId,
      actorUserId: input.actorUserId,
      kind: input.kind,
      headline: input.headline,
      detail: input.detail ?? null,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
    },
  });
}

export async function recordPartnerWorkflowEvent(input: {
  partnerId: string;
  actorUserId: string;
  kind: string;
  headline: string;
  detail?: string | null;
  entityType?: string | null;
  entityId?: string | null;
}) {
  await prisma.portalWorkflowEvent.create({
    data: {
      scope: 'partner',
      partnerId: input.partnerId,
      actorUserId: input.actorUserId,
      kind: input.kind,
      headline: input.headline,
      detail: input.detail ?? null,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
    },
  });
}

export async function listEmployerWorkflowEvents(employerId: string, take = 35) {
  return prisma.portalWorkflowEvent.findMany({
    where: { employerId },
    orderBy: { createdAt: 'desc' },
    take,
    include: { actor: { select: { fullName: true, email: true } } },
  });
}

/**
 * The partner's timeline. With `access`, events whose actor is a member this
 * partner may not see (lib/partner/dataAccess.ts) are left out, so a hidden
 * minor who acted before the write-side guard existed is not named either.
 */
export async function listPartnerWorkflowEvents(partnerId: string, take = 35, access?: PartnerDataAccess) {
  const hiddenActor = access ? partnerHiddenMemberWhere(access) : null;
  return prisma.portalWorkflowEvent.findMany({
    where: hiddenActor ? { partnerId, NOT: [{ actor: { is: hiddenActor } }] } : { partnerId },
    orderBy: { createdAt: 'desc' },
    take,
    include: { actor: { select: { fullName: true, email: true } } },
  });
}
