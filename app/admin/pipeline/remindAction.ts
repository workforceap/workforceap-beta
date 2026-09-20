'use server';

import { prisma } from '@/lib/db/prisma';
import { getUser, withAuthGuc } from '@/lib/auth/server';
import { resolveAdminPageTenant, withAdminPageScope, inheritUserOrg, inheritMemberOrg, inheritLeaderOrg, inheritInvitedByOrg } from '@/lib/tenant/adminPageScope';
import { getProfileRole } from '@/lib/auth/roles';
import { revalidatePath } from 'next/cache';
import { sendApplicantFollowupEmail } from '@/lib/email';
import { logAuditEvent } from '@/lib/audit/log';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import { withDbRetry } from '@/lib/db/withDbRetry';
import { persistEvent } from '@/lib/events/track';

export async function remindStaleApplication(applicationId: string, userId: string) {
  return withAuthGuc(async () => {
    const user = await getUser();
    if (!user) throw new Error('Unauthorized');
  const scope = await resolveAdminPageTenant(user.id);
  if (!scope.ok) throw new Error('Unauthorized');

    const orgId = await getActorOrganizationId(user.id);

    const application = await prisma.application.findFirst({
      where: { id: applicationId, userId, user: { organizationId: orgId } },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
    });

    if (!application || application.userId !== userId) {
      throw new Error('Application not found');
    }

    if (application.status !== 'PENDING') {
      throw new Error('Application is no longer pending');
    }

    const emailResult = await sendApplicantFollowupEmail({
      to: application.user.email,
      fullName: application.user.fullName ?? 'there',
    });

    await persistEvent({
      userId,
      eventName: 'application_reminder_sent',
      entityType: 'Application',
      entityId: applicationId,
      metadata: {
        note: 'System sent a reminder for a stale application.',
        emailOk: emailResult.ok,
        emailError: emailResult.error ?? null,
      },
      sourcePage: '/admin/pipeline',
    }, prisma);

    const profileRole = await withDbRetry(() => getProfileRole(user.id)).catch((err) => {
      console.error('[admin:pipeline-remind] profileRole lookup failed; degrading to member', err);
      return 'member';
    });
    await logAuditEvent({
      user: { id: user.id, role: profileRole ?? undefined },
      verb: 'launched',
      object: { type: 'Application', id: applicationId },
      result: {
        success: emailResult.ok,
        extensions: { emailError: emailResult.error ?? null },
      },
      orgId,
    }).catch((err) => console.error('[audit] application reminder:', err));

    revalidatePath('/admin/pipeline');
    revalidatePath('/admin');
  });
}
