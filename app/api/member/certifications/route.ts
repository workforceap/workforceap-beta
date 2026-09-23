import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { ensureUserInDb } from '@/lib/auth/ensureUser';
import { prisma } from '@/lib/db/prisma';
import { z } from 'zod';

import { withApiGuc } from '@/lib/db/withRequestGuc';
import { auditLog } from '@/lib/audit';
import { logAuditEvent } from '@/lib/audit/log';

const toggleSchema = z.object({
  certName: z.string().min(1).max(200),
  earned: z.boolean(),
  earnedAt: z.string().datetime().optional(), // ISO string from manual add form
});async function _GET() {
  try {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const certs = await prisma.$transaction((tx) => tx.userCertification.findMany({
    where: { userId: user.id },
    select: { certName: true, earnedAt: true, status: true },
    take: 100,
  }));

  return NextResponse.json({
    certifications: certs.map((c) => ({ certName: c.certName, earnedAt: c.earnedAt, status: c.status })),
  });

  } catch (error) {
    console.error('/member/certifications error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
export const GET = withApiGuc(_GET);async function _POST(request: Request) {
  try {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await ensureUserInDb(user);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = toggleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? 'Validation failed' }, { status: 400 });
  }

  const { certName, earned, earnedAt: earnedAtStr } = parsed.data;
  // Use the user-provided date if supplied and valid, otherwise default to now
  const earnedAt = earnedAtStr ? new Date(earnedAtStr) : new Date();

  if (earned) {
    // WAP-20: a member typing a certification name is a self-report, not a
    // verified credential. The row is created `pending` and enters the admin
    // review queue (/admin/certifications); the lifecycle event, points,
    // notification and partner milestone fire from the review route on
    // approval (lib/certifications/certificationApproved.ts), never here.
    // Re-adding an existing pending or rejected cert only refreshes the date
    // and leaves its review status alone.
    //
    // A verified (`approved`) cert stays verified (Mike, 2026-09-23 02:39
    // UTC): re-adding it changes nothing (not the date, name, status or
    // review fields), and an attempt to re-date it is recorded in the audit
    // log. Same rule as the file-attach route (./upload/route.ts).
    const outcome = await prisma.$transaction(async (tx) => {
      const existing = await tx.userCertification.findUnique({
        where: { userId_certName: { userId: user.id, certName } },
        select: { id: true, certName: true, status: true, earnedAt: true },
      });
      if (existing?.status === 'approved') {
        return { kind: 'verified' as const, cert: existing };
      }
      if (existing) {
        if (earnedAtStr) {
          // Guarded on status so a row approved in the meantime is not re-dated.
          await tx.userCertification.updateMany({
            where: { id: existing.id, userId: user.id, status: { not: 'approved' } },
            data: { earnedAt },
          });
        }
        return { kind: 'saved' as const, status: existing.status };
      }
      const row = await tx.userCertification.upsert({
        where: {
          userId_certName: { userId: user.id, certName },
        },
        create: {
          userId: user.id,
          certName,
          earnedAt,
          status: 'pending',
          submittedAt: new Date(),
        },
        update: {},
        select: { status: true },
      });
      return { kind: 'saved' as const, status: row?.status };
    });

    if (outcome.kind === 'verified') {
      const { cert } = outcome;
      if (earnedAtStr && earnedAt.getTime() !== cert.earnedAt.getTime()) {
        const keptEarnedAt = cert.earnedAt.toISOString();
        const requestedEarnedAt = earnedAt.toISOString();
        void auditLog({
          actorUserId: user.id,
          action: 'member.certification.redate_blocked_verified',
          targetType: 'user_certification',
          targetId: cert.id,
          metadata: { certName: cert.certName, status: 'approved', keptEarnedAt, requestedEarnedAt },
        }).catch(() => {});
        void logAuditEvent({
          user: { id: user.id, role: 'member' },
          verb: 'update',
          object: { type: 'UserCertification', id: cert.id },
          result: {
            success: false,
            extensions: { field: 'earnedAt', status: 'approved', statusKept: true, keptEarnedAt, requestedEarnedAt },
          },
        }).catch(() => {});
      }
      return NextResponse.json({ success: true, status: 'approved', verifiedUnchanged: true });
    }
    return NextResponse.json({ success: true, status: outcome.status });
  } else {
    const { count } = await prisma.$transaction((tx) => tx.userCertification.deleteMany({
      where: { userId: user.id, certName },
    }));
    if (count > 0) {
      void auditLog({ actorUserId: user.id, action: 'member.certification.deleted', targetType: 'user_certification', metadata: { certName } }).catch(() => {});
    }
  }

  return NextResponse.json({ success: true });

  } catch (error) {
    console.error('/member/certifications error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
export const POST = withApiGuc(_POST);

