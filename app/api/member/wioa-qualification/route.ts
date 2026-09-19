import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { getUser } from '@/lib/auth/server';
import { prisma } from '@/lib/db/prisma';
import { ensureAppUserProvisioned } from '@/lib/member/ensureAppUser';
import { computeWioaSignal, parseWioaAnswers, type WioaQualificationSnapshot } from '@/lib/wioa/wioaQualification';
import { sendWioaScreeningNotification } from '@/lib/wioa/wioaNotification';

import { withApiGuc } from '@/lib/db/withRequestGuc';
import { auditLog } from '@/lib/audit';
import { logAuditEvent } from '@/lib/audit/log';
async function _GET() {
  try {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized', errorCode: 'unauthorized' }, { status: 401 });

  const row = await prisma.$transaction((tx) => tx.user.findUnique({
    where: { id: user.id },
    select: { wioaQualificationJson: true },
  }));

  return NextResponse.json({ snapshot: row?.wioaQualificationJson ?? null });

  } catch (error) {
    console.error('/member/wioa-qualification error:', error);
    return NextResponse.json({ error: 'Internal server error', errorCode: 'save_failed' }, { status: 500 });
  }
}
export const GET = withApiGuc(_GET);async function _POST(request: Request) {
  try {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized', errorCode: 'unauthorized' }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON', errorCode: 'invalid_json' }, { status: 400 });
  }

  const answers = parseWioaAnswers(body);
  if (!answers) {
    return NextResponse.json({ error: 'Invalid answers', errorCode: 'invalid_answers' }, { status: 400 });
  }

  const { signal, reasons } = computeWioaSignal(answers);
  const snapshot: WioaQualificationSnapshot = {
    version: 2,
    submittedAt: new Date().toISOString(),
    answers,
    signal,
    reasons,
  };

  // Orphaned Supabase auth users have no app `users` row, so the update below
  // threw P2025 ("Record to update not found"). Provision the row first so the
  // update always targets an existing record (idempotent no-op when present).
  await ensureAppUserProvisioned(user);

  const dbUser = await prisma.$transaction(async (tx) => {
    const current = await tx.user.findUnique({
      where: { id: user.id },
      select: { wioaQualificationJson: true, email: true, fullName: true },
    });
    if (!current) return null;
    const previous = current.wioaQualificationJson;
    // Preserve server-stored ancillary intake fields, never arbitrary request keys.
    const metadata = previous && typeof previous === 'object' && !Array.isArray(previous) ? previous : {};
    const updated = await tx.user.updateMany({
      where: {
        id: user.id,
        // A competing intake write must not be overwritten by this read/merge/write.
        wioaQualificationJson: { equals: previous ?? Prisma.AnyNull },
      },
      data: {
        wioaQualificationJson: { ...metadata, ...snapshot } as Prisma.InputJsonObject,
        wioaReviewStatus: 'pending',
        wioaReviewedAt: null,
        wioaReviewedByUserId: null,
        wioaReviewNotes: null,
      },
    });
    return updated.count === 1 ? current : null;
  });
  if (!dbUser) {
    return NextResponse.json({ error: 'Screening changed. Reload before submitting again.', errorCode: 'conflict' }, { status: 409 });
  }

  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://www.workforceap.org');

  const emailSent = dbUser
    ? await sendWioaScreeningNotification({
        source: 'member_portal',
        contact: {
          fullName: dbUser.fullName || 'WorkforceAP member',
          email: dbUser.email,
        },
        snapshot,
        userId: user.id,
        adminUrl: `${siteUrl}/admin/members/${user.id}`,
      })
    : false;

  auditLog({ actorUserId: user.id, action: 'member.wioaQualification.submit', targetType: 'WioaQualification', targetId: user.id }).catch(() => {});
  logAuditEvent({ user: { id: user.id, role: 'member' }, verb: 'create', object: { type: 'WioaQualification', id: user.id }, result: { success: true } }).catch(() => {});
  return NextResponse.json({ ok: true, snapshot, emailSent });

  } catch (error) {
    console.error('/member/wioa-qualification error:', error);
    return NextResponse.json({ error: 'Internal server error', errorCode: 'save_failed' }, { status: 500 });
  }
}
export const POST = withApiGuc(_POST);
