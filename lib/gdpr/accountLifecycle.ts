import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { interactiveTransactionsGuaranteed } from '@/lib/db/transactionPolicy';
import { EnrollmentAgreementError } from '@/lib/enrollmentAgreements/errors';

type LifecycleClient = Pick<Prisma.TransactionClient, '$queryRaw'>;

async function agreementSafeguardsInstalled(client: LifecycleClient): Promise<boolean> {
  const schema = await client.$queryRaw<Array<{ submissions: boolean; locks: boolean; isolation: string }>>`
    SELECT to_regclass('public.enrollment_agreement_submissions') IS NOT NULL AS submissions,
      to_regclass('public.enrollment_agreement_operation_locks') IS NOT NULL AS locks,
      current_setting('transaction_isolation') AS isolation
  `;
  if (schema.length !== 1 || typeof schema[0].submissions !== 'boolean' || typeof schema[0].locks !== 'boolean') {
    throw new EnrollmentAgreementError(503, 'ACCOUNT_LIFECYCLE_UNAVAILABLE', 'Account safeguards could not be checked. Please retry or contact support.');
  }
  if (!schema[0].submissions && !schema[0].locks) return false;
  if (!schema[0].submissions || !schema[0].locks || !interactiveTransactionsGuaranteed() || schema[0].isolation !== 'read committed') {
    throw new EnrollmentAgreementError(503, 'ACCOUNT_LIFECYCLE_UNAVAILABLE', 'Account changes require complete document safeguards and an interactive transaction. Contact support.');
  }
  return true;
}

/**
 * Used before Auth changes and again inside the final account-write transaction.
 * Existing upload/erasure fences are evidence, never stale locks to clear here.
 */
export async function assertNoAgreementOperationForAccountChange(
  memberId: string,
  client: LifecycleClient = prisma,
  lockInOrganization?: string,
): Promise<void> {
  if (!(await agreementSafeguardsInstalled(client))) return;
  if (lockInOrganization) {
    const member = await client.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM users WHERE id = ${memberId} AND organization_id = ${lockInOrganization} FOR UPDATE
    `;
    if (member.length !== 1) throw new EnrollmentAgreementError(409, 'ACCOUNT_CHANGED', 'The account changed. Reload before trying again.');
  }
  // A separate READ COMMITTED statement after the user lock observes any fence
  // that committed while this request waited. Upload/erasure claims lock users too.
  const rows = await client.$queryRaw<Array<{ present: boolean }>>`
    SELECT EXISTS (SELECT 1 FROM enrollment_agreement_operation_locks WHERE member_id = ${memberId}) AS present
  `;
  if (rows.length !== 1 || typeof rows[0].present !== 'boolean') {
    throw new EnrollmentAgreementError(503, 'ACCOUNT_LIFECYCLE_UNAVAILABLE', 'Document operations could not be checked. Please retry or contact support.');
  }
  if (rows[0].present) throw new EnrollmentAgreementError(409, 'ACCOUNT_DOCUMENT_OPERATION_PENDING',
    'This account has an enrollment document operation or erasure in progress. Contact support to reconcile it before restoring or changing the account. Do not clear its document safeguard.');
}

/** Persistent across the external Auth call; uncertainty deliberately retains it. */
export async function claimAgreementAccountRestore(memberId: string, organizationId: string): Promise<string | null> {
  if (!(await agreementSafeguardsInstalled(prisma))) return null;
  const token = randomUUID();
  const rows = await prisma.$queryRaw<Array<{ token: string }>>`
    WITH member_lock AS (
      SELECT id FROM users WHERE id = ${memberId} AND organization_id = ${organizationId} AND deleted_at IS NOT NULL FOR UPDATE
    )
    INSERT INTO enrollment_agreement_operation_locks (member_id, organization_id, token, state)
      SELECT id, ${organizationId}, ${token}, 'account_restore' FROM member_lock
      ON CONFLICT (member_id) DO NOTHING RETURNING token
  `;
  if (rows.length !== 1 || rows[0].token !== token) throw new EnrollmentAgreementError(409, 'ACCOUNT_DOCUMENT_OPERATION_PENDING',
    'The account changed or has a document/restore operation in progress. Contact support to reconcile it before restoring.');
  return token;
}

/** Must run inside the same native transaction as activation and token release. */
export async function assertAgreementAccountRestoreOwned(memberId: string, organizationId: string, token: string, client: LifecycleClient): Promise<void> {
  if (!(await agreementSafeguardsInstalled(client))) throw new EnrollmentAgreementError(503, 'ACCOUNT_LIFECYCLE_UNAVAILABLE', 'Account restore safeguards are unavailable. Contact support.');
  const rows = await client.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM users WHERE id = ${memberId} AND organization_id = ${organizationId} FOR UPDATE
  `;
  const owned = await client.$queryRaw<Array<{ present: boolean }>>`
    SELECT EXISTS (SELECT 1 FROM enrollment_agreement_operation_locks
      WHERE member_id = ${memberId} AND organization_id = ${organizationId} AND token = ${token} AND state = 'account_restore') AS present
  `;
  if (rows.length !== 1 || owned.length !== 1 || owned[0].present !== true) throw new EnrollmentAgreementError(409, 'ACCOUNT_RESTORE_RECONCILIATION_REQUIRED',
    'The account restore safeguard could not be confirmed. Contact support before retrying.');
}

/** No general unlock: only the exact token in the successful activation transaction. */
export async function releaseAgreementAccountRestore(memberId: string, organizationId: string, token: string, client: Pick<Prisma.TransactionClient, '$executeRaw'>): Promise<void> {
  const released = await client.$executeRaw`
    DELETE FROM enrollment_agreement_operation_locks
    WHERE member_id = ${memberId} AND organization_id = ${organizationId} AND token = ${token} AND state = 'account_restore'
  `;
  if (released !== 1) throw new EnrollmentAgreementError(503, 'ACCOUNT_RESTORE_RECONCILIATION_REQUIRED', 'Account activation could not be confirmed. Contact support.');
}
import 'server-only';
import { randomUUID } from 'node:crypto';
