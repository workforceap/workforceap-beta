import { prisma } from '@/lib/db/prisma';
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
  const email = supabaseUser.email?.trim().toLowerCase() || `${supabaseUser.id}@placeholder.local`;
  const fullName = (supabaseUser.user_metadata?.full_name as string) ?? 'Member';

  const organizationId = await resolveProvisionOrganizationId({
    explicitOrganizationId: options.organizationId,
    headers: options.headers ?? (await tryCurrentRequestHeaders()),
    appMetadata: supabaseUser.app_metadata,
    programSlug: options.programSlug,
  });

  try {
    await prisma.user.upsert({
      where: { id: supabaseUser.id },
      create: {
        id: supabaseUser.id,
        organizationId,
        email,
        fullName,
      },
      update: {},
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
