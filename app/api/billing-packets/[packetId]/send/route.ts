import { NextResponse } from 'next/server';
import type { TrainingBillingPacket, TrainingBillingPacketSend } from '@prisma/client';
import { getUser } from '@/lib/auth/server';
import { prisma } from '@/lib/db/prisma';
import { withApiGuc } from '@/lib/db/withRequestGuc';
import { auditLog } from '@/lib/audit';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import { getOrganizationBranding } from '@/lib/tenant/organizationBranding';
import { loadPacketForViewer, resolveAssignedCounselorContact, serializeBillingPacket } from '@/lib/billing/packetAccess';
import { parseSignedSnapshot, SignedSnapshotCorruptError, type SignedPacketSnapshot } from '@/lib/billing/packetSnapshot';
import { checkBillingProviderOrg } from '@/lib/billing/providerOrg';
import { buildPacketEmail, classifyDeliveryError, currentEmailFrom, deliverPacketEmail } from '@/lib/billing/sendPacket';
import {
  claimRecipient,
  closePendingRows,
  DELIVERED,
  deliveredRecipients,
  isDeliveredRow,
  nextSendAction,
  UNSETTLED,
  parseSendAttempt,
  reconcileRecipient,
  recordAmbiguousOutcome,
  recordLateProviderResult,
  recordProviderAcceptance,
  SENDABLE_PACKET_WHERE,
  SendAttemptCorruptError,
  sendIdempotencyKey,
  startSendAttempt,
  transition,
  type PacketRecipient,
  type SendAttemptRecord,
} from '@/lib/billing/sendAttempts';

/**
 * "Email to counselor and student" button. Admin only.
 *
 * Recipients (student and counselor only; no cc) come from the signed
 * snapshot, never from live data, and a send is refused when the live member
 * email or counselor assignment/email no longer match (reconcile still works).
 * Actions (the UI derives which one to offer from the CURRENT attempt's rows
 * via nextSendAction, and so does this route):
 *   - `{}` / `{ action: 'send' }`: start attempt 1, or continue / retry the
 *     current attempt with the same keys;
 *   - `{ action: 'send_remaining' }`: new attempt to only the recipients with
 *     no delivered copy yet, once every row of the current attempt is terminal;
 *   - `{ action: 'email_again', confirmDuplicateTo }`: new attempt to every
 *     snapshot recipient, same gate; when someone already received a copy,
 *     `confirmDuplicateTo` must list exactly those recipients;
 *   - `{ action: 'reconcile', recipient, delivered, note }`: operator outcome
 *     after checking the provider (also allowed on a superseded packet).
 * Delivery guarantee: see lib/billing/sendAttempts.ts.
 */
type SendBody = {
  action?: 'send' | 'email_again' | 'send_remaining' | 'reconcile';
  recipient?: PacketRecipient;
  delivered?: boolean;
  note?: string;
  confirmDuplicateTo?: unknown;
};

const RECONCILE_HINT =
  'Check the Resend dashboard or logs, then record whether it was delivered (with a note). A new attempt is only possible after that.';

const RECIPIENT_ORDER: PacketRecipient[] = ['student', 'counselor'];

const sameEmail = (a: string | null | undefined, b: string | null | undefined) => (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();

function conflict(error: string, code: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error, code, ...extra }, { status: 409 });
}

function supersededConflict() {
  return conflict('This packet was superseded; it cannot be emailed again. Send its replacement instead.', 'superseded_packet');
}

export const POST = withApiGuc(async (request: Request, context: { params: Promise<{ packetId: string }> }) => {
  const res = await handleSend(request, context);
  // 409/502 only happen after the admin + org checks passed: attach the send state.
  if (res.status === 409 || res.status === 502) return withPacketState(res, (await context.params).packetId);
  return res;
});

async function handleSend(request: Request, { params }: { params: Promise<{ packetId: string }> }): Promise<Response> {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { packetId } = await params;
    if (!/^[0-9a-f-]{36}$/i.test(packetId)) return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    const body = ((await request.json().catch(() => ({}))) ?? {}) as SendBody;
    const action = body.action ?? 'send';

    const loaded = await loadPacketForViewer(packetId, user.id, { requireAdmin: true });
    if (!loaded.ok) return NextResponse.json({ error: loaded.error }, { status: loaded.status });
    const { packet, member } = loaded.value;

    // Provider-org guard on the requesting admin's session org and the packet's org.
    const orgCheck = checkBillingProviderOrg(await getActorOrganizationId(user.id).catch(() => null), packet.organizationId);
    if (!orgCheck.ok) return NextResponse.json({ error: orgCheck.error }, { status: orgCheck.status });

    let snapshot: SignedPacketSnapshot | null;
    let attempt: SendAttemptRecord | null;
    try {
      snapshot = parseSignedSnapshot(packet.signedSnapshot);
      attempt = parseSendAttempt(packet.sendAttempt, packet.sendAttemptNo);
    } catch (err) {
      if (err instanceof SignedSnapshotCorruptError) return conflict(err.message, 'snapshot_corrupt');
      if (err instanceof SendAttemptCorruptError) return conflict(err.message, 'needs_reconciliation');
      throw err;
    }
    if (!snapshot) {
      return conflict('This packet was signed before signed snapshots existed, so it cannot be emailed. Supersede and re-issue it.', 'legacy_packet');
    }

    const now = new Date();
    const snapshotRecipients: PacketRecipient[] = snapshot.counselor ? ['student', 'counselor'] : ['student'];
    const next = attempt
      ? nextSendAction({ attemptNo: attempt.attemptNo, recipients: attempt.recipients, rows: await rowsFor(packet.id, attempt.attemptNo), now })
      : 'send';

    if (action === 'reconcile') {
      if (!attempt || (body.recipient !== 'student' && body.recipient !== 'counselor') || typeof body.delivered !== 'boolean') {
        return NextResponse.json({ error: 'Say which copy and whether it was delivered.' }, { status: 400 });
      }
      const note = (body.note ?? '').trim();
      if (note.length < 3) return NextResponse.json({ error: 'Add a note naming the provider evidence you checked (e.g. the Resend log entry or message id).' }, { status: 400 });
      const result = await reconcileRecipient({
        packetId: packet.id,
        attemptNo: attempt.attemptNo,
        recipient: body.recipient,
        delivered: body.delivered,
        note,
        actorId: user.id,
        actorLabel: user.email ?? user.id,
        now,
      });
      if (result === 'in_progress') return conflict('That copy may still be sending. It can be reconciled 15 minutes after its last attempt.', 'in_progress');
      if (result === 'retry_first') {
        return conflict(
          "Within the provider's 24-hour idempotency window an unconfirmed copy can only be settled by Retry (same key) or marked delivered; \"not delivered\" can be recorded after the window.",
          'retry_first',
        );
      }
      if (result === 'not_reconcilable') return conflict('That copy has nothing to reconcile, or the provider already accepted it.', 'not_reconcilable');
      void auditLog({
        actorUserId: user.id,
        action: 'admin_billing_packet_send_reconciled',
        targetType: 'training_billing_packet',
        targetId: packet.id,
        metadata: { attemptNo: attempt.attemptNo, recipient: body.recipient, delivered: body.delivered, orgId: packet.organizationId },
      }).catch(() => {});
      return reconciliationRecorded(packet.id, attempt, body.recipient, body.delivered);
    }

    // Everything below sends. A superseded packet never sends again (reconcile above still works).
    if (packet.status === 'superseded' || packet.supersededAt) return supersededConflict();
    // A replacement waits until every copy of the packet it replaced is settled.
    if (packet.supersedesPacketId) {
      const prior = await prisma.trainingBillingPacketSend.findMany({ where: { packetId: packet.supersedesPacketId } });
      if (prior.some((r) => UNSETTLED.has(r.status))) {
        return conflict(
          'Settle the replaced packet\'s send first: one of its copies is still unconfirmed. Reconcile it on the replaced packet, then send this one.',
          'prior_packet_unsettled',
        );
      }
    }

    // Recipients are exactly the ones printed at signing; any drift means re-sign.
    const live = await resolveAssignedCounselorContact(member.id);
    if ((snapshot.counselor?.userId ?? null) !== (live?.userId ?? null)) {
      return conflict(
        'The counselor assignment changed after this packet was signed, so its J6 cc line is out of date. Supersede and re-issue it before emailing.',
        'counselor_changed',
      );
    }
    if (!sameEmail(member.email, snapshot.member.email) || (snapshot.counselor && !sameEmail(live?.email, snapshot.counselor.email))) {
      return conflict('A recipient email changed since signing. Supersede and re-issue the packet before emailing it.', 'recipient_changed');
    }

    const newAttempt = !attempt || action === 'email_again' || action === 'send_remaining';
    if (newAttempt) {
      if (attempt && next !== 'email_again') {
        return conflict(
          next === 'reconcile'
            ? `The previous send needs reconciliation first. ${RECONCILE_HINT}`
            : 'The previous send is still in progress or can be retried; finish it before starting a new one.',
          'previous_attempt_open',
          { nextAction: next },
        );
      }
      const delivered = deliveredRecipients(await prisma.trainingBillingPacketSend.findMany({ where: { packetId: packet.id } }));
      let planned = snapshotRecipients;
      let confirmedDuplicates: PacketRecipient[] = [];
      if (attempt && action === 'send_remaining') {
        planned = snapshotRecipients.filter((r) => !delivered.has(r));
        if (planned.length === 0) return conflict('Every recipient already has a delivered copy.', 'nothing_remaining');
      } else if (attempt) {
        const already = snapshotRecipients.filter((r) => delivered.has(r));
        const confirmed = Array.isArray(body.confirmDuplicateTo) ? [...new Set(body.confirmDuplicateTo.map(String))].sort() : [];
        confirmedDuplicates = already;
        if (already.length > 0 && (confirmed.length !== already.length || [...already].sort().some((r, i) => confirmed[i] !== r))) {
          return conflict(
            `${already.map((r) => (r === 'student' ? 'The student' : 'The counselor')).join(' and ')} already received this packet. Confirm the duplicate copy, or use "Send to remaining recipients".`,
            'duplicate_confirmation_required',
            {
              deliveredTo: already.map((r) => ({
                recipient: r,
                email: r === 'student' ? snapshot!.member.email : snapshot!.counselor?.email ?? null,
                at: delivered.get(r)?.at?.toISOString() ?? null,
                attemptNo: delivered.get(r)?.attemptNo ?? null,
              })),
            },
          );
        }
      }
      const started = await startSendAttempt({
        packetId: packet.id,
        expectedCurrent: packet.sendAttemptNo,
        confirmedDuplicates,
        now,
        recipients: planned.map((r) => ({ recipient: r, email: r === 'student' ? snapshot!.member.email : snapshot!.counselor!.email, cc: null })),
        record: {
          startedAt: now.toISOString(),
          startedById: user.id,
          from: currentEmailFrom(),
          branding: await getOrganizationBranding(packet.organizationId),
        },
      });
      if (!started.ok) {
        if (started.reason === 'superseded') return supersededConflict();
        if (started.reason === 'duplicate') {
          return conflict('A recipient of this attempt already has a delivered copy (just recorded). Refresh, then confirm the duplicate or use "Send to remaining recipients".', 'duplicate_confirmation_required');
        }
        return conflict('The previous send is in progress or needs reconciliation, or another send just started.', 'previous_attempt_open');
      }
      attempt = started.record;
    } else if (next === 'email_again') {
      // Nothing left to send in this attempt; a plain press never resends.
      return sendResult(packet.id, attempt!, !snapshot.counselor);
    } else if (next === 'reconcile') {
      return conflict(`A copy needs operator reconciliation. ${RECONCILE_HINT}`, 'needs_reconciliation');
    } else if (next === 'in_progress') {
      return conflict('A copy is being sent right now. Wait a moment, then refresh.', 'in_progress');
    }

    const current = attempt!;
    for (const recipient of RECIPIENT_ORDER.filter((r) => current.recipients.includes(r))) {
      const failure = await sendOne({ packet, snapshot, attempt: current, recipient });
      if (failure) return failure;
    }
    return sendResult(packet.id, current, !snapshot.counselor);
  } catch (error) {
    console.error('[billing-packets send]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

function rowsFor(packetId: string, attemptNo: number) {
  return prisma.trainingBillingPacketSend.findMany({ where: { packetId, attemptNo } });
}

/** Claim and deliver one recipient. Returns an error response, or null when this copy is delivered. */
async function sendOne(args: {
  packet: TrainingBillingPacket;
  snapshot: SignedPacketSnapshot;
  attempt: SendAttemptRecord;
  recipient: PacketRecipient;
}): Promise<Response | null> {
  const { packet, snapshot, attempt, recipient } = args;
  const email = await buildPacketEmail({ packet, snapshot, attempt, recipient });
  // Claim at the moment of claiming (not the request start), so the supersede
  // in-flight margin is measured from here.
  const claim = await claimRecipient({ packetId: packet.id, attemptNo: attempt.attemptNo, recipient, email: email.to, cc: null, now: new Date() });
  const label = recipient === 'student' ? 'student' : 'counselor';
  if (claim.kind === 'superseded') return supersededConflict();
  if (claim.kind === 'missing_row') {
    return conflict(`The ${label} copy has no send record for this attempt. ${RECONCILE_HINT}`, 'needs_reconciliation', { recipient });
  }
  if (claim.kind === 'done') return null;
  if (claim.kind === 'in_progress') return conflict(`The ${label} copy is being sent by another request. Wait a moment, then refresh.`, 'in_progress', { recipient });
  if (claim.kind === 'needs_reconciliation') {
    return conflict(`The ${label} copy needs operator reconciliation: ${claim.row.lastError ?? 'its delivery was never confirmed'}. ${RECONCILE_HINT}`, 'needs_reconciliation', { recipient });
  }
  if (claim.kind === 'terminal_undelivered') {
    return conflict(`The ${label} copy of this attempt was not delivered (${claim.row.lastError ?? claim.row.status}). Start a new attempt.`, 'attempt_terminal', { recipient });
  }
  // No I/O between the committed claim and the provider call.
  let messageId: string | null;
  try {
    ({ messageId } = await deliverPacketEmail(email, sendIdempotencyKey(packet.id, attempt.attemptNo, recipient), {
      onLateResult: (outcome) => void recordLateProviderResult(claim.row.id, outcome).catch(() => {}),
    }));
  } catch (err) {
    return deliveryFailed(claim.row, err, packet.id, attempt.attemptNo, recipient);
  }
  // Written once and applied to the status whatever else happened meanwhile.
  const before = await prisma.trainingBillingPacketSend.findUnique({ where: { id: claim.row.id } });
  const late = !(before?.status === 'claimed' && before.claimToken === claim.row.claimToken);
  await recordProviderAcceptance(claim.row.id, { messageId, detail: 'provider accepted', late });
  const after = await prisma.trainingBillingPacketSend.findUnique({ where: { id: claim.row.id } });
  if (after && DELIVERED.has(after.status)) return null;
  return conflict(
    `The ${label} copy was accepted by the provider, but its record had already changed (${after?.status ?? 'missing'}). ${RECONCILE_HINT}`,
    'needs_reconciliation',
    { recipient },
  );
}

async function deliveryFailed(
  row: TrainingBillingPacketSend,
  err: unknown,
  packetId: string,
  attemptNo: number,
  recipient: PacketRecipient,
): Promise<Response | null> {
  const label = recipient === 'student' ? 'student' : 'counselor';
  const message = err instanceof Error ? err.message : 'send error';
  const kind = classifyDeliveryError(err);
  if (kind === 'idempotency_conflict') {
    await transition(row, 'needs_reconciliation', { lastError: `Resend rejected the reused idempotency key (${message})` });
    return conflict(`The ${label} copy needs operator reconciliation: Resend rejected the retry (${message}). ${RECONCILE_HINT}`, 'needs_reconciliation', { recipient });
  }
  if (kind === 'rejected_definite') {
    await transition(row, 'rejected_definite', { lastError: message });
    if (recipient === 'student') await closePendingRows(packetId, attemptNo, 'Not sent: the student copy of this attempt was rejected.');
    const error = recipient === 'counselor'
      ? `The student copy was sent, but the counselor copy was rejected (${message}). Fix the cause, then use "Send to remaining recipients".`
      : `The student copy was rejected (${message}); nothing was sent to the counselor.`;
    return NextResponse.json({ error, code: 'rejected', recipient }, { status: 502 });
  }
  // Ambiguous (timeout, network, 5xx): never overwrites a recorded acceptance.
  const final = await recordAmbiguousOutcome(row, message);
  if (final && DELIVERED.has(final.status)) return null;
  const error = recipient === 'counselor'
    ? `The student copy was sent, but the counselor copy did not confirm (${message}). Press Retry to resend the counselor copy with the same key.`
    : `The student copy did not confirm (${message}); nothing was sent to the counselor. Press Retry to resend it with the same key.`;
  return NextResponse.json({ error, code: 'ambiguous', recipient }, { status: 502 });
}

/** Attach the packet's current send state to an error so the UI can offer the right next action. */
async function withPacketState(res: Response, packetId: string): Promise<Response> {
  const body = (await res.clone().json().catch(() => null)) as Record<string, unknown> | null;
  if (body?.packet) return res;
  const row = await prisma.trainingBillingPacket.findUnique({ where: { id: packetId }, include: { sends: true } }).catch(() => null);
  if (!body || !row) return res;
  return NextResponse.json({ ...body, packet: serializeBillingPacket(row) }, { status: res.status });
}

const isSupersededRow = (p: { status: string; supersededAt: Date | null }) => p.status === 'superseded' || p.supersededAt != null;

/**
 * Mark the packet sent when every expected copy of THIS attempt is delivered.
 * Compare-and-set on the attempt number AND the packet still being sendable:
 * an older request finishing after "Email again", or a send that ran into a
 * supersede, never changes the packet. Returns false when the CAS lost.
 */
async function completeAttempt(packetId: string, attempt: SendAttemptRecord): Promise<'completed' | 'incomplete' | 'lost'> {
  const current = await prisma.trainingBillingPacket.findUnique({ where: { id: packetId } });
  if (!current || isSupersededRow(current)) return 'lost';
  const allRows = await prisma.trainingBillingPacketSend.findMany({ where: { packetId } });
  const delivered = allRows.filter((s) => s.attemptNo === attempt.attemptNo && isDeliveredRow(s));
  if (!attempt.recipients.every((r) => delivered.some((s) => s.recipient === r))) return 'incomplete';
  if (current.status === 'sent' && current.sendCount === attempt.attemptNo) return 'completed';
  // Everyone who has a copy from ANY attempt (deduplicated, student first),
  // not just this attempt's recipients.
  const summary = deliveredRecipients(allRows);
  const sentTo = RECIPIENT_ORDER.filter((r) => summary.has(r)).map((r) => summary.get(r)!.email);
  const { count } = await prisma.trainingBillingPacket.updateMany({
    where: { id: packetId, sendAttemptNo: attempt.attemptNo, ...SENDABLE_PACKET_WHERE },
    data: { status: 'sent', sentAt: new Date(), sendCount: attempt.attemptNo, sentTo },
  });
  return count === 1 ? 'completed' : 'lost';
}

async function freshPacket(packetId: string) {
  return prisma.trainingBillingPacket.findUnique({ where: { id: packetId }, include: { sends: true } });
}

/** Response for a send action, built from a re-read of the committed rows. */
async function sendResult(packetId: string, attempt: SendAttemptRecord, counselorMissing: boolean): Promise<Response> {
  const outcome = await completeAttempt(packetId, attempt);
  const fresh = await freshPacket(packetId);
  if (!fresh) return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  const summary = serializeBillingPacket(fresh);
  if (outcome === 'lost') {
    // Row results are recorded either way; the packet itself was not changed.
    return isSupersededRow(fresh)
      ? conflict('This packet was superseded while the send was running. Each copy\'s result was recorded; the packet was not changed.', 'superseded_packet', { packet: summary })
      : conflict('A newer send attempt has started; this one was recorded but did not change the packet.', 'superseded', { packet: summary });
  }
  if (outcome === 'incomplete') return conflict('Not every copy has been delivered yet.', 'incomplete', { packet: summary });
  const sentTo = fresh.sends.filter((s) => s.attemptNo === attempt.attemptNo && DELIVERED.has(s.status)).map((s) => s.email);
  return NextResponse.json({ ok: true, kind: 'sent', packet: summary, sentTo, counselorMissing });
}

/**
 * Response for a committed reconciliation: always 200, whether or not the
 * attempt is now complete, built from a re-read of the committed rows. On a
 * superseded packet the packet status never changes; `replacementSendable`
 * says whether the replaced packet still blocks its replacement.
 */
async function reconciliationRecorded(packetId: string, attempt: SendAttemptRecord, recipient: PacketRecipient, delivered: boolean): Promise<Response> {
  await completeAttempt(packetId, attempt);
  const fresh = await freshPacket(packetId);
  if (!fresh) return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  const summary = serializeBillingPacket(fresh);
  const superseded = isSupersededRow(fresh);
  return NextResponse.json({
    ok: true,
    kind: 'reconciliation_recorded',
    outcome: delivered ? 'delivered' : 'not_delivered',
    recipient,
    packet: summary,
    sendState: summary.sendState,
    ...(superseded ? { replacementSendable: !fresh.sends.some((s) => UNSETTLED.has(s.status)) } : {}),
  });
}
