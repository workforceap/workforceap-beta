import type { TrainingBillingPacketSend } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import type { OrganizationBranding } from '@/lib/tenant/organizationBranding';
import { isUniqueViolation } from './packetNumber';

/**
 * Send attempts for J5/J6 packets.
 *
 * Guarantee, stated narrowly: one claim per recipient per attempt (the unique
 * (packet, attempt, recipient) row; a concurrent request loses and gets
 * "in progress"). Every delivery of a claim uses the idempotency key
 * `billing-packet:<packetId>:<attemptNo>:<recipient>` with a payload built
 * only from frozen inputs, so within the provider's 24-hour idempotency window
 * a retry of the same attempt is deduplicated by Resend. After that window, or
 * when Resend rejects a reused key with a changed payload (HTTP 409), the
 * recipient needs operator reconciliation. This is not lifetime exactly-once.
 */

/**
 * Resend keeps idempotency keys for 24 hours
 * (https://resend.com/changelog/idempotency-keys). An unconfirmed claim older
 * than this margin is not retried automatically: the key may have expired, so a
 * retry could deliver twice.
 */
export const IDEMPOTENCY_SAFE_RETRY_MS = 23 * 60 * 60 * 1000;

/** A claim this fresh is treated as an in-flight send by another request. */
export const IN_FLIGHT_GRACE_MS = 2 * 60 * 1000;

export type PacketRecipient = 'student' | 'counselor';

/** Inputs frozen when an attempt starts, so every retry sends the same payload. */
export type SendAttemptRecord = {
  attemptNo: number;
  startedAt: string;
  startedById: string;
  from: string;
  branding: OrganizationBranding;
  /** Admin cc'd on the counselor copy (null when none, or when they are the counselor). */
  ccEmail: string | null;
};

export function sendIdempotencyKey(packetId: string, attemptNo: number, recipient: PacketRecipient): string {
  return `billing-packet:${packetId}:${attemptNo}:${recipient}`;
}

export function parseSendAttempt(value: unknown, attemptNo: number | null): SendAttemptRecord | null {
  if (!value || typeof value !== 'object' || attemptNo == null) return null;
  const v = value as Partial<SendAttemptRecord>;
  if (v.attemptNo !== attemptNo || typeof v.from !== 'string' || !v.branding || typeof v.branding !== 'object') return null;
  return v as SendAttemptRecord;
}

/**
 * Start attempt `expectedCurrent + 1`. Conditional on the current attempt
 * number, so two concurrent starts cannot both win.
 */
export async function startSendAttempt(args: {
  packetId: string;
  expectedCurrent: number | null;
  record: Omit<SendAttemptRecord, 'attemptNo'>;
}): Promise<SendAttemptRecord | null> {
  const attemptNo = (args.expectedCurrent ?? 0) + 1;
  const record: SendAttemptRecord = { ...args.record, attemptNo };
  const { count } = await prisma.trainingBillingPacket.updateMany({
    where: { id: args.packetId, sendAttemptNo: args.expectedCurrent },
    data: { sendAttemptNo: attemptNo, sendAttempt: record },
  });
  return count === 1 ? record : null;
}

export type ClaimOutcome =
  | { kind: 'claimed'; row: TrainingBillingPacketSend }
  | { kind: 'done'; row: TrainingBillingPacketSend }
  | { kind: 'in_progress' }
  | { kind: 'needs_reconciliation'; row: TrainingBillingPacketSend };

/** Claim one recipient of one attempt, or report why it cannot be sent now. */
export async function claimRecipient(args: {
  packetId: string;
  attemptNo: number;
  recipient: PacketRecipient;
  email: string;
  cc: string | null;
  now: Date;
}): Promise<ClaimOutcome> {
  const key = { packetId_attemptNo_recipient: { packetId: args.packetId, attemptNo: args.attemptNo, recipient: args.recipient } };
  const existing = await prisma.trainingBillingPacketSend.findUnique({ where: key });
  if (!existing) {
    try {
      const row = await prisma.trainingBillingPacketSend.create({
        data: {
          packetId: args.packetId,
          attemptNo: args.attemptNo,
          recipient: args.recipient,
          email: args.email,
          cc: args.cc,
          idempotencyKey: sendIdempotencyKey(args.packetId, args.attemptNo, args.recipient),
          status: 'claimed',
          claimedAt: args.now,
          lastClaimedAt: args.now,
        },
      });
      return { kind: 'claimed', row };
    } catch (err) {
      if (isUniqueViolation(err)) return { kind: 'in_progress' };
      throw err;
    }
  }
  if (existing.status === 'sent') return { kind: 'done', row: existing };
  if (existing.status === 'needs_reconciliation') return { kind: 'needs_reconciliation', row: existing };
  if (existing.status === 'claimed' && args.now.getTime() - existing.lastClaimedAt.getTime() < IN_FLIGHT_GRACE_MS) {
    return { kind: 'in_progress' };
  }
  if (args.now.getTime() - existing.claimedAt.getTime() > IDEMPOTENCY_SAFE_RETRY_MS) {
    const row = await markNeedsReconciliation(existing.id, 'The last send of this copy is older than the provider idempotency window and was never confirmed.');
    return { kind: 'needs_reconciliation', row };
  }
  // Retry of a failed or interrupted send within the window: take it over,
  // conditional on nobody else having done so since we read it.
  const { count } = await prisma.trainingBillingPacketSend.updateMany({
    where: { id: existing.id, status: existing.status, lastClaimedAt: existing.lastClaimedAt },
    data: { status: 'claimed', lastClaimedAt: args.now },
  });
  if (count !== 1) return { kind: 'in_progress' };
  return { kind: 'claimed', row: { ...existing, status: 'claimed', lastClaimedAt: args.now } };
}

export async function markSent(id: string, now: Date) {
  return prisma.trainingBillingPacketSend.update({ where: { id }, data: { status: 'sent', sentAt: now, lastError: null } });
}

export async function markFailed(id: string, error: string) {
  return prisma.trainingBillingPacketSend.update({ where: { id }, data: { status: 'failed', lastError: error.slice(0, 1000) } });
}

export async function markNeedsReconciliation(id: string, error: string) {
  return prisma.trainingBillingPacketSend.update({ where: { id }, data: { status: 'needs_reconciliation', lastError: error.slice(0, 1000) } });
}

/** Operator reconciliation: staff checked the provider and the copy was delivered. */
export async function markDeliveredByOperator(args: { packetId: string; attemptNo: number; recipient: PacketRecipient; actorId: string; now: Date }) {
  const { count } = await prisma.trainingBillingPacketSend.updateMany({
    where: {
      packetId: args.packetId,
      attemptNo: args.attemptNo,
      recipient: args.recipient,
      status: { in: ['claimed', 'failed', 'needs_reconciliation'] },
    },
    data: { status: 'sent', sentAt: args.now, reconciledById: args.actorId, lastError: null },
  });
  return count === 1;
}

export async function listAttemptSends(packetId: string, attemptNo: number) {
  return prisma.trainingBillingPacketSend.findMany({ where: { packetId, attemptNo }, orderBy: { createdAt: 'asc' } });
}
