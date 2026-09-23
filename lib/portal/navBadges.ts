import { prisma } from '@/lib/db/prisma';
import { getCounselorForUser, getEmployerForUser, getPartnerForUser, isAdminInOrg, isSuperAdmin } from '@/lib/auth/roles';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import { adminApplicationsAwaitingDecisionWhere } from '@/lib/admin/adminApprovalQueue';
import { countThreadsWithSlaBreach, countUnansweredMemberThreads, getSlaStatusForThreads } from '@/lib/messages/superAdminMessageQueries';
import { countThreadsWithUnread, countUnreadMemberMessagesByThread } from '@/lib/messages/counselorInbox';
import { memberUnreadStaffMessagesWhere } from '@/lib/messages/memberUnread';
import { countEmployerQueueBadges } from '@/lib/employer/workQueue';
import { countPartnerAttention } from '@/lib/partner/attentionQueue';
import {
  countAwaitingApprovalCascades,
  resolveCascadeScope,
} from '@/lib/milestoneCascade/queries';
import type { NavBadgeKey } from '@/lib/nav/portalNav';
import type { PortalRole } from '@/lib/nav/portalNav';

export type NavBadgeCounts = Partial<Record<NavBadgeKey, number>>;

const MILESTONE_LOOKBACK_DAYS = 7;

export async function getNavBadgeCountsForUser(
  role: PortalRole,
  userId: string
): Promise<NavBadgeCounts> {
  if (role === 'admin') {
    // `?role=admin` is a query parameter any signed-in account can send, so
    // every admin count sits behind one gate (WAP-199): an admin of the
    // actor's own org, or a super-admin. Everyone else gets an empty set,
    // like the employer / partner / counselor branches with no portal context.
    const orgId = await getActorOrganizationId(userId);
    if (!(await isAdminInOrg(userId, orgId))) return {};
    // Admin gets the agent-inbox count, tenant-scoped to their org so the
    // badge number matches what they'll actually see in /admin/agent-inbox.
    // Super-admins get the unscoped count. Defensive .catch so a query
    // failure doesn't break the whole nav.
    const scope = await resolveCascadeScope(userId).catch(() => ({ kind: 'deny' as const }));
    const milestones_awaiting_approval = await countAwaitingApprovalCascades({ scope }).catch(() => 0);
    const applications = await countAdminApplicationsPending(orgId);
    if (await isSuperAdmin(userId)) {
      const [counselor_sla_breach_48h, member_messages_unanswered] = await Promise.all([
        countThreadsWithSlaBreach(48),
        countUnansweredMemberThreads(),
      ]);
      return { counselor_sla_breach_48h, member_messages_unanswered, milestones_awaiting_approval, ...applications };
    }
    return { milestones_awaiting_approval, ...applications };
  }

  if (role === 'member' || role === 'group') {
    if (role === 'group') return {};
    return getMemberBadgeCounts(userId);
  }

  if (role === 'employer') {
    const sa = await isSuperAdmin(userId);
    const ctx = await getEmployerForUser(userId, { isSuperAdminHint: sa });
    if (!ctx) return {};
    return getEmployerBadgeCounts(ctx.employerId);
  }

  if (role === 'partner') {
    const sa = await isSuperAdmin(userId);
    const ctx = await getPartnerForUser(userId, { isSuperAdminHint: sa });
    if (!ctx) return {};
    return getPartnerBadgeCounts(ctx.partnerId, ctx.partner.organizationId);
  }

  if (role === 'counselor') {
    const [sa, ctx] = await Promise.all([isSuperAdmin(userId), getCounselorForUser(userId)]);
    if (ctx) {
      return getCounselorBadgeCounts(ctx.counselorId, userId);
    }
    if (sa) {
      const counselor_sla_breach_48h = await countThreadsWithSlaBreach(48);
      return { counselor_sla_breach_48h };
    }
    return {};
  }

  return {};
}

/**
 * The Applications rail row's badge (WAP-190): PENDING applications in the
 * actor's own organization — the same where, and so the same number, as
 * "waiting on your decision" on the admin Today (lib/admin/adminApprovalQueue.ts).
 * Scoped to the actor's org for super-admins too, like the workbench it opens.
 * The caller has already checked the actor is an admin of `orgId` (or a
 * super-admin). A failed count throws, so the route answers 503 instead of a
 * false zero.
 */
async function countAdminApplicationsPending(orgId: string): Promise<Pick<NavBadgeCounts, 'admin_applications_pending'>> {
  const admin_applications_pending = await prisma.application.count({ where: adminApplicationsAwaitingDecisionWhere(orgId) });
  return { admin_applications_pending };
}

async function getMemberBadgeCounts(userId: string): Promise<NavBadgeCounts> {
  const [pendingJobApps, thread] = await Promise.all([
    prisma.jobPostingApplication.count({
      where: { studentId: userId, status: 'pending' },
    }),
    prisma.messageThread.findUnique({
      where: { memberId: userId },
      select: { id: true, memberLastReadAt: true },
    }),
  ]);

  let counselor_messages_unread = 0;
  if (thread) {
    // Same rule as the Messages page (lib/messages/memberUnread.ts): a null
    // read marker means every staff-authored message is unread.
    const unreadStaffMessages = await prisma.message.count({
      where: memberUnreadStaffMessagesWhere({
        threadId: thread.id,
        memberUserId: userId,
        memberLastReadAt: thread.memberLastReadAt,
      }),
    });
    // Unread badges count threads: a member has one thread, so 0 or 1.
    counselor_messages_unread = countThreadsWithUnread(new Map([[thread.id, unreadStaffMessages]]));
  }

  return {
    // Career readiness is counselor-maintained; incomplete checklist items are not member action items.
    applications_new: pendingJobApps,
    counselor_messages_unread,
  };
}

async function getEmployerBadgeCounts(employerId: string): Promise<NavBadgeCounts> {
  const [draft, pendingReview, live, newApplications, queueBadges, employerRow, thread] = await Promise.all([
    prisma.job.count({ where: { employerId, status: 'draft' } }),
    prisma.job.count({
      where: { employerId, status: { in: ['pending', 'approved'] } },
    }),
    prisma.job.count({ where: { employerId, status: 'live' } }),
    prisma.jobPostingApplication.count({
      where: {
        job: { employerId },
        status: 'pending',
      },
    }),
    countEmployerQueueBadges(employerId),
    prisma.employer.findUnique({
      where: { id: employerId },
      select: { userId: true },
    }),
    prisma.messageThread.findUnique({
      where: { employerId },
      select: { id: true, portalUserLastReadAt: true },
    }),
  ]);

  let employer_messages_unread = 0;
  if (thread && employerRow) {
    const staffUserId = employerRow.userId;
    employer_messages_unread = thread.portalUserLastReadAt
      ? await prisma.message.count({
          where: {
            threadId: thread.id,
            authorId: { not: staffUserId },
            createdAt: { gt: thread.portalUserLastReadAt },
          },
        })
      : 0;
  }

  return {
    jobs_draft: draft,
    jobs_pending: pendingReview,
    jobs_live: live,
    applications_new: newApplications,
    employer_messages_unread,
    ...queueBadges,
  };
}

async function getCounselorBadgeCounts(counselorId: string, userId: string): Promise<NavBadgeCounts> {
  const [assignments, counselor_notifications_unread] = await Promise.all([
    prisma.counselorAssignment.findMany({
      take: 500,
      where: {
        counselorId,
        active: true,
        member: { deletedAt: null },
      },
      select: { memberId: true },
    }),
    // Same scope as GET /api/counselor/notifications `unreadCount`: the
    // counselor's own rows, unread. The rail badge and the page header agree.
    prisma.notification.count({ where: { userId, readAt: null } }),
  ]);

  const memberIds = assignments.map((assignment) => assignment.memberId);
  if (memberIds.length === 0) return { counselor_notifications_unread };

  const threads = await prisma.messageThread.findMany({
    take: 500,
    where: {
      kind: 'member',
      memberId: { in: memberIds },
    },
    select: {
      id: true,
      memberId: true,
      counselorLastReadAt: true,
    },
  });

  if (threads.length === 0) return { counselor_notifications_unread };

  // One batched query shared with the counselor inbox, so the rail badge and
  // the inbox "Unread" tab count the same unread THREADS (never-opened threads
  // included).
  const unreadMap = await countUnreadMemberMessagesByThread(threads.map((t) => t.id));

  const slaRows = await getSlaStatusForThreads(threads.map((thread) => thread.id));
  let counselor_sla_breach_48h = 0;
  for (const thread of threads) {
    if (slaRows.get(thread.id)?.breached48h) counselor_sla_breach_48h += 1;
  }

  return {
    counselor_messages_unread: countThreadsWithUnread(unreadMap),
    counselor_notifications_unread,
    counselor_sla_breach_48h,
  };
}

async function getPartnerBadgeCounts(partnerId: string, organizationId: string): Promise<NavBadgeCounts> {
  const since = new Date();
  since.setDate(since.getDate() - MILESTONE_LOOKBACK_DAYS);

  const [attentionCount, referralIds, partnerUsers, thread] = await Promise.all([
    countPartnerAttention(partnerId, organizationId),
    prisma.partnerReferral.findMany({
      take: 500,
      where: { partnerId, member: { deletedAt: null } },
      select: { memberId: true },
    }),
    prisma.partnerUser.findMany({
      take: 500,
      where: { partnerId },
      select: { userId: true },
    }),
    prisma.messageThread.findUnique({
      where: { partnerId },
      select: { id: true, portalUserLastReadAt: true },
    }),
  ]);

  const memberIds = referralIds.map((r) => r.memberId);
  let milestonesNew = 0;
  if (memberIds.length > 0) {
    milestonesNew = await prisma.memberEvent.count({
      where: {
        userId: { in: memberIds },
        createdAt: { gte: since },
      },
    });
  }

  const partnerUserIds = partnerUsers.map((p) => p.userId);
  let partner_messages_unread = 0;
  if (thread && partnerUserIds.length > 0) {
    partner_messages_unread = thread.portalUserLastReadAt
      ? await prisma.message.count({
          where: {
            threadId: thread.id,
            authorId: { notIn: partnerUserIds },
            createdAt: { gt: thread.portalUserLastReadAt },
          },
        })
      : 0;
  }

  return {
    partner_needs_attention: attentionCount,
    milestones_new: milestonesNew,
    partner_messages_unread,
  };
}

export function isValidPortalBadgeRole(r: string): r is PortalRole {
  return ['member', 'employer', 'partner', 'admin', 'group', 'counselor'].includes(r);
}
