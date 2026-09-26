import { randomUUID } from 'node:crypto';
import type { Prisma, TrainingBillingPacketSend } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import type { OrganizationBranding } from '@/lib/tenant/organizationBranding';
import { isUniqueViolation } from './packetNumber';

/**
 * Send attempts for J5/J6 packets.
 *
 * Guarantee, stated narrowly: one claim per recipient per attempt (the unique
 * (packet, attempt, recipient) row; a concurrent request loses). Every delivery
 * of a claim uses the key `billing-packet:<packetId>:<attemptNo>:<recipient>`
 * with a payload built only from frozen inputs, so within the provider's
 * 24-hour idempotency window a retry of the same attempt is deduplicated by
 * Resend. After that window, or when Resend rejects a reused key with a
 * changed payload (409), the copy needs operator reconciliation. This is not
 * lifetime exactly-once. A new attempt (new keys) can only start once every
 * row of the current attempt is terminal.
 */

/**
 * Resend keeps idempotency keys for 24 hours
 * (https://resend.com/changelog/idempotency-keys). An unconfirmed copy older
 * than this margin is not retried automatically: the key may have expired.
 */
export const IDEMPOTENCY_SAFE_RETRY_MS = 23 * 60 * 60 * 1000;

/** A claim this fresh is an in-flight send; nobody else may retry or reconcile it. */
export const IN_FLIGHT_GRACE_MS = 2 * 60 * 1000;

export type PacketRecipient = 'student' | 'counselor';

export type SendStatus =
  | 'claimed'
  | 'sent'
  /** Provider or local check definitely did not accept it. */
  | 'rejected_definite'
  /** Outcome unknown (timeout, network, 5xx, 429): retry with the same key within the window. */
  | 'ambiguous'
  | 'needs_reconciliation'
  | 'reconciled_delivered'
  | 'reconciled_not_delivered';

/** Delivered: counts toward completing the attempt. */
export const DELIVERED: ReadonlySet<string> = new Set(['sent', 'reconciled_delivered']);
/** Terminal: a new attempt may start once every row is one of these. */
export const TERMINAL: ReadonlySet<string> = new Set(['sent', 'reconciled_delivered', 'reconciled_not_delivered', 'rejected_definite']);

/** Inputs frozen when an attempt starts, so every retry sends the same payload. */
export type SendAttemptRecord = {
  attemptNo: number;
  startedAt: string;
  startedById: string;
  from: string;
  branding: OrganizationBranding;
  /** Admin cc'd on the counselor copy (their email when the attempt started). */
  ccEmail: string | null;
};

export function sendIdempotencyKey(packetId: string, attemptNo: number, recipient: PacketRecipient): string {
  return `billing-packet:${packetId}:${attemptNo}:${recipient}`;
}

export class SendAttemptCorruptError extends Error {
  constructor() {
    super('The recorded send attempt for this packet is unreadable; it needs operator reconciliation before anything else is sent.');
    this.name = 'SendAttemptCorruptError';
  }
}

/**
 * The current attempt. Null only when no attempt was ever started (both
 * columns null); anything else that does not parse throws, so a corrupted
 * audit state never silently starts a fresh key.
 */
export function parseSendAttempt(value: unknown, attemptNo: number | null): SendAttemptRecord | null {
  if ((value === null || value === undefined) && attemptNo == null) return null;
  const v = (value ?? {}) as Partial<SendAttemptRecord>;
  if (
    attemptNo == null
    || v.attemptNo !== attemptNo
    || typeof v.from !== 'string'
    || typeof v.startedById !== 'string'
    || !v.branding
    || typeof v.branding !== 'object'
    || !(v.ccEmail === null || typeof v.ccEmail === 'string')
  ) {
    throw new SendAttemptCorruptError();
  }
  return v as SendAttemptRecord;
}

export type NextSendAction = 'send' | 'retry' | 'reconcile' | 'email_again' | 'in_progress';

/**
 * What the current attempt needs next, from its rows alone (never from the
 * packet status). Shared by the UI and the server.
 */
export function nextSendAction(args: {
  attemptNo: number | null;
  recipients: PacketRecipient[];
  rows: ReadonlyArray<Pick<TrainingBillingPacketSend, 'recipient' | 'status' | 'lastClaimedAt'>>;
  now: Date;
}): NextSendAction {
  if (args.attemptNo == null) return 'send';
  const rows = args.rows;
  if (rows.some((r) => r.status === 'needs_reconciliation')) return 'reconcile';
  if (rows.some((r) => r.status === 'claimed' && args.now.getTime() - r.lastClaimedAt.getTime() < IN_FLIGHT_GRACE_MS)) return 'in_progress';
  if (rows.some((r) => r.status === 'ambiguous' || r.status === 'claimed')) return 'retry';
  // Every row is terminal now. All delivered, or one definitively not
  // delivered: only a new attempt can send again. Otherwise a copy was never
  // attempted (e.g. an interrupted request), so this attempt continues.
  const allDelivered = args.recipients.every((recipient) => rows.some((r) => r.recipient === recipient && DELIVERED.has(r.status)));
  if (allDelivered || rows.some((r) => !DELIVERED.has(r.status))) return 'email_again';
  return 'send';
}

/**
 * Start attempt N+1 atomically: under a per-packet advisory lock, require the
 * packet to still be on attempt `expectedCurrent` and every row of that
 * attempt to be terminal. Returns null when another request won or the
 * current attempt is not finished.
 */
export async function startSendAttempt(args: {
  packetId: string;
  expectedCurrent: number | null;
  record: Omit<SendAttemptRecord, 'attemptNo'>;
}): Promise<{ ok: true; record: SendAttemptRecord } | { ok: false; reason: 'raced' | 'not_terminal' }> {
  const attemptNo = (args.expectedCurrent ?? 0) + 1;
  const record: SendAttemptRecord = { ...args.record, attemptNo };
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`billing-packet-send:${args.packetId}`}))`;
    if (args.expectedCurrent != null) {
      const rows = await tx.trainingBillingPacketSend.findMany({ where: { packetId: args.packetId, attemptNo: args.expectedCurrent } });
      if (!rows.every((r) => TERMINAL.has(r.status))) return { ok: false as const, reason: 'not_terminal' as const };
    }
    const { count } = await tx.trainingBillingPacket.updateMany({
      where: { id: args.packetId, sendAttemptNo: args.expectedCurrent },
      data: { sendAttemptNo: attemptNo, sendAttempt: record as unknown as Prisma.InputJsonValue },
    });
    return count === 1 ? { ok: true as const, record } : { ok: false as const, reason: 'raced' as const };
  });
}

export type ClaimOutcome =
  | { kind: 'claimed'; row: TrainingBillingPacketSend }
  | { kind: 'done'; row: TrainingBillingPacketSend }
  | { kind: 'in_progress' }
  | { kind: 'terminal_undelivered'; row: TrainingBillingPacketSend }
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
          claimToken: randomUUID(),
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
  if (DELIVERED.has(existing.status)) return { kind: 'done', row: existing };
  if (existing.status === 'needs_reconciliation') return { kind: 'needs_reconciliation', row: existing };
  if (existing.status === 'rejected_definite' || existing.status === 'reconciled_not_delivered') return { kind: 'terminal_undelivered', row: existing };
  if (existing.status === 'claimed' && args.now.getTime() - existing.lastClaimedAt.getTime() < IN_FLIGHT_GRACE_MS) return { kind: 'in_progress' };
  if (args.now.getTime() - existing.claimedAt.getTime() > IDEMPOTENCY_SAFE_RETRY_MS) {
    await transition(existing, 'needs_reconciliation', { lastError: 'The copy was never confirmed and is older than the provider idempotency window.' });
    const row = await prisma.trainingBillingPacketSend.findUnique({ where: { id: existing.id } });
    return { kind: 'needs_reconciliation', row: row ?? existing };
  }
  // Same-key retry of an ambiguous or interrupted send within the window.
  const claimToken = randomUUID();
  const { count } = await prisma.trainingBillingPacketSend.updateMany({
    where: { id: existing.id, status: existing.status, claimToken: existing.claimToken },
    data: { status: 'claimed', claimToken, lastClaimedAt: args.now },
  });
  if (count !== 1) return { kind: 'in_progress' };
  return { kind: 'claimed', row: { ...existing, status: 'claimed', claimToken, lastClaimedAt: args.now } };
}

/**
 * Compare-and-set a claimed row to its outcome. Returns false (and changes
 * nothing) when the row was reconciled or re-claimed meanwhile, so a late
 * result can never overwrite a newer state.
 */
export async function transition(
  row: Pick<TrainingBillingPacketSend, 'id' | 'claimToken' | 'status'>,
  status: Exclude<SendStatus, 'claimed' | 'reconciled_delivered' | 'reconciled_not_delivered'>,
  extra: { lastError?: string | null; sentAt?: Date } = {},
): Promise<boolean> {
  const { count } = await prisma.trainingBillingPacketSend.updateMany({
    where: { id: row.id, status: row.status, claimToken: row.claimToken },
    data: {
      status,
      claimToken: randomUUID(),
      ...(extra.sentAt ? { sentAt: extra.sentAt } : {}),
      ...(extra.lastError !== undefined ? { lastError: extra.lastError?.slice(0, 1000) ?? null } : {}),
    },
  });
  if (count !== 1) console.warn('[billing-packets send] stale outcome ignored', { sendId: row.id, status });
  return count === 1;
}

export type ReconcileResult = 'ok' | 'in_progress' | 'not_reconcilable';

/**
 * Operator reconciliation after checking the provider: record delivered or not
 * delivered, with who, when and a note. Only for rows that need it, or claims
 * past the in-flight window; a fresh claim is refused as "in progress".
 */
export async function reconcileRecipient(args: {
  packetId: string;
  attemptNo: number;
  recipient: PacketRecipient;
  delivered: boolean;
  note: string;
  actorId: string;
  now: Date;
}): Promise<ReconcileResult> {
  const row = await prisma.trainingBillingPacketSend.findUnique({
    where: { packetId_attemptNo_recipient: { packetId: args.packetId, attemptNo: args.attemptNo, recipient: args.recipient } },
  });
  if (!row) return 'not_reconcilable';
  const stale = args.now.getTime() - row.lastClaimedAt.getTime() >= IN_FLIGHT_GRACE_MS;
  if (row.status === 'claimed' && !stale) return 'in_progress';
  if (!['needs_reconciliation', 'ambiguous', 'claimed'].includes(row.status)) return 'not_reconcilable';
  const { count } = await prisma.trainingBillingPacketSend.updateMany({
    where: { id: row.id, status: row.status, claimToken: row.claimToken },
    data: {
      status: args.delivered ? 'reconciled_delivered' : 'reconciled_not_delivered',
      claimToken: randomUUID(),
      reconciledById: args.actorId,
      reconciledAt: args.now,
      reconcileNote: args.note.slice(0, 1000),
      ...(args.delivered ? { sentAt: args.now } : {}),
    },
  });
  return count === 1 ? 'ok' : 'in_progress';
}
