'use server';

import { prisma } from '@/lib/db/prisma';
import { getUser } from '@/lib/auth/server';
import { resolveAdminPageTenant, withAdminPageScope, inheritUserOrg, inheritMemberOrg, inheritLeaderOrg, inheritInvitedByOrg } from '@/lib/tenant/adminPageScope';
import { revalidatePath } from 'next/cache';
import { getOrCreateEmployerMessageThread } from '@/lib/messages/portalThreads';
import { withTenantScope } from '@/lib/tenant/withTenantScope';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import { auditLog } from '@/lib/audit';
import { logAuditEvent } from '@/lib/audit/log';
import { persistEvent } from '@/lib/events/track';

export async function introduceMemberToEmployer(memberId: string, jobId: string) {
  const user = await getUser();
  if (!user) throw new Error('Unauthorized');
  const scope = await resolveAdminPageTenant(user.id);
  if (!scope.ok) throw new Error('Unauthorized');

  const orgId = await getActorOrganizationId(user.id);

  const [job, member] = await Promise.all([
    withTenantScope(orgId, (db) =>
      db.job.findUnique({
        where: { id: jobId },
        include: { employer: true },
      }),
    ),
    withTenantScope(orgId, (db) =>
      db.user.findUnique({
        where: { id: memberId },
        select: { id: true, fullName: true, email: true, enrolledProgram: true },
      }),
    ),
  ]);

  if (!job?.employerId || !job.employer) throw new Error('Job or employer not found');
  if (!member) throw new Error('Member not found');

  const thread = await getOrCreateEmployerMessageThread(job.employerId);

  if (!thread.counselorUserId || thread.counselorUserId !== user.id) {
    await withTenantScope(orgId, (db) =>
      db.messageThread.update({
        where: { id: thread.id },
        data: {
          counselorUserId: user.id,
          staffUserId: user.id,
        },
      }),
    );
  }

  await withTenantScope(orgId, (db) =>
    db.message.create({
      data: {
        threadId: thread.id,
        authorId: user.id,
        body:
          `Structured introduction from WorkforceAP. Candidate: ${member.fullName} (${member.email}). ` +
          `Role: ${job.title}. Employer: ${job.employer.companyName}. ` +
          `Please reply in this thread to coordinate next steps with the counselor and member.`,
      },
    }),
  );

  await withTenantScope(orgId, (db) =>
    persistEvent({
      userId: member.id,
      eventName: 'employer_intro_created',
      entityType: 'MessageThread',
      entityId: thread.id,
      metadata: {
        jobId: job.id,
        employerId: job.employerId,
        employerName: job.employer.companyName,
        introducedBy: user.id,
      },
      sourcePage: `/admin/members/${member.id}`,
    }, db),
  );

  await withTenantScope(orgId, (db) =>
    db.aIJobMatch.updateMany({
      where: { jobId: job.id, studentId: member.id },
      data: { status: 'contacted', statusUpdatedAt: new Date() },
    }),
  );

  await auditLog({
    actorUserId: user.id,
    action: 'employer_introduce',
    targetType: 'member',
    targetId: memberId,
    metadata: { orgId, jobId, employerId: job.employerId },
  });
  await logAuditEvent({
    user: { id: user.id, role: 'admin' },
    verb: 'launched',
    object: { type: 'MessageThread', id: thread.id },
    result: { success: true, extensions: { memberId, jobId, employerId: job.employerId, orgId } },
    orgId,
  }).catch((err) => console.error('[audit] employer intro:', err));

  revalidatePath(`/admin/members/${memberId}`);
  revalidatePath('/admin/messages');
}
