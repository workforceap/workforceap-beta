import type { TrainingBillingPacket } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { isAdmin, isSuperAdmin } from '@/lib/auth/roles';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import { canAdminActInSubjectOrganization } from '@/lib/tenant/adminSubjectAccess';
import { parseLineItems, type PacketLineItem } from './packetSchema';
import { resolveProgramTitle } from './packetDocument';
import { parseSignedSnapshot } from './packetSnapshot';

export { resolveProgramTitle } from './packetDocument';

/** Wire shape shared by the admin form, counselor view and member documents page. */
export type BillingPacketSummary = {
  id: string;
  packetNumber: string;
  status: string;
  programSlug: string;
  programTitle: string;
  invoiceDate: string;
  dueDate: string | null;
  billToName: string;
  referenceNumber: string | null;
  totalAmount: number;
  lineItems: PacketLineItem[];
  signerName: string;
  signerTitle: string;
  signedAt: string;
  sentAt: string | null;
  sentTo: string[];
  sendCount: number;
};

export function serializeBillingPacket(row: TrainingBillingPacket, programTitle?: string): BillingPacketSummary {
  return {
    id: row.id,
    packetNumber: row.packetNumber,
    status: row.status,
    programSlug: row.programSlug,
    programTitle: parseSignedSnapshot(row.signedSnapshot)?.programTitle ?? programTitle ?? resolveProgramTitle(row.programSlug),
    invoiceDate: row.invoiceDate.toISOString().slice(0, 10),
    dueDate: row.dueDate ? row.dueDate.toISOString().slice(0, 10) : null,
    billToName: row.billToName,
    referenceNumber: row.referenceNumber,
    totalAmount: row.totalAmount,
    lineItems: parseLineItems(row.lineItems),
    signerName: row.signerName,
    signerTitle: row.signerTitle,
    signedAt: row.signedAt.toISOString(),
    sentAt: row.sentAt ? row.sentAt.toISOString() : null,
    sentTo: row.sentTo,
    sendCount: row.sendCount,
  };
}

export type PacketViewer = 'admin' | 'counselor' | 'member';

export type LoadedPacket = {
  packet: TrainingBillingPacket;
  member: { id: string; fullName: string; email: string; organizationId: string };
  viewer: PacketViewer;
};

export type LoadPacketResult =
  | { ok: true; value: LoadedPacket }
  | { ok: false; status: 403 | 404; error: string };

/**
 * Who may open a packet:
 *  - an admin in the member's organization (super-admins cross tenants),
 *  - the member's assigned, active counselor,
 *  - the member the packet is about.
 * `requireAdmin` narrows to the first group (create/send).
 */
export async function loadPacketForViewer(
  packetId: string,
  userId: string,
  opts: { requireAdmin?: boolean } = {},
): Promise<LoadPacketResult> {
  const packet = await prisma.trainingBillingPacket.findUnique({
    where: { id: packetId },
    include: { member: { select: { id: true, fullName: true, email: true, organizationId: true, deletedAt: true } } },
  });
  if (!packet || packet.member.deletedAt) return { ok: false, status: 404, error: 'Document not found' };
  const member = { id: packet.member.id, fullName: packet.member.fullName, email: packet.member.email, organizationId: packet.member.organizationId };

  if (await isAdmin(userId)) {
    const superAdmin = await isSuperAdmin(userId);
    const actorOrgId = superAdmin ? null : await getActorOrganizationId(userId);
    if (canAdminActInSubjectOrganization({ actorOrgId, subjectOrgId: packet.organizationId, superAdmin })) {
      return { ok: true, value: { packet, member, viewer: 'admin' } };
    }
    return { ok: false, status: 404, error: 'Document not found' };
  }
  if (opts.requireAdmin) return { ok: false, status: 403, error: 'Admin access required' };

  if (packet.memberId === userId) return { ok: true, value: { packet, member, viewer: 'member' } };

  const assignment = await prisma.counselorAssignment.findFirst({
    where: { memberId: packet.memberId, active: true, counselor: { userId, active: true } },
    select: { id: true },
  });
  if (assignment) return { ok: true, value: { packet, member, viewer: 'counselor' } };

  return { ok: false, status: 404, error: 'Document not found' };
}

/** Packets a member may see about themselves. */
export async function listPacketsForMember(memberId: string): Promise<BillingPacketSummary[]> {
  const rows = await prisma.trainingBillingPacket.findMany({
    where: { memberId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  return rows.map((row) => serializeBillingPacket(row));
}

/** The member's active counselor (user row) for the send step; null when unassigned. */
export async function resolveAssignedCounselorContact(memberId: string): Promise<{ userId: string; fullName: string; email: string } | null> {
  const row = await prisma.counselorAssignment.findFirst({
    where: { memberId, active: true, counselor: { active: true } },
    orderBy: { assignedAt: 'desc' },
    select: { counselor: { select: { user: { select: { id: true, fullName: true, email: true } } } } },
  });
  const user = row?.counselor.user;
  return user ? { userId: user.id, fullName: user.fullName, email: user.email } : null;
}
