/**
 * Counselor-scoped attention queue. The four counselor surfaces (Overview,
 * Inbox zero, Triage, Work queue) all call this and render a projection of
 * the same `AttentionQueue`, so they flag the same members.
 */

import { cache } from 'react';
import { prisma } from '@/lib/db/prisma';
import { COUNSELOR_ROSTER_CAP } from '@/lib/db/queryCaps';
import { resolveAdminEnrolledMemberIds } from '@/lib/counselor/adminMemberScope';
import { buildAttentionQueue, type AttentionQueue } from './evaluate';
import { loadAttentionFacts } from './loadFacts';

export type CounselorAttentionOptions = {
  /** Admin without a counselor record falls back to the org's enrolled members. */
  isAdmin?: boolean;
  adminMemberCap?: number;
};

const DEFAULT_ADMIN_MEMBER_CAP = 200;

/**
 * Which members does this user own? Active counselor assignments when the
 * user is a counselor; the org's enrolled members for an admin without a
 * counselor record; nobody otherwise.
 */
export async function resolveCounselorMemberIds(
  userId: string,
  options?: CounselorAttentionOptions,
): Promise<string[]> {
  const counselor = await prisma.counselor.findFirst({
    where: { userId, active: true },
    select: { id: true },
  });
  if (counselor) {
    const assignments = await prisma.counselorAssignment.findMany({
      take: COUNSELOR_ROSTER_CAP,
      where: { counselorId: counselor.id, active: true },
      select: { memberId: true },
    });
    return assignments.map((a) => a.memberId);
  }
  if (options?.isAdmin) {
    return resolveAdminEnrolledMemberIds(userId, options.adminMemberCap ?? DEFAULT_ADMIN_MEMBER_CAP);
  }
  return [];
}

const loadCounselorAttention = cache(async (userId: string, isAdmin: boolean, adminMemberCap: number) => {
  const now = new Date();
  const memberIds = await resolveCounselorMemberIds(userId, { isAdmin, adminMemberCap });
  const facts = await loadAttentionFacts(memberIds, now);
  return buildAttentionQueue(facts, now);
});

/** Deduplicated per request (React `cache`), so a page can call it from several loaders. */
export function getCounselorAttention(
  userId: string,
  options?: CounselorAttentionOptions,
): Promise<AttentionQueue> {
  return loadCounselorAttention(
    userId,
    Boolean(options?.isAdmin),
    options?.adminMemberCap ?? DEFAULT_ADMIN_MEMBER_CAP,
  );
}
