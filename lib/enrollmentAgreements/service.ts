import 'server-only';
import { randomUUID } from 'node:crypto';
import type { EnrollmentAgreementSubmission, Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { withTenantScope } from '@/lib/tenant/withTenantScope';
import { EnrollmentAgreementError } from './errors';
import { agreementStudentWhere, isAgreementAdmin, requireAgreementMemberAccess, validateAgreementId } from './access';
import type { EnrollmentAgreementActor } from './access';
import { agreementSha256, agreementStoragePath, removeStagedAgreementPdf, storeAgreementPdf } from './storage';
import { acquireEnrollmentAgreementUploadLock, releaseEnrollmentAgreementUploadLock } from './operationLock';
import { ENROLLMENT_TEMPLATE_URL } from './types';
import { recordAgreementAudit } from './audit';
import type { EnrollmentAgreementCoverage, EnrollmentAgreementCoverageStatus, EnrollmentAgreementStatus, EnrollmentAgreementSubmissionView, EnrollmentAgreementSummary, EnrollmentAgreementTemplateVersion } from './types';

const MAX_HISTORY = 50;
const PAGE_SIZE = 50;

function submissionView(row: EnrollmentAgreementSubmission): EnrollmentAgreementSubmissionView {
  return {
    id: row.id, status: row.status as EnrollmentAgreementStatus, isCurrent: row.isCurrent,
    templateVersion: row.templateVersion as EnrollmentAgreementTemplateVersion,
    uploadedAt: row.uploadedAt.toISOString(), reviewedAt: row.reviewedAt?.toISOString() ?? null,
    reviewNote: row.reviewNote, downloadUrl: `/api/enrollment-agreements/${row.id}/download`,
  };
}

export async function getAgreementSummary(actor: EnrollmentAgreementActor, memberId: string): Promise<EnrollmentAgreementSummary> {
  const access = await requireAgreementMemberAccess(actor, memberId);
  const submissions = await withTenantScope(actor.organizationId, (db) => db.enrollmentAgreementSubmission.findMany({
    where: { memberId, organizationId: actor.organizationId },
    orderBy: [{ isCurrent: 'desc' }, { uploadedAt: 'desc' }, { id: 'desc' }], take: MAX_HISTORY,
  }));
  const current = submissions.find((row) => row.isCurrent);
  return { status: (current?.status ?? 'missing') as EnrollmentAgreementCoverageStatus,
    canUpload: access.canUpload, canReview: access.canReview && current?.status === 'pending',
    templateUrl: ENROLLMENT_TEMPLATE_URL, submissions: submissions.map(submissionView) };
}

export async function getAgreementForRead(actor: EnrollmentAgreementActor, id: string): Promise<EnrollmentAgreementSubmission> {
  validateAgreementId(id);
  const row = await withTenantScope(actor.organizationId, (db) => db.enrollmentAgreementSubmission.findFirst({
    where: { id, organizationId: actor.organizationId },
  }));
  if (!row) throw new EnrollmentAgreementError(404, 'NOT_FOUND', 'Enrollment agreement not found.');
  try {
    await requireAgreementMemberAccess(actor, row.memberId);
  } catch (error) {
    if (error instanceof EnrollmentAgreementError && error.status === 403) {
      throw new EnrollmentAgreementError(404, 'NOT_FOUND', 'Enrollment agreement not found.');
    }
    throw error;
  }
  return row;
}

function isRevisionConflict(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { code?: string; meta?: { code?: string } };
  return candidate.code === 'P2002' || (candidate.code === 'P2010' && candidate.meta?.code === '23505');
}

function isDefiniteStatementRollback(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { code?: string; meta?: { code?: string } };
  // A generic P2010 can wrap transport failures. Only known PostgreSQL
  // integrity, transaction-rollback and syntax/access classes prove failure.
  const sqlState = candidate.meta?.code ?? '';
  return candidate.code === 'P2002' || (candidate.code === 'P2010'
    && (/^(23|40|42)[0-9A-Z]{3}$/.test(sqlState) || sqlState === '57014' || sqlState === '55P03'));
}

/**
 * One SQL statement supplies the atomicity: never rely on preview's flattened
 * Prisma $transaction. The member lock serializes cooperating writers. A second
 * upload with an older READ COMMITTED snapshot may hit the partial unique index;
 * that entire statement rolls back and the caller receives a retryable conflict.
 * No retired revision's bytes or review evidence are changed.
 */
export async function createAgreementSubmission(actor: EnrollmentAgreementActor, args: {
  memberId: string; templateVersion: EnrollmentAgreementTemplateVersion; bytes: Uint8Array;
}): Promise<{ id: string }> {
  await requireAgreementMemberAccess(actor, args.memberId, 'upload');
  const id = randomUUID();
  const storagePath = agreementStoragePath(args.memberId, id);
  // Detect an unapplied migration before staging an object. Never report missing.
  await withTenantScope(actor.organizationId, (db) => db.enrollmentAgreementSubmission.count({
    where: { memberId: args.memberId, organizationId: actor.organizationId },
  }));
  // Token == submission UUID lets recovery identify the exact staged key without
  // retaining filenames, member content, or private object paths in logs.
  const token = await acquireEnrollmentAgreementUploadLock(actor, args.memberId, id);
  let result: { id: string };
  try {
    await storeAgreementPdf(storagePath, args.bytes);
    const rows = await prisma.$queryRaw<{ id: string }[]>`
      WITH member_lock AS (
        SELECT id FROM users
        WHERE id = ${args.memberId} AND organization_id = ${actor.organizationId} AND deleted_at IS NULL
          AND EXISTS (SELECT 1 FROM enrollment_agreement_operation_locks
            WHERE member_id = ${args.memberId} AND organization_id = ${actor.organizationId} AND token = ${token} AND state = 'upload')
        FOR UPDATE
      ), retired AS (
        UPDATE enrollment_agreement_submissions SET is_current = false
        WHERE member_id = ${args.memberId} AND organization_id = ${actor.organizationId} AND is_current = true
          AND EXISTS (SELECT 1 FROM member_lock)
        RETURNING id
      ), inserted AS (
        INSERT INTO enrollment_agreement_submissions
          (id, organization_id, member_id, storage_path, sha256, size_bytes, template_version, uploaded_by_user_id)
        SELECT ${id}, ${actor.organizationId}, ${args.memberId}, ${storagePath}, ${agreementSha256(args.bytes)},
          ${args.bytes.byteLength}, ${args.templateVersion}, ${actor.id}
        FROM member_lock WHERE (SELECT count(*) FROM retired) >= 0
        RETURNING id
      ) SELECT id FROM inserted
    `;
    if (rows.length !== 1) throw new EnrollmentAgreementError(409, 'STUDENT_CHANGED', 'The student record changed. Reload before uploading again.');
    result = { id: rows[0].id };
  } catch (error) {
    // A network/timeout error can be an ambiguous commit. Do not delete bytes
    // that a successfully committed revision may reference. Compensate only a
    // definite statement rejection/rollback; an uncertain upload needs support
    // reconciliation, not a destructive guess or retry that hides its history.
    if ((error instanceof EnrollmentAgreementError && error.code === 'STUDENT_CHANGED') || isDefiniteStatementRollback(error)) {
      await removeStagedAgreementPdf(storagePath);
      await releaseEnrollmentAgreementUploadLock(actor, args.memberId, token);
    } else if (error instanceof EnrollmentAgreementError && error.code === 'PRIVATE_STORAGE_UNAVAILABLE') {
      // Bucket preflight failed before an upload request was issued.
      await releaseEnrollmentAgreementUploadLock(actor, args.memberId, token);
    }
    if (isRevisionConflict(error)) throw new EnrollmentAgreementError(409, 'REVISION_CONFLICT', 'Another upload completed at the same time. Reload the agreement history before trying again.');
    throw error;
  }
  // Outside the compensation catch: failure to release a fence after commit
  // must NEVER remove the committed PDF. Support reconciles the retained fence.
  await recordAgreementAudit(actor, 'uploaded', { id: result.id, memberId: args.memberId });
  await releaseEnrollmentAgreementUploadLock(actor, args.memberId, token);
  return result;
}

export async function reviewAgreementSubmission(actor: EnrollmentAgreementActor, args: {
  id: string; action: 'verify' | 'request_correction'; reviewNote: string | null; attestSignatures?: boolean;
}): Promise<void> {
  const row = await getAgreementForRead(actor, args.id);
  await requireAgreementMemberAccess(actor, row.memberId, 'review');
  if (args.action === 'verify' && args.attestSignatures !== true) throw new EnrollmentAgreementError(400, 'ATTESTATION_REQUIRED', 'Confirm that you checked the required signatures and dates.');
  if (args.action === 'request_correction' && !args.reviewNote?.trim()) throw new EnrollmentAgreementError(400, 'NOTE_REQUIRED', 'Explain what needs correction.');
  const status = args.action === 'verify' ? 'verified' : 'needs_correction';
  const token = await acquireEnrollmentAgreementUploadLock(actor, row.memberId, row.id);
  // Shared member lock plus current/pending compare-and-set: a stale tab can
  // never review a replacement, nor overwrite another review of this revision.
  let updated: { id: string }[];
  try {
    updated = await prisma.$queryRaw<{ id: string }[]>`
    WITH member_lock AS (
      SELECT id FROM users
      WHERE id = ${row.memberId} AND organization_id = ${actor.organizationId} AND deleted_at IS NULL
      FOR UPDATE
    )
    UPDATE enrollment_agreement_submissions
    SET status = ${status}, reviewed_by_user_id = ${actor.id}, reviewed_at = CURRENT_TIMESTAMP, review_note = ${args.reviewNote}
    WHERE id = ${args.id} AND organization_id = ${actor.organizationId} AND member_id = ${row.memberId}
      AND member_id <> ${actor.id} AND is_current = true AND status = 'pending'
      AND EXISTS (SELECT 1 FROM member_lock)
    RETURNING id
  `;
  } catch (error) {
    // No storage side effect exists in a review, but an uncertain SQL result
    // still needs reconciliation before another operation can reuse the fence.
    if (isDefiniteStatementRollback(error)) await releaseEnrollmentAgreementUploadLock(actor, row.memberId, token);
    throw error;
  }
  if (updated.length === 1) await recordAgreementAudit(actor, status, { id: args.id, memberId: row.memberId });
  await releaseEnrollmentAgreementUploadLock(actor, row.memberId, token);
  if (updated.length !== 1) throw new EnrollmentAgreementError(409, 'STALE_REVIEW', 'This revision was replaced or already reviewed. Reload before reviewing the current PDF.');
}

function coverageStatusWhere(organizationId: string, status: EnrollmentAgreementCoverageStatus): Prisma.UserWhereInput {
  return status === 'missing'
    ? { enrollmentAgreementSubmissions: { none: { organizationId, isCurrent: true } } }
    : { enrollmentAgreementSubmissions: { some: { organizationId, isCurrent: true, status } } };
}

export async function getAgreementCoverage(actor: EnrollmentAgreementActor, status: EnrollmentAgreementCoverageStatus | 'all', page: number): Promise<EnrollmentAgreementCoverage> {
  if (!isAgreementAdmin(actor.role)) throw new EnrollmentAgreementError(403, 'FORBIDDEN', 'Administrator access is required.');
  const base = agreementStudentWhere(actor.organizationId);
  const statuses: EnrollmentAgreementCoverageStatus[] = ['missing', 'pending', 'verified', 'needs_correction'];
  return withTenantScope(actor.organizationId, async (db) => {
    const countsList = await Promise.all(statuses.map((state) => db.user.count({ where: { ...base, ...coverageStatusWhere(actor.organizationId, state) } })));
    const counts = Object.fromEntries(statuses.map((state, index) => [state, countsList[index]])) as EnrollmentAgreementCoverage['counts'];
    const total = status === 'all' ? countsList.reduce((sum, count) => sum + count, 0) : counts[status];
    const rows = await db.user.findMany({
      where: { ...base, ...(status === 'all' ? {} : coverageStatusWhere(actor.organizationId, status)) },
      select: { id: true, fullName: true, enrollmentAgreementSubmissions: {
        where: { organizationId: actor.organizationId, isCurrent: true },
        select: { status: true, uploadedAt: true }, take: 1,
      } },
      orderBy: [{ fullName: 'asc' }, { id: 'asc' }], take: PAGE_SIZE, skip: (page - 1) * PAGE_SIZE,
    });
    return {
      rows: rows.map((row) => ({ memberId: row.id, fullName: row.fullName,
        status: (row.enrollmentAgreementSubmissions[0]?.status ?? 'missing') as EnrollmentAgreementCoverageStatus,
        uploadedAt: row.enrollmentAgreementSubmissions[0]?.uploadedAt.toISOString() ?? null })),
      page, total, hasMore: page * PAGE_SIZE < total, counts,
    };
  });
}
