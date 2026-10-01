import 'server-only';

import type { AdminPageTenantOk } from '@/lib/tenant/adminPageScope';
import { withTenantScope } from '@/lib/tenant/withTenantScope';
import { adminWorkbenchApplicationsOrderBy, adminWorkbenchApplicationsWhere } from '@/lib/admin/commandCenterHelpers';
import { parseWioaQualificationSnapshot } from '@/lib/wioa/wioaQualification';
import {
  ADMIN_APPROVAL_QUEUE_LIMIT,
  ADMIN_APPROVAL_SCAN_CAP,
  ADMIN_WORKBENCH_ORDER_SCAN_CAP,
  adminApplicationsAwaitingApplicantWhere,
  adminApplicationsAwaitingDecisionWhere,
  adminIntakesAwaitingDecisionWhere,
  buildAdminApprovalQueue,
  type AdminApprovalIntakeRow,
  type AdminApprovalQueue,
} from '@/lib/admin/adminApprovalQueue';

/**
 * Facts for the admin Today "Waiting on your decision" list
 * (lib/admin/adminApprovalQueue.ts).
 *
 * Tenant scope: every query runs inside `withTenantScope(scope.orgId)` —
 * for a super-admin too, not `withAdminPageScope`, which would hand a
 * super-admin the unscoped client — AND filters on the actor's organization
 * explicitly (`scope.orgId`, through `user` for the Application rows, which
 * have no `organizationId` column). A super-admin is therefore scoped to
 * their own org here, the same org the Applications workbench and the rest
 * of the admin home (`getAdminCommandCenter`) read, and the tenant-scoping
 * ratchet (scripts/audit-tenant-scoping.cjs) sees every call as scoped.
 *
 * Bounded: each kind is scanned oldest-first up to `ADMIN_APPROVAL_SCAN_CAP`,
 * totals come from `count` over the same where, and the workbench order is
 * read as ids only. No `enrolledProgram` condition anywhere — an applicant
 * who has not enrolled yet is exactly who this list is for.
 */
export async function loadAdminApprovalQueue(
  scope: AdminPageTenantOk,
  options?: { now?: Date; limit?: number },
): Promise<AdminApprovalQueue> {
  const now = options?.now ?? new Date();
  const orgId = scope.orgId;
  const applicationsWhere = adminApplicationsAwaitingDecisionWhere(orgId);
  const intakesWhere = adminIntakesAwaitingDecisionWhere(orgId);

  // Each read opens its own tenant-scoped client (a proxy, no transaction),
  // so every call site is visibly scoped where it is written.
  const [applications, intakeRows, applicationsWaiting, applicationsWaitingOnApplicant, intakesWaiting, workbench] =
    await Promise.all([
      withTenantScope(orgId, (db) =>
        db.application.findMany({
          take: ADMIN_APPROVAL_SCAN_CAP,
          where: applicationsWhere,
          orderBy: adminWorkbenchApplicationsOrderBy(),
          select: {
            id: true,
            status: true,
            programInterest: true,
            submittedAt: true,
            createdAt: true,
            user: { select: { id: true, fullName: true, email: true, enrolledProgram: true } },
          },
        }),
      ),
      withTenantScope(orgId, (db) =>
        db.user.findMany({
          take: ADMIN_APPROVAL_SCAN_CAP,
          where: intakesWhere,
          // The wait clock lives in the screening JSON; `updatedAt` is the
          // closest indexed proxy for "oldest first" before it is parsed.
          orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            fullName: true,
            email: true,
            enrolledProgram: true,
            wioaReviewStatus: true,
            wioaReviewedAt: true,
            wioaQualificationJson: true,
          },
        }),
      ),
      withTenantScope(orgId, (db) => db.application.count({ where: applicationsWhere })),
      withTenantScope(orgId, (db) => db.application.count({ where: adminApplicationsAwaitingApplicantWhere(orgId) })),
      withTenantScope(orgId, (db) => db.user.count({ where: intakesWhere })),
      withTenantScope(orgId, (db) =>
        db.application.findMany({
          take: ADMIN_WORKBENCH_ORDER_SCAN_CAP,
          where: adminWorkbenchApplicationsWhere(orgId),
          orderBy: adminWorkbenchApplicationsOrderBy(),
          select: { id: true },
        }),
      ),
    ]);

  const intakes = intakeRows.map((member): AdminApprovalIntakeRow => {
    const screening = parseWioaQualificationSnapshot(member.wioaQualificationJson);
    const submittedAt = screening ? new Date(screening.submittedAt) : null;
    return {
      id: member.id,
      fullName: member.fullName,
      email: member.email,
      enrolledProgram: member.enrolledProgram,
      wioaReviewStatus: member.wioaReviewStatus,
      wioaReviewedAt: member.wioaReviewedAt,
      wioaScreeningSubmittedAt: submittedAt && !Number.isNaN(submittedAt.getTime()) ? submittedAt : null,
    };
  });

  return buildAdminApprovalQueue(
    {
      applications,
      intakes,
      counts: { applicationsWaiting, applicationsWaitingOnApplicant, intakesWaiting },
      workbenchOrder: workbench.map((row) => row.id),
    },
    now,
    options?.limit ?? ADMIN_APPROVAL_QUEUE_LIMIT,
  );
}
