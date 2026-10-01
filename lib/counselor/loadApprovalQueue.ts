import { cache } from 'react';
import { withTenantScope } from '@/lib/tenant/withTenantScope';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import { MEMBER_ONLY_WHERE } from '@/lib/admin/memberOnlyWhere';
import { COUNSELOR_ROSTER_CAP } from '@/lib/db/queryCaps';
import { resolveCounselorMemberIds, type CounselorAttentionOptions } from '@/lib/attention/counselor';
import { parseWioaQualificationSnapshot } from '@/lib/wioa/wioaQualification';
import {
  AWAITING_APPLICATION_STATUSES,
  buildApprovalQueue,
  type ApprovalQueue,
  type ApprovalQueueMemberFacts,
} from './approvalQueue';

/**
 * Facts for the counselor approval queue (lib/counselor/approvalQueue.ts).
 *
 * Scoping is the Today page's: the counselor's active assignments, or the
 * org's enrolled members for an admin without a counselor record
 * (`resolveCounselorMemberIds`). The member query runs under the actor's
 * tenant scope with the one member definition (`MEMBER_ONLY_WHERE`), so a
 * staff account with a stray pending application never shows up here.
 *
 * No new column: the waiting-state timestamps are the ones already stored —
 * `applications.submitted_at` (falling back to `created_at`), the screening's
 * `wioaQualificationJson.submittedAt` and `users.wioa_reviewed_at`.
 */
export async function loadApprovalQueueFacts(
  memberIds: readonly string[],
  orgId: string,
): Promise<ApprovalQueueMemberFacts[]> {
  const ids = [...new Set(memberIds)];
  if (ids.length === 0) return [];

  const members = await withTenantScope(orgId, (db) =>
    db.user.findMany({
      take: COUNSELOR_ROSTER_CAP,
      where: { id: { in: ids }, organizationId: orgId, deletedAt: null, ...MEMBER_ONLY_WHERE },
      select: {
        id: true,
        fullName: true,
        email: true,
        enrolledProgram: true,
        wioaReviewStatus: true,
        wioaReviewedAt: true,
        wioaQualificationJson: true,
        applications: {
          where: { status: { in: [...AWAITING_APPLICATION_STATUSES] } },
          orderBy: { createdAt: 'asc' },
          select: { id: true, status: true, programInterest: true, submittedAt: true, createdAt: true },
        },
      },
    }),
  );

  return members.map((m): ApprovalQueueMemberFacts => {
    const screening = parseWioaQualificationSnapshot(m.wioaQualificationJson);
    const screeningAt = screening ? new Date(screening.submittedAt) : null;
    return {
      memberId: m.id,
      memberName: m.fullName ?? m.email,
      memberEmail: m.email,
      enrolledProgram: m.enrolledProgram,
      applications: m.applications,
      wioaReviewStatus: m.wioaReviewStatus,
      wioaReviewedAt: m.wioaReviewedAt,
      wioaScreeningSubmittedAt: screeningAt && !Number.isNaN(screeningAt.getTime()) ? screeningAt : null,
    };
  });
}

const loadCounselorApprovalQueue = cache(async (userId: string, isAdmin: boolean) => {
  const now = new Date();
  const [memberIds, orgId] = await Promise.all([
    resolveCounselorMemberIds(userId, { isAdmin }),
    getActorOrganizationId(userId),
  ]);
  const facts = await loadApprovalQueueFacts(memberIds, orgId);
  return buildApprovalQueue(facts, now);
});

/** Deduplicated per request (React `cache`), like `getCounselorAttention`. */
export function getCounselorApprovalQueue(
  userId: string,
  options?: Pick<CounselorAttentionOptions, 'isAdmin'>,
): Promise<ApprovalQueue> {
  return loadCounselorApprovalQueue(userId, Boolean(options?.isAdmin));
}
