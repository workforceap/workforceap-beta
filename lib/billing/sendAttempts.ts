import { randomUUID } from 'node:crypto';
import type { Prisma, TrainingBillingPacketSend } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import type { OrganizationBranding } from '@/lib/tenant/organizationBranding';

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

/**
 * A claim this fresh is an in-flight send: nobody else may take it over for a
 * same-key retry. The provider call itself is bounded by PROVIDER_SEND_TIMEOUT_MS
 * (sendPacket.ts), so a live request cannot still be waiting after this.
 */
export const IN_FLIGHT_GRACE_MS = 2 * 60 * 1000;

/**
 * An operator may only reconcile a still-`claimed` row this long after its
 * last claim: well beyond the provider timeout plus the longest serverless
 * function duration, so no request can still be about to deliver it.
 */
export const RECONCILE_CLAIMED_MIN_AGE_MS = 15 * 60 * 1000;

export type PacketRecipient = 'student' | 'counselor';

/** Packet statuses that may still send. A superseded packet never does. */
export const SENDABLE_PACKET_STATUSES = ['signed', 'sent'] as const;

/** Compare-and-set guard for every packet-level write in the send path. */
export const SENDABLE_PACKET_WHERE: Prisma.TrainingBillingPacketWhereInput = { status: { in: [...SENDABLE_PACKET_STATUSES] }, supersededAt: null };

function isSendable(packet: { status: string; supersededAt: Date | null } | null): boolean {
  return !!packet && (SENDABLE_PACKET_STATUSES as readonly string[]).includes(packet.status) && packet.supersededAt == null;
}

/**
 * Per-packet advisory lock shared by attempt start, every row claim and the
 * supersede transaction (billing-packets POST). Holding it, a caller re-reads
 * the packet and refuses if it was superseded, so no attempt starts and no row
 * is claimed after a supersede commits.
 */
async function lockPacketSends(tx: Prisma.TransactionClient, packetId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`billing-packet-send:${packetId}`}))`;
  return tx.trainingBillingPacket.findUnique({ where: { id: packetId }, select: { status: true, supersededAt: true, sendAttemptNo: true, sendAttempt: true } });
}

export type SendStatus =
  /** Created with the attempt, not claimed yet. */
  | 'pending'
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
/** Outcome not settled yet: claimed/in flight, pending, ambiguous or awaiting reconciliation. */
export const UNSETTLED: ReadonlySet<string> = new Set(['pending', 'claimed', 'ambiguous', 'needs_reconciliation']);
/** Terminal: a new attempt may start once every row is one of these. */
export const TERMINAL: ReadonlySet<string> = new Set(['sent', 'reconciled_delivered', 'reconciled_not_delivered', 'rejected_definite']);

/** Inputs frozen when an attempt starts, so every retry sends the same payload. Recipients are only the student and the counselor (no cc). */
export type SendAttemptRecord = {
  attemptNo: number;
  /**
   * The recipients this attempt is expected to deliver, fixed at creation
   * (student first). A full attempt is every snapshot recipient; "Send to
   * remaining recipients" stores only the ones with no delivered copy yet.
   * The terminal check and completion use this stored set.
   */
  recipients: PacketRecipient[];
  /**
   * Duplicates the operator knowingly approved when starting this attempt
   * ("Email again" with confirmDuplicateTo): per recipient, the exact earlier
   * row ids known delivered at that moment, who confirmed and when. A claim
   * only proceeds past earlier delivered/accepted rows that are listed here.
   */
  acknowledgedDuplicates?: Array<{ recipient: PacketRecipient; sendIds: string[]; confirmedById: string; confirmedAt: string }>;
  startedAt: string;
  startedById: string;
  from: string;
  branding: OrganizationBranding;
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
    || !Array.isArray(v.recipients)
    || v.recipients.length === 0
    || new Set(v.recipients).size !== v.recipients.length
    || !v.recipients.every((r) => r === 'student' || r === 'counselor')
    || (v.acknowledgedDuplicates !== undefined
      && (!Array.isArray(v.acknowledgedDuplicates)
        || !v.acknowledgedDuplicates.every((a) => a && (a.recipient === 'student' || a.recipient === 'counselor') && Array.isArray(a.sendIds) && a.sendIds.every((id) => typeof id === 'string'))))
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
  rows: ReadonlyArray<Pick<TrainingBillingPacketSend, 'recipient' | 'status' | 'lastClaimedAt'> & { providerResultAt?: Date | null }>;
  now: Date;
}): NextSendAction {
  if (args.attemptNo == null) return 'send';
  // A recorded provider acceptance whose status has not caught up yet (e.g.
  // written by the unlocked fallback) reads as sent.
  const rows = args.rows.map((r) => (r.providerResultAt && (r.status === 'claimed' || r.status === 'ambiguous') ? { ...r, status: 'sent' } : r));
  const fresh = (r: (typeof rows)[number]) => args.now.getTime() - r.lastClaimedAt.getTime() < IN_FLIGHT_GRACE_MS;
  if (rows.some((r) => r.status === 'needs_reconciliation')) return 'reconcile';
  if (rows.some((r) => r.status === 'claimed' && fresh(r))) return 'in_progress';
  if (rows.some((r) => r.status === 'ambiguous' || r.status === 'claimed')) return 'retry';
  // Pending or missing rows: this attempt still has copies to send.
  if (!attemptIsTerminal(rows, args.recipients)) return 'send';
  // Every expected copy is terminal (delivered, rejected or recorded not
  // delivered): only a new attempt can send again.
  return 'email_again';
}

/** True when the attempt has exactly the expected recipient rows and every one is terminal. */
export function attemptIsTerminal(
  rows: ReadonlyArray<Pick<TrainingBillingPacketSend, 'recipient' | 'status'> & { providerResultAt?: Date | null }>,
  expected: PacketRecipient[],
): boolean {
  const recipients = rows.map((r) => r.recipient).sort();
  return (
    recipients.length === expected.length
    && [...expected].sort().every((r, i) => recipients[i] === r)
    // A recorded provider acceptance counts as delivered (never as "not
    // delivered"), except while the row is flagged for reconciliation.
    && rows.every((r) => TERMINAL.has(r.status) || (r.providerResultAt != null && r.status !== 'needs_reconciliation'))
  );
}

/** A copy counts as delivered when sent, reconciled delivered, or accepted by the provider (whatever its status). */
export function isDeliveredRow(r: Pick<TrainingBillingPacketSend, 'status'> & { providerResultAt?: Date | null }): boolean {
  return DELIVERED.has(r.status) || r.providerResultAt != null;
}

/**
 * Recipients with a delivered copy in ANY attempt of the packet, deduplicated,
 * with the email and the LATEST delivery time and attempt.
 */
export function deliveredRecipients(
  rows: ReadonlyArray<Pick<TrainingBillingPacketSend, 'recipient' | 'status' | 'sentAt' | 'attemptNo' | 'email'> & { providerResultAt?: Date | null }>,
): Map<PacketRecipient, { at: Date | null; attemptNo: number; email: string }> {
  const out = new Map<PacketRecipient, { at: Date | null; attemptNo: number; email: string }>();
  for (const r of [...rows].sort((a, b) => a.attemptNo - b.attemptNo)) {
    if (!isDeliveredRow(r)) continue;
    out.set(r.recipient as PacketRecipient, { at: r.sentAt ?? r.providerResultAt ?? null, attemptNo: r.attemptNo, email: r.email });
  }
  return out;
}

export type PlannedRecipient = { recipient: PacketRecipient; email: string; cc: string | null };

/**
 * Start attempt N+1 atomically, under a per-packet advisory lock: the packet
 * must still be sendable (not superseded) and on attempt `expectedCurrent`,
 * that attempt must be terminal (exactly its STORED recipient rows, all
 * terminal), and every recipient row of the new attempt is created `pending`
 * in the same transaction, so there is never an empty or partial attempt to
 * race against. The new attempt stores `recipients` as its expected set.
 */
export async function startSendAttempt(args: {
  packetId: string;
  expectedCurrent: number | null;
  recipients: PlannedRecipient[];
  record: Omit<SendAttemptRecord, 'attemptNo' | 'recipients'>;
  now: Date;
  /** Recipients the operator confirmed may get a duplicate copy ("Email again"). */
  confirmedDuplicates?: PacketRecipient[];
}): Promise<{ ok: true; record: SendAttemptRecord } | { ok: false; reason: 'raced' | 'not_terminal' | 'superseded' | 'duplicate' }> {
  const attemptNo = (args.expectedCurrent ?? 0) + 1;
  const order: PacketRecipient[] = ['student', 'counselor'];
  const record: SendAttemptRecord = {
    ...args.record,
    attemptNo,
    recipients: order.filter((r) => args.recipients.some((p) => p.recipient === r)),
  };
  return prisma.$transaction(async (tx) => {
    // Re-read under the lock: the route's earlier status check may be stale.
    const current = await lockPacketSends(tx, args.packetId);
    if (!isSendable(current)) return { ok: false as const, reason: 'superseded' as const };
    if ((current!.sendAttemptNo ?? null) !== (args.expectedCurrent ?? null)) return { ok: false as const, reason: 'raced' as const };
    if (args.expectedCurrent != null) {
      let expected: PacketRecipient[];
      try {
        expected = parseSendAttempt(current!.sendAttempt, current!.sendAttemptNo)!.recipients;
      } catch {
        return { ok: false as const, reason: 'not_terminal' as const };
      }
      const rows = await tx.trainingBillingPacketSend.findMany({ where: { packetId: args.packetId, attemptNo: args.expectedCurrent } });
      if (!attemptIsTerminal(rows, expected)) return { ok: false as const, reason: 'not_terminal' as const };
    }
    if (record.recipients.length === 0) return { ok: false as const, reason: 'not_terminal' as const };
    // Re-read every row under the lock: a recipient whose copy was delivered
    // (including a provider acceptance recorded a moment ago) never gets a new
    // key unless the operator confirmed the duplicate.
    const delivered = deliveredRecipients(await tx.trainingBillingPacketSend.findMany({ where: { packetId: args.packetId } }));
    const confirmed = new Set(args.confirmedDuplicates ?? []);
    if (record.recipients.some((r) => delivered.has(r) && !confirmed.has(r))) return { ok: false as const, reason: 'duplicate' as const };
    // Freeze exactly which earlier copies the operator acknowledged.
    const allRows = await tx.trainingBillingPacketSend.findMany({ where: { packetId: args.packetId } });
    const acknowledged = record.recipients
      .filter((r) => confirmed.has(r) && delivered.has(r))
      .map((r) => ({
        recipient: r,
        sendIds: allRows.filter((row) => row.recipient === r && isDeliveredRow(row)).map((row) => row.id),
        confirmedById: args.record.startedById,
        confirmedAt: args.now.toISOString(),
      }));
    if (acknowledged.length > 0) record.acknowledgedDuplicates = acknowledged;
    const { count } = await tx.trainingBillingPacket.updateMany({
      where: { id: args.packetId, sendAttemptNo: args.expectedCurrent, ...SENDABLE_PACKET_WHERE },
      data: { sendAttemptNo: attemptNo, sendAttempt: record as unknown as Prisma.InputJsonValue },
    });
    if (count !== 1) return { ok: false as const, reason: 'raced' as const };
    for (const r of args.recipients) {
      await tx.trainingBillingPacketSend.create({
        data: {
          packetId: args.packetId,
          attemptNo,
          recipient: r.recipient,
          email: r.email,
          cc: r.cc,
          idempotencyKey: sendIdempotencyKey(args.packetId, attemptNo, r.recipient),
          status: 'pending',
          claimToken: randomUUID(),
          claimedAt: args.now,
          lastClaimedAt: args.now,
        },
      });
    }
    return { ok: true as const, record };
  });
}

export type ClaimOutcome =
  | { kind: 'claimed'; row: TrainingBillingPacketSend }
  | { kind: 'done'; row: TrainingBillingPacketSend }
  | { kind: 'in_progress' }
  | { kind: 'terminal_undelivered'; row: TrainingBillingPacketSend }
  | { kind: 'needs_reconciliation'; row: TrainingBillingPacketSend }
  /** The packet was superseded: nothing is claimed and nothing may be sent. */
  | { kind: 'superseded' }
  /** No row for this recipient in the attempt: operator reconciliation. */
  | { kind: 'missing_row' }
  /**
   * An earlier attempt's copy for this recipient was (or may have been)
   * delivered and this attempt did not acknowledge it: nothing is claimed,
   * and this attempt's row is flagged for reconciliation.
   */
  | { kind: 'prior_copy'; reason: string };

/**
 * Claim one recipient of one attempt, or report why it cannot be sent now.
 * Runs under the packet's send lock and re-reads the packet first, so a claim
 * can never succeed after a supersede commits (the supersede takes the same
 * lock, refuses while a claim is younger than RECONCILE_CLAIMED_MIN_AGE_MS,
 * and closes pending rows in its own transaction). The caller calls the
 * provider immediately after a successful claim, with no other I/O between.
 * `now` should be the time of the claim, not of the request.
 */
export async function claimRecipient(args: {
  packetId: string;
  attemptNo: number;
  recipient: PacketRecipient;
  email: string;
  cc: string | null;
  now: Date;
}): Promise<ClaimOutcome> {
  return prisma.$transaction(async (tx): Promise<ClaimOutcome> => {
    const packet = await lockPacketSends(tx, args.packetId);
    if (!isSendable(packet)) return { kind: 'superseded' };
    const key = { packetId_attemptNo_recipient: { packetId: args.packetId, attemptNo: args.attemptNo, recipient: args.recipient } };
    let existing = await tx.trainingBillingPacketSend.findUnique({ where: key });
    // Every row is created pending when its attempt starts, so a missing row is
    // an inconsistent state: fail closed, never lazily create a claim.
    if (!existing) return { kind: 'missing_row' };
    // A provider acceptance recorded without its status (unlocked fallback):
    // settle it now, under the lock, before anything else.
    if (existing.providerResultAt && !DELIVERED.has(existing.status)) {
      existing = (await applyRecordedProviderResult(existing.id, args.now, tx)) ?? existing;
      if (isDeliveredRow(existing) && existing.status !== 'needs_reconciliation') return { kind: 'done', row: existing };
    }
    // Every EARLIER attempt's row for this recipient, read under the lock and
    // straight from the provider-result columns: a copy that was, or may have
    // been, delivered blocks a new key unless this attempt acknowledged that
    // exact row when it was started.
    let acknowledged = new Set<string>();
    try {
      const attempt = packet!.sendAttemptNo === args.attemptNo ? parseSendAttempt(packet!.sendAttempt, packet!.sendAttemptNo) : null;
      acknowledged = new Set((attempt?.acknowledgedDuplicates ?? []).filter((a) => a.recipient === args.recipient).flatMap((a) => a.sendIds));
    } catch {
      acknowledged = new Set();
    }
    const earlier = (await tx.trainingBillingPacketSend.findMany({ where: { packetId: args.packetId, recipient: args.recipient } }))
      .filter((r) => r.attemptNo < args.attemptNo);
    const blocking = earlier.filter(
      (r) => (r.providerResultAt != null || r.providerMessageId != null || ['claimed', 'ambiguous', 'needs_reconciliation'].includes(r.status)) && !acknowledged.has(r.id),
    );
    if (blocking.length > 0) {
      const reason = `An earlier attempt's ${args.recipient} copy (attempt ${blocking.map((r) => r.attemptNo).join(', ')}) was, or may have been, delivered and this attempt did not acknowledge it. Check the provider for a delivered copy before sending again.`;
      if (!TERMINAL.has(existing.status) && existing.status !== 'needs_reconciliation') {
        await tx.trainingBillingPacketSend.updateMany({
          where: { id: existing.id, status: existing.status, claimToken: existing.claimToken },
          data: { status: 'needs_reconciliation', claimToken: randomUUID(), lastError: reason },
        });
      }
      return { kind: 'prior_copy', reason };
    }
    if (DELIVERED.has(existing.status)) return { kind: 'done', row: existing };
    if (existing.status === 'pending') {
      // First claim: the provider window starts now.
      const claimToken = randomUUID();
      const { count } = await tx.trainingBillingPacketSend.updateMany({
        where: { id: existing.id, status: 'pending', claimToken: existing.claimToken },
        data: { status: 'claimed', claimToken, claimedAt: args.now, lastClaimedAt: args.now },
      });
      if (count !== 1) return { kind: 'in_progress' };
      return { kind: 'claimed', row: { ...existing, status: 'claimed', claimToken, claimedAt: args.now, lastClaimedAt: args.now } };
    }
    if (existing.status === 'needs_reconciliation') return { kind: 'needs_reconciliation', row: existing };
    if (existing.status === 'rejected_definite' || existing.status === 'reconciled_not_delivered') return { kind: 'terminal_undelivered', row: existing };
    if (existing.status === 'claimed' && args.now.getTime() - existing.lastClaimedAt.getTime() < IN_FLIGHT_GRACE_MS) return { kind: 'in_progress' };
    if (args.now.getTime() - existing.claimedAt.getTime() > IDEMPOTENCY_SAFE_RETRY_MS) {
      await transition(existing, 'needs_reconciliation', { lastError: 'The copy was never confirmed and is older than the provider idempotency window.' }, tx);
      const row = await tx.trainingBillingPacketSend.findUnique({ where: { id: existing.id } });
      return { kind: 'needs_reconciliation', row: row ?? existing };
    }
    // Same-key retry of an ambiguous or interrupted send within the window.
    const claimToken = randomUUID();
    const { count } = await tx.trainingBillingPacketSend.updateMany({
      where: { id: existing.id, status: existing.status, claimToken: existing.claimToken },
      data: { status: 'claimed', claimToken, lastClaimedAt: args.now },
    });
    if (count !== 1) return { kind: 'in_progress' };
    return { kind: 'claimed', row: { ...existing, status: 'claimed', claimToken, lastClaimedAt: args.now } };
  });
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
  db: Pick<Prisma.TransactionClient, 'trainingBillingPacketSend'> = prisma,
): Promise<boolean> {
  const { count } = await db.trainingBillingPacketSend.updateMany({
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

export type ReconcileResult = 'ok' | 'in_progress' | 'retry_first' | 'not_reconcilable';

/**
 * Operator reconciliation after checking the provider, recorded with who, when
 * and a note.
 *  - A `claimed` row can only be reconciled RECONCILE_CLAIMED_MIN_AGE_MS after
 *    its last claim ("in progress" before that).
 *  - "Delivered" is allowed for claimed (past that age), ambiguous or
 *    needs_reconciliation rows.
 *  - "Not delivered" is allowed only after the provider idempotency window
 *    (first claim + IDEMPOTENCY_SAFE_RETRY_MS). Within it the only way to
 *    settle an unknown outcome is a same-key Retry, which Resend answers with
 *    one delivery or the original result; so a new key is never unlocked while
 *    the first one could still deliver.
 */
export async function reconcileRecipient(args: {
  packetId: string;
  attemptNo: number;
  recipient: PacketRecipient;
  delivered: boolean;
  note: string;
  actorId: string;
  /** Who reconciled, as shown in the history (the admin's email), frozen at the time. */
  actorLabel: string;
  now: Date;
}): Promise<ReconcileResult> {
  // Under the packet's send lock, like acceptance writes and attempt starts,
  // so an operator outcome and a provider result are strictly ordered.
  return prisma.$transaction(async (tx): Promise<ReconcileResult> => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`billing-packet-send:${args.packetId}`}))`;
    const row = await tx.trainingBillingPacketSend.findUnique({
      where: { packetId_attemptNo_recipient: { packetId: args.packetId, attemptNo: args.attemptNo, recipient: args.recipient } },
    });
    if (!row || !['needs_reconciliation', 'ambiguous', 'claimed'].includes(row.status)) return 'not_reconcilable';
    // The provider already accepted this key: "not delivered" would be false.
    if (!args.delivered && row.providerResultAt) return 'not_reconcilable';
    if (row.status === 'claimed' && args.now.getTime() - row.lastClaimedAt.getTime() < RECONCILE_CLAIMED_MIN_AGE_MS) return 'in_progress';
    if (!args.delivered && args.now.getTime() - row.claimedAt.getTime() <= IDEMPOTENCY_SAFE_RETRY_MS) return 'retry_first';
    const { count } = await tx.trainingBillingPacketSend.updateMany({
      // "Not delivered" also requires that no provider acceptance was recorded
      // meanwhile (recordProviderAcceptance writes it atomically); "delivered"
      // may proceed regardless.
      where: { id: row.id, status: row.status, claimToken: row.claimToken, ...(args.delivered ? {} : { providerResultAt: null }) },
      data: {
        status: args.delivered ? 'reconciled_delivered' : 'reconciled_not_delivered',
        claimToken: randomUUID(),
        reconciledById: args.actorId,
        reconciledByLabel: args.actorLabel.slice(0, 320),
        reconciledAt: args.now,
        reconcileNote: args.note.slice(0, 1000),
        ...(args.delivered ? { sentAt: args.now } : {}),
      },
    });
    return count === 1 ? 'ok' : 'in_progress';
  });
}

type PacketDb = Pick<Prisma.TransactionClient, 'trainingBillingPacket' | 'trainingBillingPacketSend'>;

const RECIPIENT_ORDER: PacketRecipient[] = ['student', 'counselor'];

/**
 * Mark the packet `sent` when every expected copy of `attempt` is delivered,
 * with a compare-and-set on the attempt still being current AND the packet
 * still sendable (never a superseded packet, never an older attempt).
 * `sentTo` is the delivered summary across ALL attempts. Shared by the send
 * route, reconciliation and late provider acceptances.
 */
export async function finalizeAttemptIfComplete(
  db: PacketDb,
  packetId: string,
  attempt: Pick<SendAttemptRecord, 'attemptNo' | 'recipients'>,
): Promise<'completed' | 'incomplete' | 'lost'> {
  const current = await db.trainingBillingPacket.findUnique({ where: { id: packetId } });
  if (!current || !isSendable(current) || current.sendAttemptNo !== attempt.attemptNo) return 'lost';
  const allRows = await db.trainingBillingPacketSend.findMany({ where: { packetId } });
  const delivered = allRows.filter((s) => s.attemptNo === attempt.attemptNo && isDeliveredRow(s));
  if (!attempt.recipients.every((r) => delivered.some((s) => s.recipient === r))) return 'incomplete';
  if (current.status === 'sent' && current.sendCount === attempt.attemptNo) return 'completed';
  const summary = deliveredRecipients(allRows);
  const sentTo = RECIPIENT_ORDER.filter((r) => summary.has(r)).map((r) => summary.get(r)!.email);
  const { count } = await db.trainingBillingPacket.updateMany({
    where: { id: packetId, sendAttemptNo: attempt.attemptNo, ...SENDABLE_PACKET_WHERE },
    data: { status: 'sent', sentAt: new Date(), sendCount: attempt.attemptNo, sentTo },
  });
  return count === 1 ? 'completed' : 'lost';
}

/** After a late acceptance: finalize the packet if that row's attempt is the current one and now complete. */
async function finalizeAfterAcceptance(db: PacketDb, sendId: string): Promise<void> {
  const row = await db.trainingBillingPacketSend.findUnique({ where: { id: sendId } });
  if (!row) return;
  const packet = await db.trainingBillingPacket.findUnique({ where: { id: row.packetId } });
  if (!packet || packet.sendAttemptNo !== row.attemptNo) return;
  let attempt: SendAttemptRecord | null;
  try {
    attempt = parseSendAttempt(packet.sendAttempt, packet.sendAttemptNo);
  } catch {
    return;
  }
  if (attempt) await finalizeAttemptIfComplete(db, row.packetId, attempt);
}

/**
 * Record that the provider ACCEPTED this row's idempotency key. Written once
 * (WHERE provider_result_at IS NULL), keyed on the row id and independent of
 * the status compare-and-set, so an acceptance can never be lost to a racing
 * transition (e.g. the timeout path moving the row to `ambiguous`). The row id
 * already scopes to one key: packet, attempt and recipient. Then the status is
 * brought in line with it (see applyRecordedProviderResult).
 */
export async function recordProviderAcceptance(
  sendId: string,
  result: { messageId: string | null; detail: string; late: boolean },
  now: Date = new Date(),
): Promise<void> {
  const providerResult = JSON.stringify({ at: now.toISOString(), delivered: true, messageId: result.messageId, detail: result.detail.slice(0, 500) });
  const recorded = {
    providerResult,
    providerResultAt: now,
    providerMessageId: result.messageId,
    // A result after the request stopped waiting is also surfaced as a warning.
    ...(result.late ? { lateProviderResult: providerResult } : {}),
  };
  const write = async (db: Pick<Prisma.TransactionClient, 'trainingBillingPacketSend'>) => {
    // One atomic UPDATE records the acceptance AND settles the status when the
    // row is still unsettled.
    const { count } = await db.trainingBillingPacketSend.updateMany({
      where: { id: sendId, providerResultAt: null, status: { in: ['claimed', 'ambiguous', 'needs_reconciliation'] } },
      data: { ...recorded, status: 'sent', sentAt: now, claimToken: randomUUID(), lastError: null },
    });
    if (count === 1) return;
    // Any other status (already delivered, or a recorded "not delivered" /
    // rejection the provider now contradicts): record the result once, then
    // apply the contradiction rules.
    await db.trainingBillingPacketSend.updateMany({ where: { id: sendId, providerResultAt: null }, data: recorded });
    await applyRecordedProviderResult(sendId, now, db);
  };
  const row = await prisma.trainingBillingPacketSend.findUnique({ where: { id: sendId }, select: { packetId: true } });
  if (!row) return;
  try {
    // Under the packet's send lock, so it serializes with startSendAttempt's
    // read-then-create: an acceptance either lands before the start reads the
    // rows (the start then needs a duplicate confirmation) or after the new
    // attempt committed (the old row is flagged for reconciliation). It waits
    // for the lock; it never skips the write.
    await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`billing-packet-send:${row.packetId}`}))`;
        await write(tx);
        await finalizeAfterAcceptance(tx, sendId);
      },
      { maxWait: 10_000, timeout: 60_000 },
    );
  } catch (err) {
    // Never lose an acceptance: if the locked write fails (e.g. a transaction
    // timeout), persist it without the lock. Still write-once and CAS-guarded.
    // Fallback (e.g. lock wait or transaction timeout): persist ONLY the
    // write-once provider-result columns, never the status, so an unlocked
    // write cannot race attempt start or a claim. The claim check reads these
    // columns directly, and the next locked operation (claim) or a read
    // (nextSendAction) settles the status from them.
    console.error('[billing-packets send] locked acceptance write failed; recording the provider result only', { sendId, err });
    await prisma.trainingBillingPacketSend.updateMany({ where: { id: sendId, providerResultAt: null }, data: recorded });
  }
}

/**
 * Bring a row's status in line with a recorded provider acceptance, with a
 * bounded compare-and-set retry across concurrent transitions:
 *  - claimed / ambiguous / needs_reconciliation -> sent;
 *  - reconciled_not_delivered / rejected_definite -> needs_reconciliation with
 *    a warning (the provider contradicts the recorded outcome);
 *  - sent / reconciled_delivered / pending: unchanged.
 * Returns the row as finally read.
 */
export async function applyRecordedProviderResult(
  sendId: string,
  now: Date = new Date(),
  db: Pick<Prisma.TransactionClient, 'trainingBillingPacketSend'> = prisma,
): Promise<TrainingBillingPacketSend | null> {
  for (let i = 0; i < 5; i += 1) {
    const row = await db.trainingBillingPacketSend.findUnique({ where: { id: sendId } });
    if (!row || !row.providerResultAt) return row;
    let data: Prisma.TrainingBillingPacketSendUpdateManyMutationInput | null = null;
    if (['claimed', 'ambiguous', 'needs_reconciliation'].includes(row.status)) {
      data = { status: 'sent', sentAt: row.sentAt ?? now, claimToken: randomUUID(), lastError: null };
    } else if (row.status === 'reconciled_not_delivered' || row.status === 'rejected_definite') {
      data = {
        status: 'needs_reconciliation',
        claimToken: randomUUID(),
        lastError: `The provider reported this copy delivered AFTER it was recorded as ${row.status === 'rejected_definite' ? 'rejected' : 'not delivered'}. Check for a duplicate email.`,
      };
    }
    if (!data) return row;
    const { count } = await db.trainingBillingPacketSend.updateMany({ where: { id: row.id, status: row.status, claimToken: row.claimToken }, data });
    if (count === 1) return db.trainingBillingPacketSend.findUnique({ where: { id: sendId } });
  }
  console.error('[billing-packets send] could not settle a recorded provider acceptance', { sendId });
  return db.trainingBillingPacketSend.findUnique({ where: { id: sendId } });
}

/**
 * A provider result that arrived after the request stopped waiting (timeout).
 * An acceptance goes through recordProviderAcceptance (write-once, never
 * lost). A late error changes no status; it is recorded for audit only.
 */
export async function recordLateProviderResult(
  sendId: string,
  outcome: { delivered: boolean; detail: string; messageId?: string | null },
  now: Date = new Date(),
): Promise<void> {
  console.warn('[billing-packets send] late provider result', { sendId, delivered: outcome.delivered });
  if (outcome.delivered) {
    await recordProviderAcceptance(sendId, { messageId: outcome.messageId ?? null, detail: outcome.detail, late: true }, now);
    return;
  }
  const lateProviderResult = JSON.stringify({ at: now.toISOString(), delivered: false, detail: outcome.detail.slice(0, 500) });
  await prisma.trainingBillingPacketSend.updateMany({ where: { id: sendId }, data: { lateProviderResult } });
}

/**
 * Record an ambiguous outcome (timeout, network, 5xx) for a claimed row without
 * ever overwriting a provider acceptance: if one was recorded (before or while
 * this runs), the row ends `sent`; otherwise `ambiguous`. Returns the final row.
 */
export async function recordAmbiguousOutcome(
  row: Pick<TrainingBillingPacketSend, 'id' | 'claimToken' | 'status'>,
  lastError: string,
): Promise<TrainingBillingPacketSend | null> {
  const before = await prisma.trainingBillingPacketSend.findUnique({ where: { id: row.id } });
  if (!before?.providerResultAt) await transition(row, 'ambiguous', { lastError });
  // An acceptance written between that read and the transition is applied here.
  return applyRecordedProviderResult(row.id);
}

/** Close the attempt's pending rows as definitely not sent (e.g. the student copy was rejected, so the counselor copy never goes). */
export async function closePendingRows(packetId: string, attemptNo: number, reason: string) {
  await prisma.trainingBillingPacketSend.updateMany({
    where: { packetId, attemptNo, status: 'pending' },
    data: { status: 'rejected_definite', lastError: reason, claimToken: randomUUID() },
  });
}
