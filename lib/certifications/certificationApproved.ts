import 'server-only';

import { trackEvent } from '@/lib/events/track';
import { awardPoints } from '@/lib/member/points';
import { createNotification } from '@/lib/notifications/create';
import { sendPartnerMilestoneEmail } from '@/lib/notifications/partner-notify';

/**
 * WAP-20: the downstream effects of a credential — the `certification_earned`
 * lifecycle event, points, the member notification and the partner milestone
 * email — run when staff approve it, not when a member types its name.
 * `POST /api/member/certifications` used to fire all four on creation, which
 * is how self-reports reached the outcome numbers funders read.
 *
 * Every effect is best-effort and isolated so one failing side channel does
 * not stop the others. `awardPoints` is idempotent per (user, cert name).
 */
export async function runCertificationApprovedEffects(input: {
  userId: string;
  certName: string;
}): Promise<void> {
  const { userId, certName } = input;
  await trackEvent({
    userId,
    eventName: 'certification_earned',
    entityType: 'UserCertification',
    metadata: { certName },
  }).catch(() => {});
  await awardPoints(userId, 'certification_earned', certName).catch(() => {});
  await Promise.resolve(
    createNotification({
      userId,
      type: 'certificate_earned',
      title: `You earned ${certName}!`,
      body: 'Add it to your resume and check out jobs matched to your new credential.',
      data: { link: '/dashboard/jobs' },
    }),
  ).catch(() => {});
  await sendPartnerMilestoneEmail(userId, 'Certification earned', { Certification: certName }).catch(
    (err) => console.error('[certifications] partner milestone email failed:', err),
  );
}
