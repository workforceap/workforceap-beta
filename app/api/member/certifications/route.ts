import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { ensureUserInDb } from '@/lib/auth/ensureUser';
import { prisma } from '@/lib/db/prisma';
import { z } from 'zod';

import { withApiGuc } from '@/lib/db/withRequestGuc';

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
    // Re-adding an existing cert only refreshes the date and leaves its
    // review status alone.
    const row = await prisma.$transaction((tx) => tx.userCertification.upsert({
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
      update: {
        // Update earnedAt only when a specific date is provided (manual add)
        ...(earnedAtStr ? { earnedAt } : {}),
      },
      select: { status: true },
    }));
    return NextResponse.json({ success: true, status: row?.status });
  } else {
    await prisma.$transaction((tx) => tx.userCertification.deleteMany({
      where: { userId: user.id, certName },
    }));
  }

  return NextResponse.json({ success: true });

  } catch (error) {
    console.error('/member/certifications error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
export const POST = withApiGuc(_POST);

