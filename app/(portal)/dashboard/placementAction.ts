'use server';

import { prisma } from '@/lib/db/prisma';
import { defaultOnboardingWindowEnd } from '@/lib/placement/defaultOnboardingWindow';
import { getUser } from '@/lib/auth/server';
import { withUserGuc } from '@/lib/db/withRequestGuc';
import { revalidatePath } from 'next/cache';
import { recordPartnerWorkflowEvent } from '@/lib/portal/workflowEvents';
import { persistEvent } from '@/lib/events/track';
import { recordApplicationStatusChange } from '@/lib/member/applicationStatusEvent';

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
      // 'JobApplication' here and 'job_application' on the status event below
      // are the same row spelled two ways. Neither is changed: each matches the
      // rows its own event has already written (this one since it shipped, the
      // status event since `/api/member/job-applications/[id]`), so
      // normalising either would make new rows disagree with that event's
      // history. Worth settling repo-wide with a backfill, not here.
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

    // Forcing the row to ACCEPTED is a status change like any other, and
    // `placement_confirmation_submitted` above records the placement claim,
    // not the transition — so the activity log had no record that the
    // application moved. No-ops when the row was already ACCEPTED.
    //
    // LAST, and best-effort, deliberately. `withUserGuc` is AsyncLocalStorage,
    // not a transaction: the status update at the top has already committed by
    // the time anything here runs, so a throw cannot roll it back — it can only
    // destroy the work that has not happened yet. Written earlier with the
    // durable writer, a failed status log left the row ACCEPTED while losing
    // the placement event, the partner notification and every revalidation
    // below, on the highest-value action in the product. Nothing may depend on
    // this line, so it goes at the end and swallows its own errors, exactly
    // like the other two callers.
    await recordApplicationStatusChange({
      userId: user.id,
      applicationId: application.id,
      previousStatus: application.status,
      nextStatus: 'ACCEPTED',
      sourcePage: '/dashboard',
    });
  });

  revalidatePath('/dashboard');
  revalidatePath('/admin');
  revalidatePath(`/admin/members/${user.id}`);
  revalidatePath('/partner');
  revalidatePath('/partner/attention');
  revalidatePath('/partner/outcomes');
}
