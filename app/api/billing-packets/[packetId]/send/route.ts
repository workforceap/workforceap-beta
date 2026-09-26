import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { prisma } from '@/lib/db/prisma';
import { withApiGuc } from '@/lib/db/withRequestGuc';
import { loadPacketForViewer, resolveAssignedCounselorContact, serializeBillingPacket } from '@/lib/billing/packetAccess';
import { sendBillingPacketEmails } from '@/lib/billing/sendPacket';

/**
 * "Email to counselor and student" button. Admin only. Sends the J5 + J6 PDFs
 * to the member and to their assigned counselor (cc the admin), then records
 * the send on the packet. Re-sending is allowed; each complete send is counted.
 *
 * A packet only becomes `sent` once every required copy went out. When the
 * student copy succeeds but the counselor copy fails, the student address is
 * recorded, the packet stays `signed` and a retry sends the counselor copy only.
 */
export const POST = withApiGuc(async (_request: Request, { params }: { params: Promise<{ packetId: string }> }) => {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { packetId } = await params;
    if (!/^[0-9a-f-]{36}$/i.test(packetId)) return NextResponse.json({ error: 'Document not found' }, { status: 404 });

    const loaded = await loadPacketForViewer(packetId, user.id, { requireAdmin: true });
    if (!loaded.ok) return NextResponse.json({ error: loaded.error }, { status: loaded.status });
    const { packet, member } = loaded.value;

    const [counselor, actor] = await Promise.all([
      resolveAssignedCounselorContact(member.id),
      prisma.user.findUnique({ where: { id: user.id }, select: { email: true } }),
    ]);

    // Retrying an incomplete send: the student copy already went out.
    const studentAlreadySent =
      packet.status !== 'sent' && packet.sentTo.some((email) => email.toLowerCase() === member.email.toLowerCase());
    const result = await sendBillingPacketEmails({ packet, member, counselor, ccEmail: actor?.email ?? null, studentAlreadySent });
    const studentDone = result.studentSent || studentAlreadySent;
    const complete = studentDone && (!counselor || result.counselorSent);
    const sentTo = Array.from(new Set([...packet.sentTo, ...result.sentTo]));

    if (!complete) {
      if (result.sentTo.length > 0) {
        await prisma.trainingBillingPacket.update({ where: { id: packet.id }, data: { sentTo } });
      }
      const reason = result.errors[0] ?? 'Could not send the documents right now.';
      const error = studentDone && packet.status !== 'sent'
        ? `The student copy was sent, but the counselor copy failed (${reason}). Press the button again to retry the counselor copy only.`
        : reason;
      return NextResponse.json({ error, studentSent: result.studentSent, counselorSent: result.counselorSent, warnings: result.errors }, { status: 502 });
    }

    const updated = await prisma.trainingBillingPacket.update({
      where: { id: packet.id },
      data: {
        status: 'sent',
        sentAt: new Date(),
        sendCount: { increment: 1 },
        sentTo,
      },
    });

    return NextResponse.json({
      ok: true,
      packet: serializeBillingPacket(updated),
      sentTo: result.sentTo,
      studentSent: result.studentSent,
      counselorSent: result.counselorSent,
      counselorMissing: !counselor,
      warnings: result.errors,
    });
  } catch (error) {
    console.error('[billing-packets send]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
