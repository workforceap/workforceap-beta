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
import { buildPacketEmail, currentEmailFrom, deliverPacketEmail, EmailNotConfiguredError, isIdempotencyConflict } from '@/lib/billing/sendPacket';
import {
  claimRecipient,
  markDeliveredByOperator,
  markFailed,
  markNeedsReconciliation,
  markSent,
  parseSendAttempt,
  sendIdempotencyKey,
  startSendAttempt,
  type PacketRecipient,
  type SendAttemptRecord,
} from '@/lib/billing/sendAttempts';

/**
 * "Email to counselor and student" button. Admin only.
 *
 * Recipients come from the signed snapshot, never from live data; if the
 * member's live counselor assignment no longer matches the one printed on the
 * J6, the send is refused. Each press works on the current send attempt:
 *   - `{}`: send (or retry) the copies of the current attempt that are not
 *     delivered yet; starts attempt 1 on the first press;
 *   - `{ action: 'email_again' }`: explicitly start a new attempt (new keys);
 *   - `{ action: 'mark_delivered', recipient }`: operator reconciliation after
 *     checking the provider dashboard/logs.
 * See lib/billing/sendAttempts.ts for the exact (narrow) delivery guarantee.
 */
type SendBody = { action?: 'send' | 'email_again' | 'mark_delivered'; recipient?: PacketRecipient };

const RECONCILE_HINT =
  'Check the Resend dashboard or logs: if it was delivered, mark it delivered; otherwise start a new attempt with "Email again".';

export const POST = withApiGuc(async (request: Request, { params }: { params: Promise<{ packetId: string }> }) => {
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
    try {
      snapshot = parseSignedSnapshot(packet.signedSnapshot);
    } catch (err) {
      if (err instanceof SignedSnapshotCorruptError) return NextResponse.json({ error: err.message, code: 'snapshot_corrupt' }, { status: 409 });
      throw err;
    }
    if (!snapshot) {
      return NextResponse.json(
        { error: 'This packet was signed before signed snapshots existed, so it cannot be emailed. Create a new signed packet.', code: 'legacy_packet' },
        { status: 409 },
      );
    }

    // The J6 cc line names the counselor assigned at signing; refuse to email
    // anyone else (or to skip someone it names).
    const live = await resolveAssignedCounselorContact(member.id);
    if ((snapshot.counselor?.userId ?? null) !== (live?.userId ?? null)) {
      return NextResponse.json(
        {
          error: 'The counselor assignment changed after this packet was signed, so its J6 cc line is out of date. Create a new signed packet before emailing it.',
          code: 'counselor_changed',
        },
        { status: 409 },
      );
    }

    const now = new Date();
    let attempt = parseSendAttempt(packet.sendAttempt, packet.sendAttemptNo);

    if (action === 'mark_delivered') {
      if (!attempt || (body.recipient !== 'student' && body.recipient !== 'counselor')) {
        return NextResponse.json({ error: 'Nothing to reconcile.' }, { status: 400 });
      }
      const ok = await markDeliveredByOperator({ packetId: packet.id, attemptNo: attempt.attemptNo, recipient: body.recipient, actorId: user.id, now });
      if (!ok) return NextResponse.json({ error: 'That copy has no unconfirmed send to reconcile.' }, { status: 409 });
      void auditLog({
        actorUserId: user.id,
        action: 'admin_billing_packet_send_reconciled',
        targetType: 'training_billing_packet',
        targetId: packet.id,
        metadata: { attemptNo: attempt.attemptNo, recipient: body.recipient, orgId: packet.organizationId },
      }).catch(() => {});
    } else if (action === 'email_again' || !attempt) {
      if (action === 'send' && packet.status === 'sent') {
        return NextResponse.json({ error: 'Already sent. Use "Email again" to send a new copy.' }, { status: 409 });
      }
      const actor = await prisma.user.findUnique({ where: { id: user.id }, select: { email: true } });
      attempt = await startSendAttempt({
        packetId: packet.id,
        expectedCurrent: packet.sendAttemptNo,
        record: {
          startedAt: now.toISOString(),
          startedById: user.id,
          from: currentEmailFrom(),
          branding: await getOrganizationBranding(packet.organizationId),
          ccEmail: actor?.email ?? null,
        },
      });
      if (!attempt) return NextResponse.json({ error: 'Another send of this packet just started. Refresh and try again.', code: 'in_progress' }, { status: 409 });
    }

    const recipients: PacketRecipient[] = snapshot.counselor ? ['student', 'counselor'] : ['student'];
    if (action !== 'mark_delivered') {
      for (const recipient of recipients) {
        const failure = await sendOne({ packet, snapshot, attempt, recipient, now });
        if (failure) return failure;
      }
    }
    return completeIfDelivered(packet.id, attempt.attemptNo, recipients, !snapshot.counselor);
  } catch (error) {
    console.error('[billing-packets send]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});

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
  const claim = await claimRecipient({
    packetId: packet.id,
    attemptNo: attempt.attemptNo,
    recipient,
    email: email.to,
    cc: email.cc ?? null,
    now: args.now,
  });
  const label = recipient === 'student' ? 'student' : 'counselor';
  if (claim.kind === 'done') return null;
  if (claim.kind === 'in_progress') {
    return NextResponse.json({ error: `The ${label} copy is being sent by another request. Wait a moment, then refresh.`, code: 'in_progress', recipient }, { status: 409 });
  }
  if (claim.kind === 'needs_reconciliation') {
    return NextResponse.json(
      { error: `The ${label} copy needs operator reconciliation: ${claim.row.lastError ?? 'its delivery was never confirmed'}. ${RECONCILE_HINT}`, code: 'needs_reconciliation', recipient },
      { status: 409 },
    );
  }
  try {
    await deliverPacketEmail(email, sendIdempotencyKey(packet.id, attempt.attemptNo, recipient));
    await markSent(claim.row.id, new Date());
    return null;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'send error';
    if (isIdempotencyConflict(err)) {
      await markNeedsReconciliation(claim.row.id, `Resend rejected the reused idempotency key (${message})`);
      return NextResponse.json(
        { error: `The ${label} copy needs operator reconciliation: Resend rejected the retry (${message}). ${RECONCILE_HINT}`, code: 'needs_reconciliation', recipient },
        { status: 409 },
      );
    }
    await markFailed(claim.row.id, message);
    if (err instanceof EmailNotConfiguredError) return NextResponse.json({ error: message }, { status: 502 });
    const error = recipient === 'counselor'
      ? `The student copy was sent, but the counselor copy failed (${message}). Press the button again to retry the counselor copy only.`
      : `The student copy failed (${message}); nothing was sent to the counselor. Press the button again to retry.`;
    return NextResponse.json({ error, code: 'send_failed', recipient }, { status: 502 });
  }
}

/** Mark the packet sent once every recipient of the attempt is delivered. */
async function completeIfDelivered(packetId: string, attemptNo: number, recipients: PacketRecipient[], counselorMissing: boolean): Promise<Response> {
  const sends = await prisma.trainingBillingPacketSend.findMany({ where: { packetId, attemptNo } });
  const delivered = sends.filter((s) => s.status === 'sent');
  const complete = recipients.every((r) => delivered.some((s) => s.recipient === r));
  const current = await prisma.trainingBillingPacket.findUnique({ where: { id: packetId } });
  if (!current) return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  if (!complete) {
    return NextResponse.json({ error: 'Not every copy has been delivered yet.', code: 'incomplete', packet: serializeBillingPacket(current) }, { status: 409 });
  }
  const sentTo = Array.from(new Set([...current.sentTo, ...delivered.flatMap((s) => (s.cc ? [s.email, s.cc] : [s.email]))]));
  // Idempotent: sendCount is the number of the attempt that completed.
  const updated = await prisma.trainingBillingPacket.update({
    where: { id: packetId },
    data: { status: 'sent', sentAt: current.status === 'sent' && current.sendCount === attemptNo ? current.sentAt : new Date(), sendCount: attemptNo, sentTo },
  });
  return NextResponse.json({
    ok: true,
    packet: serializeBillingPacket(updated),
    sentTo: delivered.flatMap((s) => (s.cc ? [s.email, s.cc] : [s.email])),
    counselorMissing,
  });
}
