import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { MEMBER_OR_DOGFOOD_ROLE_NOT } from '@/lib/admin/memberOnlyWhere';

export const COURSERA_SYNC_MEMBER_PAGE_SIZE = 100;

/** Hard cap per cron run so 6h skillset sync cannot page the entire user table. */
export const COURSERA_SYNC_MEMBER_CAP = 500;

export type CourseraSyncMember = {
  id: string;
  email: string;
  enrolledProgram: string | null;
};

/**
 * Who the Coursera skillset sync reads: members by the one definition
 * (lib/admin/memberOnlyWhere.ts) plus admin / super_admin dogfood accounts —
 * the role half of MEMBER_OR_DOGFOOD_WHERE. A member the funder counts report
 * (a `member` row in user_roles with no profile row yet) is synced too, where
 * the old `profile.role IN (...)` predicate skipped them. No fixture-email
 * exclusion: QA learner accounts need their progress synced to be tested.
 */
const eligibleMemberWhere = {
  deletedAt: null,
  email: { not: '' },
  NOT: MEMBER_OR_DOGFOOD_ROLE_NOT,
} satisfies Prisma.UserWhereInput;

export async function fetchEligibleCourseraMembers(): Promise<CourseraSyncMember[]> {
  const members: CourseraSyncMember[] = [];

  for (let skip = 0; skip < COURSERA_SYNC_MEMBER_CAP; skip += COURSERA_SYNC_MEMBER_PAGE_SIZE) {
    const take = Math.min(COURSERA_SYNC_MEMBER_PAGE_SIZE, COURSERA_SYNC_MEMBER_CAP - skip);
    const page = await prisma.$transaction((tx) =>
      tx.user.findMany({
        where: eligibleMemberWhere,
        select: { id: true, email: true, enrolledProgram: true },
        orderBy: { createdAt: 'asc' },
        skip,
        take,
      }),
    );
    members.push(...page);
    if (page.length < take) break;
  }

  return members;
}
