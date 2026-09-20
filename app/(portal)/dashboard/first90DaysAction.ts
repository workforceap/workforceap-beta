'use server';

import { prisma } from '@/lib/db/prisma';
import { getUser } from '@/lib/auth/server';
import { withUserGuc } from '@/lib/db/withRequestGuc';
import { revalidatePath } from 'next/cache';
import {
  FIRST90_CHECK_IN_EVENT,
  daysSincePlacement,
  getFirst90Stage,
  isFirst90Response,
  isFirst90Stage,
} from '@/lib/member/first90Days';
import { escalateToCounselor } from '@/lib/member/counselorEscalation';
import { persistEvent } from '@/lib/events/track';

/**
 * Member submits a First 90 Days check-in from the dashboard card.
 *
 * Persistence reuses the existing generic `MemberEvent` store
 * (eventName = first90_check_in_submitted, entityId = stage) — same
 * pattern as the placement confirmation strip. A "having_trouble"
 * response escalates through the existing `AtRiskAlert` pipeline so it
 * shows up in the counselor inbox-zero queue (`at_risk` flag) without
 * any new infrastructure, plus a CounselorNote for readable context.
 */
export async function submitFirst90DaysCheckIn(stage: string, response: string) {
  if (!isFirst90Stage(stage) || !isFirst90Response(response)) {
    throw new Error('Invalid check-in');
  }

  const user = await getUser();
  if (!user) throw new Error('Unauthorized');

  await withUserGuc(user, async () => {
    const placement = await prisma.placementRecord.findUnique({
      where: { userId: user.id },
      select: { id: true, placedAt: true, employerName: true, jobTitle: true },
    });
    if (!placement) throw new Error('No placement on file');

    const currentStage = getFirst90Stage(placement.placedAt);
    if (currentStage !== stage) {
      throw new Error('Check-in stage is no longer active');
    }

    // One response per stage — ignore repeat submissions (e.g. double tap).
    const existing = await prisma.memberEvent.findFirst({
      where: {
        userId: user.id,
        eventName: FIRST90_CHECK_IN_EVENT,
        entityId: stage,
      },
      select: { id: true },
    });
    if (existing) return;

    const days = daysSincePlacement(placement.placedAt);

    await persistEvent({
      userId: user.id,
      eventName: FIRST90_CHECK_IN_EVENT,
      entityType: 'PlacementRecord',
      entityId: stage,
      metadata: {
        response,
        stage,
        placementId: placement.id,
        daysSincePlacement: days,
      },
      sourcePage: '/dashboard',
    }, prisma);

    if (response === 'having_trouble') {
      const troubleSummary = `First 90 Days ${stage.replace('_', ' ')} check-in: member reported having trouble at ${placement.employerName}${placement.jobTitle ? ` (${placement.jobTitle})` : ''}, day ${days} after placement.`;

      // Surface in the counselor inbox via the shared escalation pipeline
      // (open AtRiskAlert rows drive the `at_risk` inbox flag, plus a
      // readable CounselorNote). See lib/member/counselorEscalation.ts.
      await escalateToCounselor({
        userId: user.id,
        factorName: 'first90_trouble_reported',
        summary: troubleSummary,
        noteContent: `[First 90 Days] ${troubleSummary} Reported by the member from the dashboard check-in.`,
        authorId: user.id,
      });
    }
  });

  revalidatePath('/dashboard');
}
