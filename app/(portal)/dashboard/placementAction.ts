'use server';

import { prisma } from '@/lib/db/prisma';
import { defaultOnboardingWindowEnd } from '@/lib/placement/defaultOnboardingWindow';
import { getUser } from '@/lib/auth/server';
import { withUserGuc } from '@/lib/db/withRequestGuc';
import { revalidatePath } from 'next/cache';
import { recordPartnerWorkflowEvent } from '@/lib/portal/workflowEvents';
import { persistEvent } from '@/lib/events/track';
import { recordApplicationStatusChange } from '@/lib/member/applicationStatusEvent';
import {
  recordPlacementFromApplication,
  type RecordPlacementOutcome,
} from '@/lib/placement/recordPlacementFromApplication';
import { captureApiError } from '@/lib/observability/captureApiError';

export type ConfirmPlacementResult = {
  /**
   * What happened to the member's PlacementRecord: 'created' (first
   * confirmation), 'unchanged' (already on record, nothing re-sent), or
   * 'failed' (the record write threw; the claim event still carries the
   * report for staff review). The strip reads this to tell the member the
   * truth for their case.
   */
  placementOutcome: RecordPlacementOutcome | 'failed';
};

export async function confirmPlacement(jobApplicationId: string): Promise<ConfirmPlacementResult> {
  const user = await getUser();
  if (!user) throw new Error('Unauthorized');

  let placementOutcome: RecordPlacementOutcome | 'failed' = 'failed';
  let placementRecordId: string | null = null;

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

    // Stand up the PlacementRecord the same way an employer marking the
    // application hired does (lib/employer/applicationStatusEffects.ts), so a
    // self-reported hire reaches the retention check-ins, the First 90 Days
    // card and the placement counts instead of stopping at an event. The row
    // is member-reported and `startDateVerified: false` until a counselor
    // confirms start date and wage; one row per member, so a second
    // confirmation or a later employer 'hired' lands on this same row.
    // Fail-soft like the employer path: the status update above has already
    // committed, and the claim event below must still be written.
    try {
      const recorded = await recordPlacementFromApplication({
        userId: user.id,
        employerName: application.company,
        jobTitle: application.role,
        source: 'member_self_report',
        applicationId: application.id,
        actorUserId: user.id,
        now,
      });
      placementOutcome = recorded.outcome;
      placementRecordId = recorded.placement.id;
    } catch (err) {
      captureApiError(err, {
        route: 'dashboard/confirmPlacement',
        extra: { userId: user.id, applicationId: application.id, stage: 'member-placement-record' },
      });
    }

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
        placementOutcome,
        placementRecordId,
        note: 'Member self-reported offer acceptance. Recorded as a member-reported placement; start date and wage stay unverified until staff review.',
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
          'Member self-reported an accepted role. Recorded as a member-reported placement; WorkforceAP still verifies start date and wage before it is finalized.',
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
  revalidatePath('/admin/placements');
  revalidatePath('/counselor/placements');
  revalidatePath(`/admin/members/${user.id}`);
  revalidatePath('/partner');
  revalidatePath('/partner/attention');
  revalidatePath('/partner/outcomes');

  return { placementOutcome };
}
