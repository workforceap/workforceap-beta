import type { Prisma } from '@prisma/client';

type AgreementDataClient = Pick<Prisma.TransactionClient, '$queryRaw' | 'enrollmentAgreementSubmission'>;

/**
 * Privacy operations are independent of the UI feature flag: disabling uploads
 * must not hide retained agreements from export or account-deletion handling.
 * A fresh deployment may precede the additive migration, so check the exact
 * table without issuing a failing SELECT inside a transaction. Database errors
 * propagate; only a confirmed absent table means there is nothing to process.
 */
async function submissionsExist(db: Pick<AgreementDataClient, '$queryRaw'>): Promise<boolean> {
  const rows = await db.$queryRaw<Array<{ present: boolean }>>`
    SELECT to_regclass('public.enrollment_agreement_submissions') IS NOT NULL AS present
  `;
  if (rows.length !== 1 || typeof rows[0].present !== 'boolean') {
    throw new Error('Enrollment agreement data availability could not be confirmed');
  }
  return rows[0].present;
}

/** All revisions belonging to the subject, not staff activity on other members. */
export async function exportEnrollmentAgreementData(memberId: string, db: AgreementDataClient) {
  if (!(await submissionsExist(db))) return [];
  const rows = await db.enrollmentAgreementSubmission.findMany({
    where: { subjectMemberId: memberId },
    orderBy: [{ uploadedAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      subjectMemberId: true,
      subjectName: true,
      templateVersion: true,
      sha256: true,
      sizeBytes: true,
      uploadedByUserId: true,
      uploadedBySubjectId: true,
      uploadedAt: true,
      status: true,
      isCurrent: true,
      reviewedByUserId: true,
      reviewedBySubjectId: true,
      reviewedAt: true,
      reviewNote: true,
    },
  });
  return rows.map((row) => ({
    ...row,
    uploadedAt: row.uploadedAt.toISOString(),
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
  }));
}

/**
 * Enrollment agreements survive account deletion by owner policy. Detach only
 * the live account relationship; preserve every revision, PDF fingerprint,
 * review and immutable identity snapshot. No retention deadline is implied.
 * Call after the persistent deletion fence is held; never release that fence.
 */
export async function retainEnrollmentAgreementData(memberId: string, db: AgreementDataClient): Promise<void> {
  if (!(await submissionsExist(db))) return;
  await db.enrollmentAgreementSubmission.updateMany({ where: { memberId }, data: { memberId: null } });
}
