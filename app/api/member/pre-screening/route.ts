import { after, NextResponse } from 'next/server';
import { z } from 'zod';
import { getUser } from '@/lib/auth/server';
import { prisma } from '@/lib/db/prisma';
import { sendPreScreeningReadyEmail } from '@/lib/email';

import { withApiGuc } from '@/lib/db/withRequestGuc';
import { auditLog } from '@/lib/audit';
import { logAuditEvent } from '@/lib/audit/log';

const schema = z.object({
  employmentStatus: z.enum(['Employed', 'Unemployed', 'Underemployed', 'Student']),
  primaryGoal: z.enum(['New career', 'Promotion', 'Certification', 'Exploring options']),
  weeklyHours: z.enum(['<5 hrs', '5-10 hrs', '10-20 hrs', '20+ hrs']),
  barrier: z.string().trim().min(1).max(200),
  hearAbout: z.string().trim().min(1).max(200),
  hearAboutOther: z.string().trim().max(200).optional().nullable(),
  workforceAssistance: z.boolean(),
  phone: z.string().trim().min(10).max(50),
  address: z.string().trim().min(5).max(500),
});

async function _GET() {
  try {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const row = await prisma.$transaction((tx) => tx.preScreeningResponse.findUnique({
    where: { userId: user.id },
  }));
  return NextResponse.json({ response: row });

  } catch (error) {
    console.error('/member/pre-screening error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
export const GET = withApiGuc(_GET);

async function _POST(request: Request) {
  try {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const dbUser = await prisma.$transaction((tx) => tx.user.findUnique({
    where: { id: user.id },
    select: { assessmentCompleted: true, organizationId: true },
  }));
  if (!dbUser) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }
  if (!dbUser.assessmentCompleted) {
    return NextResponse.json({ error: 'Complete your assessment first.' }, { status: 400 });
  }

  const loadSubmitted = () => prisma.$transaction((tx) => tx.preScreeningResponse.findUnique({
    where: { userId: user.id },
    select: {
      employmentStatus: true,
      primaryGoal: true,
      weeklyHours: true,
      barrier: true,
      hearAbout: true,
      hearAboutOther: true,
      workforceAssistance: true,
      user: { select: { phone: true, profile: { select: { profileAddress: true } } } },
    },
  }));
  const existing = await loadSubmitted();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? 'Validation failed' }, { status: 400 });
  }

  // The response is immutable after submission. A lost HTTP response can be
  // retried only with the same normalized answers and currently saved contact
  // details; staff/member contact edits conservatively require a refresh.
  const acknowledgeSubmitted = (row: NonNullable<typeof existing>) => {
    const same = row.employmentStatus === parsed.data.employmentStatus
      && row.primaryGoal === parsed.data.primaryGoal
      && row.weeklyHours === parsed.data.weeklyHours
      && row.barrier === parsed.data.barrier
      && row.hearAbout === parsed.data.hearAbout
      && row.hearAboutOther === (parsed.data.hearAboutOther ?? null)
      && row.workforceAssistance === parsed.data.workforceAssistance
      && row.user.phone === parsed.data.phone
      && row.user.profile?.profileAddress === parsed.data.address;
    return same
      ? NextResponse.json({ ok: true, alreadySubmitted: true })
      : NextResponse.json({ error: 'Pre-screening already submitted.' }, { status: 400 });
  };
  if (existing) return acknowledgeSubmitted(existing);

  const organizationId = dbUser.organizationId;

  let responseInsertRace = false;
  try {
    await prisma.$transaction(async (tx) => {
      await tx.preScreeningDraft.deleteMany({ where: { userId: user.id } });
      await tx.preScreeningResponse.create({
        data: {
          userId: user.id,
          organizationId,
          employmentStatus: parsed.data.employmentStatus,
          primaryGoal: parsed.data.primaryGoal,
          weeklyHours: parsed.data.weeklyHours,
          barrier: parsed.data.barrier,
          hearAbout: parsed.data.hearAbout,
          hearAboutOther: parsed.data.hearAboutOther ?? null,
          workforceAssistance: parsed.data.workforceAssistance,
        },
      }).catch((error: unknown) => {
        const known = error as { code?: string; meta?: { target?: unknown } } | null;
        const target = known?.meta?.target;
        responseInsertRace = known?.code === 'P2002'
          && Array.isArray(target) && target.length === 1
          && (target[0] === 'user_id' || target[0] === 'userId');
        throw error;
      });
      await tx.user.update({
        where: { id: user.id },
        data: {
          phone: parsed.data.phone,
          interviewEligible: true,
        },
      });
      await tx.profile.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          profilePhone: parsed.data.phone,
          profileAddress: parsed.data.address,
        },
        update: {
          profilePhone: parsed.data.phone,
          profileAddress: parsed.data.address,
        },
      });
    });
  } catch (error) {
    // A concurrent insert commits before PostgreSQL releases its unique-key
    // conflict. Re-read after our transaction rolled back, and acknowledge
    // only the same member's matching response. Other failures stay failures.
    if (!responseInsertRace) throw error;
    const submitted = await loadSubmitted();
    if (!submitted) throw error;
    return acknowledgeSubmitted(submitted);
  }

  const dbAfter = await prisma.$transaction((tx) => tx.user.findUnique({
    where: { id: user.id },
    select: { fullName: true, email: true },
  }));

  // `after()` so Vercel does not freeze before Resend finishes the admin alert.
  after(() =>
    sendPreScreeningReadyEmail({
      memberName: dbAfter?.fullName ?? undefined,
      memberEmail: dbAfter?.email ?? user.email ?? '',
      goal: parsed.data.primaryGoal,
      weeklyHours: parsed.data.weeklyHours,
      barrierSummary: parsed.data.barrier.slice(0, 120),
      memberId: user.id,
    }).catch((err) => console.error('Pre-screening admin email failed:', err))
  );

  auditLog({ actorUserId: user.id, action: 'member.preScreening.submit', targetType: 'PreScreening', targetId: user.id }).catch(() => {});
  logAuditEvent({ user: { id: user.id, role: 'member' }, verb: 'create', object: { type: 'PreScreening', id: user.id }, result: { success: true } }).catch(() => {});
  return NextResponse.json({ ok: true });

  } catch (error) {
    console.error('/member/pre-screening error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
export const POST = withApiGuc(_POST);

