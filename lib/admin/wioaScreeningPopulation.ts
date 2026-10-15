import { Prisma } from '@prisma/client';
import type { AdminPageTenantOk } from '@/lib/tenant/adminPageScopeFilters';
import { MEMBER_ONLY_WHERE } from './memberOnlyWhere';

/** Both stored intake sources, under the same member and tenant population for rows and counts. */
export function wioaScreeningQueueWhere(scope: AdminPageTenantOk, reviewStatus?: string | null): Prisma.UserWhereInput {
  return {
    ...MEMBER_ONLY_WHERE,
    deletedAt: null,
    ...(scope.superAdmin ? {} : { organizationId: scope.orgId }),
    ...(reviewStatus ? { wioaReviewStatus: reviewStatus } : {}),
    OR: [
      // Require the saved questionnaire envelope, not ancillary eligibilityForm
      // metadata or a stray submittedAt field. Answer validation still uses
      // the same parser as the member-record review endpoint.
      { AND: [
        { wioaQualificationJson: { path: ['submittedAt'], not: Prisma.AnyNull } },
        { wioaQualificationJson: { path: ['answers'], not: Prisma.AnyNull } },
        { wioaQualificationJson: { path: ['signal'], not: Prisma.AnyNull } },
        { wioaQualificationJson: { path: ['reasons'], not: Prisma.AnyNull } },
        { OR: [
          { wioaQualificationJson: { path: ['version'], equals: 1 } },
          { wioaQualificationJson: { path: ['version'], equals: 2 } },
        ] },
      ] },
      { applyEligibilityScreenings: { some: scope.superAdmin ? {} : { organizationId: scope.orgId } } },
    ],
  };
}
