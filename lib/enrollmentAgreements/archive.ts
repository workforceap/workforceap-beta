import 'server-only';
import type { Prisma } from '@prisma/client';
import { withTenantScope } from '@/lib/tenant/withTenantScope';
import { isAgreementAdmin, validateAgreementId } from './access';
import type { EnrollmentAgreementActor } from './access';
import { EnrollmentAgreementError } from './errors';
import type { EnrollmentAgreementArchive, EnrollmentAgreementStatus, EnrollmentAgreementTemplateVersion } from './types';

const PAGE_SIZE = 50;
function requireArchiveAdmin(actor: EnrollmentAgreementActor) {
  if (!isAgreementAdmin(actor.role)) throw new EnrollmentAgreementError(403, 'FORBIDDEN', 'Administrator access is required.');
}

/** No live-account or collection-flag dependency; historical identity never reattaches. */
export async function getArchivedAgreementForRead(actor: EnrollmentAgreementActor, id: string) {
  requireArchiveAdmin(actor);
  validateAgreementId(id);
  const row = await withTenantScope(actor.organizationId, (db) => db.enrollmentAgreementSubmission.findFirst({
    where: { id, organizationId: actor.organizationId },
  }));
  if (!row) throw new EnrollmentAgreementError(404, 'NOT_FOUND', 'Enrollment agreement not found.');
  return row;
}

export async function getAgreementArchive(actor: EnrollmentAgreementActor, query: string, page: number): Promise<EnrollmentAgreementArchive> {
  requireArchiveAdmin(actor);
  const where: Prisma.EnrollmentAgreementSubmissionWhereInput = {
    organizationId: actor.organizationId,
    ...(query ? { OR: [
      { subjectName: { contains: query, mode: 'insensitive' } },
      ...(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(query) ? [{ subjectMemberId: query }] : []),
    ] } : {}),
  };
  return withTenantScope(actor.organizationId, async (db) => {
    const [total, rows] = await Promise.all([
      db.enrollmentAgreementSubmission.count({ where }),
      db.enrollmentAgreementSubmission.findMany({ where, take: PAGE_SIZE, skip: (page - 1) * PAGE_SIZE,
        orderBy: [{ uploadedAt: 'desc' }, { id: 'desc' }],
        select: { id: true, subjectMemberId: true, subjectName: true, member: { select: { deletedAt: true } },
          status: true, isCurrent: true, templateVersion: true, uploadedAt: true, reviewedAt: true, reviewNote: true },
      }),
    ]);
    return { page, total, hasMore: page * PAGE_SIZE < total,
      rows: rows.map((row) => ({ id: row.id, subjectMemberId: row.subjectMemberId, subjectName: row.subjectName,
        retainedAfterAccountDeletion: !row.member || row.member.deletedAt !== null,
        status: row.status as EnrollmentAgreementStatus, isCurrent: row.isCurrent,
        templateVersion: row.templateVersion as EnrollmentAgreementTemplateVersion,
        uploadedAt: row.uploadedAt.toISOString(), reviewedAt: row.reviewedAt?.toISOString() ?? null, reviewNote: row.reviewNote,
        downloadUrl: `/api/enrollment-agreements/archive/${row.id}/download`,
      })),
    };
  });
}
