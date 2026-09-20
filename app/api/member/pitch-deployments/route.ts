import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { readJsonObjectBody } from '@/lib/api/readJsonBody';
import { prisma } from '@/lib/db/prisma';

import { withApiGuc } from '@/lib/db/withRequestGuc';
import { auditLog } from '@/lib/audit';
import { logAuditEvent } from '@/lib/audit/log';
import { persistEvent } from '@/lib/events/track';
async function _GET() {
  try {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const deployments = await prisma.$transaction((tx) => tx.memberEvent.findMany({
    where: { userId: user.id, eventName: 'pitch_deployed' },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: { id: true, metadata: true, createdAt: true },
  }));

  return NextResponse.json({ deployments });

  } catch (error) {
    console.error('/member/pitch-deployments error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
export const GET = withApiGuc(_GET);async function _POST(req: NextRequest) {
  try {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await readJsonObjectBody<{ employer?: string; usedAt?: string; outcome?: string }>(req);
  if (!body) {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { employer, usedAt, outcome } = body;

  if (!employer || typeof employer !== 'string' || employer.trim().length === 0) {
    return NextResponse.json({ error: 'employer is required' }, { status: 400 });
  }

  const VALID_OUTCOMES = ['interview', 'no_response', 'pending', 'other'];
  if (outcome && !VALID_OUTCOMES.includes(outcome)) {
    return NextResponse.json({ error: 'invalid outcome' }, { status: 400 });
  }

  const created = await prisma.$transaction((tx) => persistEvent({
    userId: user.id,
    eventName: 'pitch_deployed',
    entityType: 'elevator_pitch',
    sourcePage: '/dashboard/ai-tools/elevator-pitch',
    metadata: {
      employer: employer.trim().slice(0, 200),
      usedAt: usedAt ?? new Date().toISOString(),
      outcome: outcome ?? 'pending',
    },
  }, tx));
  // Response shape is unchanged: only the fields the client renders.
  const event = { id: created.id, metadata: created.metadata, createdAt: created.createdAt };

  auditLog({ actorUserId: user.id, action: 'member.pitchDeployment.create', targetType: 'PitchDeployment', targetId: event.id }).catch(() => {});
  logAuditEvent({ user: { id: user.id, role: 'member' }, verb: 'create', object: { type: 'PitchDeployment', id: event.id }, result: { success: true } }).catch(() => {});
  return NextResponse.json({ deployment: event });

  } catch (error) {
    console.error('/member/pitch-deployments error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
export const POST = withApiGuc(_POST);

