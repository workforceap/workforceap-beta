import { NextResponse } from 'next/server';
import type { TrainingBillingPacket } from '@prisma/client';
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
  nextSendAction,
  UNSETTLED,
  parseSendAttempt,
  reconcileRecipient,
  recordLateProviderResult,
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
 * email or counselor assignment/email no longer match (reconcile still works). Actions (the UI derives which one
 * to offer from the CURRENT attempt's rows via nextSendAction, and so does this
 * route):
 *   - `{}` / `{ action: 'send' }`: start attempt 1, or continue / retry the
 *     current attempt with the same keys;
 *   - `{ action: 'email_again' }`: new attempt with new keys, only once every
 *     row of the current attempt is terminal;
 *   - `{ action: 'reconcile', recipient, delivered, note }`: operator outcome
 *     after checking the provider.
 * Delivery guarantee: see lib/billing/sendAttempts.ts.
 */
type SendBody = {
  action?: 'send' | 'email_again' | 'reconcile';
  recipient?: PacketRecipient;
  delivered?: boolean;
  note?: string;
};

const RECONCILE_HINT =
  'Check the Resend dashboard or logs, then record whether it was delivered (with a note). A new attempt is only possible after that.';

const sameEmail = (a: string | null | undefined, b: string | null | undefined) => (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();

function conflict(error: string, code: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error, code, ...extra }, { status: 409 });
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
      return conflict('This packet was signed before signed snapshots existed, so it cannot be emailed. Create a new signed packet.', 'legacy_packet');
    }

    const now = new Date();
    const recipients: PacketRecipient[] = snapshot.counselor ? ['student', 'counselor'] : ['student'];
    const rowsFor = (attemptNo: number) => prisma.trainingBillingPacketSend.findMany({ where: { packetId: packet.id, attemptNo } });
    const next = attempt
      ? nextSendAction({ attemptNo: attempt.attemptNo, recipients, rows: await rowsFor(attempt.attemptNo), now })
      : 'send';

    if (action === 'reconcile') {
      if (!attempt || (body.recipient !== 'student' && body.recipient !== 'counselor') || typeof body.delivered !== 'boolean') {
        return NextResponse.json({ error: 'Say which copy and whether it was delivered.' }, { status: 400 });
      }
      const note = (body.note ?? '').trim();
      if (note.length < 3) return NextResponse.json({ error: 'Add a short note about what you checked in the provider.' }, { status: 400 });
      const result = await reconcileRecipient({
        packetId: packet.id,
        attemptNo: attempt.attemptNo,
        recipient: body.recipient,
        delivered: body.delivered,
        note,
        actorId: user.id,
        now,
      });
      if (result === 'in_progress') return conflict('That copy may still be sending. It can be reconciled 15 minutes after its last attempt.', 'in_progress');
      if (result === 'retry_first') {
        return conflict(
          "Within the provider's 24-hour idempotency window an unconfirmed copy can only be settled by Retry (same key) or marked delivered; \"not delivered\" can be recorded after the window.",
          'retry_first',
        );
      }
      if (result === 'not_reconcilable') return conflict('That copy has nothing to reconcile.', 'not_reconcilable');
      void auditLog({
        actorUserId: user.id,
        action: 'admin_billing_packet_send_reconciled',
        targetType: 'training_billing_packet',
        targetId: packet.id,
        metadata: { attemptNo: attempt.attemptNo, recipient: body.recipient, delivered: body.delivered, orgId: packet.organizationId },
      }).catch(() => {});
      return respond(packet.id, attempt.attemptNo, recipients, !snapshot.counselor);
    }

    // Everything below sends. A superseded packet never sends again (reconcile above still works).
    if (packet.status === 'superseded') {
      return conflict('This packet was superseded; it cannot be emailed again. Send its replacement instead.', 'superseded_packet');
    }
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
        'The counselor assignment changed after this packet was signed, so its J6 cc line is out of date. Create a new signed packet before emailing it.',
        'counselor_changed',
      );
    }
    if (!sameEmail(member.email, snapshot.member.email) || (snapshot.counselor && !sameEmail(live?.email, snapshot.counselor.email))) {
      return conflict('A recipient email changed since signing. Regenerate and re-sign the packet before emailing it.', 'recipient_changed');
    }

    if (action === 'email_again' || !attempt) {
      if (attempt && next !== 'email_again') {
        return conflict(
          next === 'reconcile'
            ? `The previous send needs reconciliation first. ${RECONCILE_HINT}`
            : 'The previous send is still in progress or can be retried; finish it before starting a new one.',
          'previous_attempt_open',
          { nextAction: next },
        );
      }
      const started = await startSendAttempt({
        packetId: packet.id,
        expectedCurrent: packet.sendAttemptNo,
        now,
        recipients: [
          { recipient: 'student', email: snapshot.member.email, cc: null },
          ...(snapshot.counselor ? [{ recipient: 'counselor' as const, email: snapshot.counselor.email, cc: null }] : []),
        ],
        record: {
          startedAt: now.toISOString(),
          startedById: user.id,
          from: currentEmailFrom(),
          branding: await getOrganizationBranding(packet.organizationId),
        },
      });
      if (!started.ok) {
        return conflict('The previous send is in progress or needs reconciliation, or another send just started.', 'previous_attempt_open');
      }
      attempt = started.record;
    } else if (next === 'email_again') {
      // Nothing left to send in this attempt; a plain press never resends.
      return respond(packet.id, attempt.attemptNo, recipients, !snapshot.counselor);
    } else if (next === 'reconcile') {
      return conflict(`A copy needs operator reconciliation. ${RECONCILE_HINT}`, 'needs_reconciliation');
    } else if (next === 'in_progress') {
      return conflict('A copy is being sent right now. Wait a moment, then refresh.', 'in_progress');
    }

    for (const recipient of recipients) {
      const failure = await sendOne({ packet, snapshot, attempt, recipient, now });
      if (failure) return failure;
    }
    return respond(packet.id, attempt.attemptNo, recipients, !snapshot.counselor);
  } catch (error) {
    console.error('[billing-packets send]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** Claim and deliver one recipient. Returns an error response, or null when this copy is delivered. */
async function sendOne(args: {
  packet: TrainingBillingPacket;
  snapshot: SignedPacketSnapshot;
  attempt: SendAttemptRecord;
  recipient: PacketRecipient;
  now: Date;
}): Promise<Response | null> {
  const { packet, snapshot, attempt, recipient } = args;
  const email = await buildPacketEmail({ packet, snapshot, attempt, recipient });
  const claim = await claimRecipient({ packetId: packet.id, attemptNo: attempt.attemptNo, recipient, email: email.to, cc: null, now: args.now });
  const label = recipient === 'student' ? 'student' : 'counselor';
  if (claim.kind === 'done') return null;
  if (claim.kind === 'in_progress') return conflict(`The ${label} copy is being sent by another request. Wait a moment, then refresh.`, 'in_progress', { recipient });
  if (claim.kind === 'needs_reconciliation') {
    return conflict(`The ${label} copy needs operator reconciliation: ${claim.row.lastError ?? 'its delivery was never confirmed'}. ${RECONCILE_HINT}`, 'needs_reconciliation', { recipient });
  }
  if (claim.kind === 'terminal_undelivered') {
    return conflict(`The ${label} copy of this attempt was not delivered (${claim.row.lastError ?? claim.row.status}). Start a new attempt with "Email again".`, 'attempt_terminal', { recipient });
  }
  try {
    await deliverPacketEmail(email, sendIdempotencyKey(packet.id, attempt.attemptNo, recipient), {
      onLateResult: (outcome) => void recordLateProviderResult(claim.row.id, outcome).catch(() => {}),
    });
    const settled = await transition(claim.row, 'sent', { sentAt: new Date(), lastError: null });
    // Lost the compare-and-set (reconciled meanwhile): record the provider's word, never drop it.
    if (!settled) await recordLateProviderResult(claim.row.id, { delivered: true, detail: 'provider accepted after the row changed' });
    return null;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'send error';
    const kind = classifyDeliveryError(err);
    if (kind === 'idempotency_conflict') {
      await transition(claim.row, 'needs_reconciliation', { lastError: `Resend rejected the reused idempotency key (${message})` });
      return conflict(`The ${label} copy needs operator reconciliation: Resend rejected the retry (${message}). ${RECONCILE_HINT}`, 'needs_reconciliation', { recipient });
    }
    if (kind === 'rejected_definite') {
      await transition(claim.row, 'rejected_definite', { lastError: message });
      if (recipient === 'student') await closePendingRows(packet.id, attempt.attemptNo, 'Not sent: the student copy of this attempt was rejected.');
      const error = recipient === 'counselor'
        ? `The student copy was sent, but the counselor copy was rejected (${message}). Fix the cause, then start a new attempt with "Email again".`
        : `The student copy was rejected (${message}); nothing was sent to the counselor.`;
      return NextResponse.json({ error, code: 'rejected', recipient }, { status: 502 });
    }
    await transition(claim.row, 'ambiguous', { lastError: message });
    const error = recipient === 'counselor'
      ? `The student copy was sent, but the counselor copy did not confirm (${message}). Press Retry to resend the counselor copy with the same key.`
      : `The student copy did not confirm (${message}); nothing was sent to the counselor. Press Retry to resend it with the same key.`;
    return NextResponse.json({ error, code: 'ambiguous', recipient }, { status: 502 });
  }
}

/** Attach the packet's current send state to an error so the UI can offer the right next action. */
async function withPacketState(res: Response, packetId: string): Promise<Response> {
  const body = (await res.clone().json().catch(() => null)) as Record<string, unknown> | null;
  if (body?.packet) return res;
  const row = await prisma.trainingBillingPacket.findUnique({ where: { id: packetId }, include: { sends: true } }).catch(() => null);
  if (!body || !row) return res;
  return NextResponse.json({ ...body, packet: serializeBillingPacket(row) }, { status: res.status });
}

/**
 * Report the attempt; mark the packet sent only when every copy of THIS
 * attempt is delivered and the packet is still on this attempt (an older
 * request finishing after "Email again" never touches the packet).
 */
async function respond(packetId: string, attemptNo: number, recipients: PacketRecipient[], counselorMissing: boolean): Promise<Response> {
  const allSends = await prisma.trainingBillingPacketSend.findMany({ where: { packetId } });
  const sends = allSends.filter((s) => s.attemptNo === attemptNo);
  const delivered = sends.filter((s) => DELIVERED.has(s.status));
  const complete = recipients.every((r) => delivered.some((s) => s.recipient === r));
  const current = await prisma.trainingBillingPacket.findUnique({ where: { id: packetId } });
  if (!current) return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  if (!complete) {
    return conflict('Not every copy has been delivered yet.', 'incomplete', { packet: serializeBillingPacket({ ...current, sends: allSends }) });
  }
  const deliveredTo = delivered.flatMap((s) => (s.cc ? [s.email, s.cc] : [s.email]));
  const alreadyDone = current.status === 'sent' && current.sendCount === attemptNo;
  if (!alreadyDone) {
    const { count } = await prisma.trainingBillingPacket.updateMany({
      where: { id: packetId, sendAttemptNo: attemptNo },
      data: { status: 'sent', sentAt: new Date(), sendCount: attemptNo, sentTo: Array.from(new Set([...current.sentTo, ...deliveredTo])) },
    });
    if (count !== 1) return conflict('A newer send attempt has started; this one was recorded but did not change the packet.', 'superseded');
  }
  const updated = await prisma.trainingBillingPacket.findUnique({ where: { id: packetId } });
  return NextResponse.json({ ok: true, packet: serializeBillingPacket({ ...(updated ?? current), sends: allSends }), sentTo: deliveredTo, counselorMissing });
}
