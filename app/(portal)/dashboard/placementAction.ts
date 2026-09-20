'use server';

import { prisma } from '@/lib/db/prisma';
import { defaultOnboardingWindowEnd } from '@/lib/placement/defaultOnboardingWindow';
import { getUser } from '@/lib/auth/server';
import { withUserGuc } from '@/lib/db/withRequestGuc';
import { revalidatePath } from 'next/cache';
import { recordPartnerWorkflowEvent } from '@/lib/portal/workflowEvents';
import { persistEvent } from '@/lib/events/track';

export async function confirmPlacement(jobApplicationId: string) {
  const user = await getUser();
  if (!user) throw new Error('Unauthorized');

  await withUserGuc(user, async () => {
    const application = await prisma.jobApplication.findUnique({
      where: { id: jobApplicationId },
    });

    if (!application || application.userId !== user.id) {
      throw new Error('Application not found');
    }

    if (application.status !== 'OFFER' && application.status !== 'ACCEPTED') {
      throw new Error('Only offer or accepted applications can be confirmed as a placement');
    }

    const now = new Date();

    // Update the job application status so the confirmation strip stops showing
    await prisma.jobApplication.update({
      where: { id: jobApplicationId },
      data: { status: 'ACCEPTED', updatedAt: now },
    });

    await persistEvent({
      userId: user.id,
      eventName: 'placement_confirmation_submitted',
      entityType: 'JobApplication',
      entityId: application.id,
      metadata: {
        company: application.company,
        role: application.role,
        confirmedAt: now.toISOString(),
        pendingReview: true,
        note: 'Member self-reported offer acceptance. No placement record created until staff review.',
      },
      sourcePage: '/dashboard',
    }, prisma);

    const referral = await prisma.partnerReferral.findFirst({
      where: { memberId: user.id },
      select: { partnerId: true },
    });

    if (referral?.partnerId) {
      await recordPartnerWorkflowEvent({
        partnerId: referral.partnerId,
        actorUserId: user.id,
        kind: 'placement_confirmation_submitted',
        headline: `${application.company} offer reported by member`,
        detail:
          'Member self-reported an accepted role. WorkforceAP review is still pending before placement is finalized.',
        entityType: 'JobApplication',
        entityId: application.id,
      });
    }
  });

  revalidatePath('/dashboard');
  revalidatePath('/admin');
  revalidatePath(`/admin/members/${user.id}`);
  revalidatePath('/partner');
  revalidatePath('/partner/attention');
  revalidatePath('/partner/outcomes');
}
