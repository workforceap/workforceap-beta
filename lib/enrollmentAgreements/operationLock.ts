import 'server-only';
import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/db/prisma';
import { crossTenantOK, withTenantScope } from '@/lib/tenant/withTenantScope';
import type { EnrollmentAgreementActor } from './access';
import { EnrollmentAgreementError } from './errors';

/** SQL ownership plus a persistent fence spans the external storage phase. */
export async function acquireEnrollmentAgreementUploadLock(actor: EnrollmentAgreementActor, memberId: string, token: string = randomUUID()): Promise<string> {
  const claimed = await prisma.$queryRaw<{ token: string }[]>`
    WITH member_lock AS (
      SELECT id FROM users WHERE id = ${memberId} AND organization_id = ${actor.organizationId} AND deleted_at IS NULL FOR UPDATE
    )
    INSERT INTO enrollment_agreement_operation_locks (member_id, organization_id, token, state)
      SELECT id, ${actor.organizationId}, ${token}, 'upload' FROM member_lock
      ON CONFLICT (member_id) DO NOTHING RETURNING token
  `;
  if (claimed.length !== 1) throw new EnrollmentAgreementError(409, 'AGREEMENT_OPERATION_IN_PROGRESS', 'An upload or account-erasure operation is already in progress. Reload before trying again.');
  return token;
}

/** Release only this upload's token after a definitive completion/compensation. */
export async function releaseEnrollmentAgreementUploadLock(actor: EnrollmentAgreementActor, memberId: string, token: string): Promise<void> {
  const released = await prisma.$executeRaw`
    DELETE FROM enrollment_agreement_operation_locks
    WHERE member_id = ${memberId} AND organization_id = ${actor.organizationId} AND token = ${token} AND state = 'upload'
  `;
  if (released !== 1) throw new EnrollmentAgreementError(503, 'AGREEMENT_LOCK_RECONCILIATION_REQUIRED', 'This upload needs a support check before another upload. Reload the agreement history.');
}

export async function assertEnrollmentAgreementNotErasing(memberId: string, organizationId: string): Promise<void> {
  const fence = await withTenantScope(organizationId, (db) => db.enrollmentAgreementOperationLock.findFirst({
    where: { memberId, organizationId, state: 'erasure' }, select: { memberId: true },
  }));
  if (fence) throw new EnrollmentAgreementError(409, 'ACCOUNT_ERASURE_IN_PROGRESS', 'Enrollment documents are unavailable while account erasure is in progress.');
}

/**
 * Called only by the already-authorized shared account storage eraser, before
 * listing any object. Independent of feature flags: disabling UI never disables
 * privacy cleanup. Missing BOTH new tables is a safe pre-rollout no-op.
 * No TTL, forced unlock, or rollback to upload-capable state is allowed here.
 */
export async function claimEnrollmentAgreementErasure(memberId: string): Promise<void> {
  const schema = await crossTenantOK(() => prisma.$queryRaw<{ submissions: string | null; locks: string | null }[]>`
    SELECT to_regclass('public.enrollment_agreement_submissions')::text AS submissions,
      to_regclass('public.enrollment_agreement_operation_locks')::text AS locks
  `);
  if (schema.length !== 1) throw new EnrollmentAgreementError(503, 'AGREEMENT_ERASURE_UNAVAILABLE', 'Document-erasure safeguards are unavailable.');
  if (!schema[0].submissions && !schema[0].locks) return;
  if (!schema[0].submissions || !schema[0].locks) throw new EnrollmentAgreementError(503, 'AGREEMENT_ERASURE_UNAVAILABLE', 'Document-erasure safeguards require a support check.');
  const token = randomUUID();
  // Cross-tenant marker is intentional: the eraser already authorized this
  // specific member. Derive organization from that member, never a default org.
  const rows = await crossTenantOK(() => prisma.$queryRaw<{ memberExists: boolean; claimed: boolean }[]>`
    WITH member_lock AS (
      SELECT id, organization_id FROM users WHERE id = ${memberId} FOR UPDATE
    ), claim AS (
      INSERT INTO enrollment_agreement_operation_locks (member_id, organization_id, token, state)
        SELECT id, organization_id, ${token}, 'erasure' FROM member_lock
        ON CONFLICT (member_id) DO UPDATE SET state = 'erasure'
        WHERE enrollment_agreement_operation_locks.state = 'erasure'
        RETURNING member_id
    ) SELECT EXISTS (SELECT 1 FROM member_lock) AS "memberExists", EXISTS (SELECT 1 FROM claim) AS claimed
  `);
  if (rows.length !== 1 || (rows[0].memberExists && !rows[0].claimed)) {
    throw new EnrollmentAgreementError(503, 'AGREEMENT_UPLOAD_IN_PROGRESS', 'An enrollment agreement upload is still in progress. Account erasure has not started; please retry later.');
  }
}
