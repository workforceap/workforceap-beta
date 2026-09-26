import type { TrainingBillingPacket, TrainingBillingPacketSend } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { isAdmin, isSuperAdmin } from '@/lib/auth/roles';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import { canAdminActInSubjectOrganization } from '@/lib/tenant/adminSubjectAccess';
import { parseLineItems, type PacketLineItem } from './packetSchema';
import { resolveProgramTitle } from './packetDocument';
import { parseSignedSnapshot } from './packetSnapshot';
import { deliveredRecipients, nextSendAction, parseSendAttempt, type NextSendAction, type PacketRecipient } from './sendAttempts';

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
  /** Frozen send recipients from the signed snapshot (null for legacy or unreadable snapshots). */
  recipients: { student: string; counselor: string | null } | null;
  /** Supersede audit. `supersededReason`/`supersededById` are for the admin view. */
  supersededAt: string | null;
  supersededReason: string | null;
  supersededById: string | null;
  supersededByPacketId: string | null;
  supersedesPacketId: string | null;
  /**
   * Set when the packet can never be emailed: no signed snapshot (signed
   * before snapshots existed) or an unreadable one. Supersede and re-issue.
   */
  sendBlockedReason: 'legacy_packet' | 'snapshot_corrupt' | null;
  /** Admin view only: the current send attempt's rows and the next allowed action (same rule the send route enforces). */
  sendState: {
    attemptNo: number | null;
    /** The current attempt's expected recipients as stored at creation. */
    attemptRecipients: PacketRecipient[];
    nextAction: NextSendAction;
    rows: Array<{ recipient: string; status: string; lastError: string | null }>;
    /** Snapshot recipients with a delivered copy in any attempt, and when. */
    delivered: Array<{ recipient: PacketRecipient; email: string | null; at: string | null; attemptNo: number }>;
    /** Snapshot recipients with no delivered copy yet ("Send to remaining recipients"). */
    remaining: PacketRecipient[];
    /** Every attempt's per-recipient outcome, oldest first. */
    history: Array<{
      attemptNo: number;
      recipient: string;
      email: string;
      status: string;
      claimedAt: string;
      sentAt: string | null;
      lastError: string | null;
      reconciledAt: string | null;
      reconciledBy: string | null;
      reconcileNote: string | null;
    }>;
    /** Late provider results recorded on any attempt (e.g. delivered after being recorded not delivered). */
    warnings: string[];
  } | null;
};

/** List summaries must not fail on one bad row; the PDF/send routes refuse a corrupt snapshot. */
function readSnapshotForSummary(row: TrainingBillingPacket) {
  try {
    return parseSignedSnapshot(row.signedSnapshot);
  } catch {
    return null;
  }
}

function sendBlockedReasonOf(row: TrainingBillingPacket): BillingPacketSummary['sendBlockedReason'] {
  if (row.signedSnapshot === null || row.signedSnapshot === undefined) return 'legacy_packet';
  try {
    parseSignedSnapshot(row.signedSnapshot);
    return null;
  } catch {
    return 'snapshot_corrupt';
  }
}

function attemptRecipientsOf(row: TrainingBillingPacket, fallback: PacketRecipient[]): PacketRecipient[] {
  try {
    return parseSendAttempt(row.sendAttempt, row.sendAttemptNo)?.recipients ?? fallback;
  } catch {
    return fallback;
  }
}

export function serializeBillingPacket(
  row: TrainingBillingPacket & { sends?: TrainingBillingPacketSend[] },
  programTitle?: string,
): BillingPacketSummary {
  const snapshot = readSnapshotForSummary(row);
  const currentRows = row.sends ? row.sends.filter((s) => s.attemptNo === row.sendAttemptNo) : null;
  const snapshotRecipients: PacketRecipient[] = snapshot?.counselor ? ['student', 'counselor'] : ['student'];
  const recipients = attemptRecipientsOf(row, snapshotRecipients);
  const delivered = row.sends ? deliveredRecipients(row.sends) : new Map<PacketRecipient, { at: Date | null; attemptNo: number; email: string }>();
  return {
    id: row.id,
    packetNumber: row.packetNumber,
    status: row.status,
    programSlug: row.programSlug,
    programTitle: snapshot?.programTitle ?? programTitle ?? resolveProgramTitle(row.programSlug),
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
    recipients: snapshot
      ? { student: snapshot.member.email, counselor: snapshot.counselor ? `${snapshot.counselor.fullName} (${snapshot.counselor.email})` : null }
      : null,
    supersededAt: row.supersededAt ? row.supersededAt.toISOString() : null,
    supersededReason: row.supersededReason,
    supersededById: row.supersededById,
    supersededByPacketId: row.supersededByPacketId,
    supersedesPacketId: row.supersedesPacketId,
    sendBlockedReason: sendBlockedReasonOf(row),
    sendState: currentRows
      ? {
          attemptNo: row.sendAttemptNo,
          attemptRecipients: recipients,
          nextAction: nextSendAction({ attemptNo: row.sendAttemptNo, recipients, rows: currentRows, now: new Date() }),
          rows: currentRows.map((s) => ({ recipient: s.recipient, status: s.status, lastError: s.lastError })),
          delivered: snapshotRecipients
            .filter((r) => delivered.has(r))
            .map((r) => ({
              recipient: r,
              email: delivered.get(r)!.email,
              at: delivered.get(r)?.at ? (delivered.get(r)!.at as Date).toISOString() : null,
              attemptNo: delivered.get(r)!.attemptNo,
            })),
          remaining: snapshotRecipients.filter((r) => !delivered.has(r)),
          history: [...(row.sends ?? [])]
            .sort((a, b) => a.attemptNo - b.attemptNo || (a.recipient === b.recipient ? 0 : a.recipient === 'student' ? -1 : 1))
            .map((s) => ({
              attemptNo: s.attemptNo,
              recipient: s.recipient,
              email: s.email,
              status: s.status,
              claimedAt: s.claimedAt.toISOString(),
              sentAt: s.sentAt ? s.sentAt.toISOString() : null,
              lastError: s.lastError,
              reconciledAt: s.reconciledAt ? s.reconciledAt.toISOString() : null,
              reconciledBy: s.reconciledByLabel ?? null,
              reconcileNote: s.reconcileNote ?? null,
            })),
          warnings: (row.sends ?? [])
            .filter((s) => s.lateProviderResult)
            .map((s) => `Attempt ${s.attemptNo}, ${s.recipient} copy: late provider result recorded (${s.lateProviderResult}).`),
        }
      : null,
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
 *  - the member's assigned, active counselor, and
 *  - the member the packet is about,
 * the last two only once a send could have reached them (packetVisibleTo).
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

  // Members and counselors only see a packet once a send could have reached them.
  const reached = async (viewer: 'member' | 'counselor') =>
    packetVisibleTo(packet, await prisma.trainingBillingPacketSend.findMany({ where: { packetId: packet.id }, select: { recipient: true, status: true } }), viewer);

  if (packet.memberId === userId) {
    return (await reached('member')) ? { ok: true, value: { packet, member, viewer: 'member' } } : { ok: false, status: 404, error: 'Document not found' };
  }

  // The counselor must still be an active counselor, not deleted, and in the
  // packet's organization at read time (an org transfer can leave an
  // assignment active); a stale cross-org assignment grants nothing.
  const assignment = await prisma.counselorAssignment.findFirst({
    where: {
      memberId: packet.memberId,
      active: true,
      counselor: { userId, active: true, user: { organizationId: packet.organizationId, deletedAt: null } },
    },
    select: { id: true },
  });
  if (assignment && (await reached('counselor'))) return { ok: true, value: { packet, member, viewer: 'counselor' } };

  return { ok: false, status: 404, error: 'Document not found' };
}

/** Recipient-copy states where that person did, or might have, received the packet. */
const MAY_HAVE_REACHED = new Set(['sent', 'reconciled_delivered', 'claimed', 'ambiguous', 'needs_reconciliation']);

/**
 * Which recipient copy decides what a non-admin viewer sees: the member sees a
 * packet once the student copy could have reached them; the counselor once the
 * counselor copy could have (or, for a packet signed with no counselor, the
 * student copy). Admins always see every packet (they review before sending).
 */
function visibilityRecipient(row: TrainingBillingPacket, viewer: 'member' | 'counselor'): PacketRecipient {
  if (viewer === 'member') return 'student';
  return readSnapshotForSummary(row)?.counselor ? 'counselor' : 'student';
}

export function packetVisibleTo(
  row: TrainingBillingPacket,
  sends: ReadonlyArray<Pick<TrainingBillingPacketSend, 'recipient' | 'status'>>,
  viewer: 'member' | 'counselor',
): boolean {
  const recipient = visibilityRecipient(row, viewer);
  return sends.some((s) => s.recipient === recipient && MAY_HAVE_REACHED.has(s.status));
}

/**
 * Packets shown to the member, or on the counselor's student page. A packet
 * (current or superseded) appears only once a send attempt could have reached
 * that viewer (see packetVisibleTo); a signed packet that was never sent stays
 * admin-only. Current packets first, then superseded ones (labelled replaced).
 */
export async function listPacketsForMember(memberId: string, viewer: 'member' | 'counselor' = 'member'): Promise<BillingPacketSummary[]> {
  const rows = await prisma.trainingBillingPacket.findMany({
    where: { memberId },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: { sends: { select: { recipient: true, status: true } } },
  });
  const visible = rows.filter((row) => packetVisibleTo(row, row.sends, viewer));
  const ordered = [...visible.filter((r) => r.status !== 'superseded'), ...visible.filter((r) => r.status === 'superseded')];
  return ordered.map(({ sends: _sends, ...row }) => serializeBillingPacket(row));
}

/**
 * The member's active counselor (user row) for signing and sending; null when
 * unassigned. Only a counselor who is active, not deleted and in the given
 * (packet / member) organization counts: a stale cross-org assignment is "no
 * counselor", so signing prints none and a send of a packet signed with that
 * counselor hits the recipient-drift 409.
 */
export async function resolveAssignedCounselorContact(
  memberId: string,
  organizationId: string,
): Promise<{ userId: string; fullName: string; email: string } | null> {
  const row = await prisma.counselorAssignment.findFirst({
    where: { memberId, active: true, counselor: { active: true, user: { organizationId, deletedAt: null } } },
    orderBy: { assignedAt: 'desc' },
    select: { counselor: { select: { user: { select: { id: true, fullName: true, email: true } } } } },
  });
  const user = row?.counselor.user;
  return user ? { userId: user.id, fullName: user.fullName, email: user.email } : null;
}
