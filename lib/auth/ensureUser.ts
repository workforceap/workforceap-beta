import { prisma } from '@/lib/db/prisma';
import { interactiveTransactionsGuaranteed } from '@/lib/db/transactionPolicy';
import { lockBillingMemberLifecycle } from '@/lib/billing/erasureGuard';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { tryCurrentRequestHeaders } from '@/lib/tenant/currentRequestHeaders';
import type { HeadersLike } from '@/lib/tenant/resolveOrgFromRequest';
import { resolveProvisionOrganizationId } from '@/lib/tenant/resolveProvisionOrg';

type SupabaseUser = {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
  app_metadata?: Record<string, unknown>;
};

export type EnsureUserOptions = {
  /** Already-resolved org from the caller. Never overwrites an existing row. */
  organizationId?: string | null;
  /** Request headers so host / x-wap-org-id can win over the default org. */
  headers?: HeadersLike;
  programSlug?: string | null;
};

/**
 * Ensures the Supabase auth user exists in the Prisma users table.
 * Call before saving AI results, job applications, etc. so foreign keys succeed.
 *
 * Organization is resolved via `resolveProvisionOrganizationId` (request host /
 * x-wap-org-id / explicit / unique program / default). Existing
 * `users.organizationId` is never overwritten.
 */
export async function ensureUserInDb(
  supabaseUser: SupabaseUser,
  options: EnsureUserOptions = {},
) {
  const organizationId = await resolveProvisionOrganizationId({
    explicitOrganizationId: options.organizationId,
    headers: options.headers ?? (await tryCurrentRequestHeaders()),
    appMetadata: supabaseUser.app_metadata,
    programSlug: options.programSlug,
  });

  try {
    await prisma.$transaction(async (tx) => {
      // The account deletion barrier takes this lock before setting its
      // persistent marker. On Preview transactions are flattened, but billing
      // erasure is disabled there; the persisted state check still applies.
      if (interactiveTransactionsGuaranteed()) await lockBillingMemberLifecycle(tx, supabaseUser.id);

      const existing = await tx.user.findUnique({
        where: { id: supabaseUser.id },
        select: { deletedAt: true, billingDeletionPendingAt: true, billingDeletionOperationId: true },
      });
      if (existing) {
        if (existing.deletedAt || existing.billingDeletionPendingAt || existing.billingDeletionOperationId) {
          throw new Error('This account is no longer active.');
        }
        return;
      }

      // A request can retain an old getUser() result while an administrator
      // erases Auth and the app row. Verify the identity again only when the
      // app row is absent, while still holding the deletion lifecycle lock.
      const { data, error } = await getSupabaseAdmin().auth.admin.getUserById(supabaseUser.id);
      if (error || !data.user || data.user.id !== supabaseUser.id) {
        throw new Error('This sign-in account could not be verified.');
      }
      const email = data.user.email?.trim().toLowerCase() || `${supabaseUser.id}@placeholder.local`;
      const fullName = typeof data.user.user_metadata?.full_name === 'string'
        ? data.user.user_metadata.full_name
        : 'Member';
      // A signup path may have created this same Auth ID while we verified
      // it. Keep the existing no-op update semantics and never rebind an org.
      const provisioned = await tx.user.upsert({
        where: { id: supabaseUser.id },
        create: { id: supabaseUser.id, organizationId, email, fullName },
        update: {},
        select: { deletedAt: true, billingDeletionPendingAt: true, billingDeletionOperationId: true },
      });
      if (provisioned.deletedAt || provisioned.billingDeletionPendingAt || provisioned.billingDeletionOperationId) {
        throw new Error('This account is no longer active.');
      }
    });
  } catch (err: unknown) {
    // An email collision does not prove identity equivalence. Rebinding User.id
    // would transfer roles and every cascading relation to another Auth identity.
    const isUniqueError =
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code: string }).code === 'P2002';

    if (isUniqueError) {
      throw new Error('Account identity conflict. An administrator must verify the existing account before setup can continue.');
    } else {
      throw err;
    }
  }
}
