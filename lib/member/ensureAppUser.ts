import { prisma } from '@/lib/db/prisma';
import { withDbRetry, isConnectionAcquisitionError } from '@/lib/db/withDbRetry';
import { interactiveTransactionsGuaranteed } from '@/lib/db/transactionPolicy';
import { lockBillingMemberLifecycle } from '@/lib/billing/erasureGuard';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { tryCurrentRequestHeaders } from '@/lib/tenant/currentRequestHeaders';
import type { HeadersLike } from '@/lib/tenant/resolveOrgFromRequest';
import { resolveProvisionOrganizationId } from '@/lib/tenant/resolveProvisionOrg';
import { DEFAULT_ORG_SLUG } from '@/lib/tenant/organization';
import { crossTenantOK } from '@/lib/tenant/withTenantScope';
import { ROLE_PRECEDENCE, normalizeRoleName } from '@/lib/auth/roleAccess';

type AuthUser = {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
  app_metadata?: Record<string, unknown> | null;
};

export type EnsureAppUserOptions = {
  /** Already-resolved org from the caller (layout / signup). */
  organizationId?: string | null;
  /** Request headers so host / x-wap-org-id can win over the default org. */
  headers?: HeadersLike;
  /** Never provision rows during the authenticated read-only release audit. */
  readOnlyAudit?: boolean;
};

function isUniqueConstraintError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === 'P2002'
  );
}

function assertAccountActive(state: {
  deletedAt: Date | null;
  billingDeletionPendingAt: Date | null;
  billingDeletionOperationId: string | null;
}): void {
  if (state.deletedAt || state.billingDeletionPendingAt || state.billingDeletionOperationId) {
    throw new Error('This account is no longer active.');
  }
}

/**
 * Self-heal for orphaned Supabase auth users.
 *
 * Background (2026-06-30 incident): several Supabase auth users had NO row in
 * the app `users` table (and some had no `profiles` row). They could sign in
 * via GoTrue, then every Prisma path that assumes a `users` row exists crashed:
 * the `member_events_user_id_fkey` FK on trackEvent during login, "Member not
 * found: <uuid>" on /dashboard and /dashboard/resume, and a P2025 on
 * `prisma.user.update` in /api/member/wioa-qualification.
 *
 * Given an authenticated Supabase user, this provisions the missing app rows
 * (a `users` row in the request org — or default `workforceap` on the
 * canonical host — with role 'member', plus a minimal `profiles` row).
 * When an existing user has a non-member role or portal association but no
 * profile, it restores that profile without granting a baseline member role.
 * The write is one transaction behind the member deletion lifecycle lock.
 * Missing app rows are provisioned only from a fresh server-side Auth lookup,
 * never from the caller's potentially stale user snapshot. It is idempotent —
 * a no-op when the rows already exist — and tolerates concurrent creation only
 * after confirming that this Auth ID now has active app rows. A unique-email
 * collision with another Auth ID must not be mistaken for a successful
 * provision. Existing `users.organizationId` is never overwritten.
 *
 * Writes are wrapped with withDbRetry using isConnectionAcquisitionError so a
 * transient pooler blip while *acquiring* a connection is retried, but an
 * ambiguous mid-commit failure is not (the idempotency check absorbs the rest).
 */
export async function ensureAppUserProvisioned(
  user: AuthUser,
  options: EnsureAppUserOptions = {},
): Promise<void> {
  // Fast path: rows already present. Read is safe to retry broadly.
  const existing = await withDbRetry(() =>
    crossTenantOK(() => prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true, organizationId: true, profile: { select: { userId: true } },
        deletedAt: true, billingDeletionPendingAt: true, billingDeletionOperationId: true,
      },
    })),
  );
  if (existing) assertAccountActive(existing);
  if (existing && existing.profile) return;
  if (options.readOnlyAudit) return;

  const requestHeaders = options.headers ?? (await tryCurrentRequestHeaders());

  try {
    await withDbRetry(
      () =>
        prisma.$transaction(async (tx) => {
          // Deletion takes this lock before marking its operation and touching
          // Auth. On flattened Preview, erasure is disabled; the persisted
          // marker and fresh Auth checks still fail closed.
          if (interactiveTransactionsGuaranteed()) await lockBillingMemberLifecycle(tx, user.id);
          const current = await crossTenantOK(() => tx.user.findUnique({
            where: { id: user.id },
            select: {
              id: true, organizationId: true, profile: { select: { userId: true } },
              deletedAt: true, billingDeletionPendingAt: true, billingDeletionOperationId: true,
            },
          }));
          if (current) assertAccountActive(current);
          if (current?.profile) return;

          let authUser: AuthUser = user;
          if (!current) {
            const { data, error } = await getSupabaseAdmin().auth.admin.getUserById(user.id);
            if (error || !data.user || data.user.id !== user.id) {
              throw new Error('This sign-in account could not be verified.');
            }
            authUser = data.user;
          }
          const email = authUser.email?.trim().toLowerCase() || `${user.id}@placeholder.local`;
          const fullName =
            (typeof authUser.user_metadata?.full_name === 'string' && authUser.user_metadata.full_name.trim()) ||
            'Member';
          const organizationId = current?.organizationId ?? await resolveProvisionOrganizationId({
            explicitOrganizationId: options.organizationId,
            headers: requestHeaders,
            appMetadata: authUser.app_metadata,
            // Resolve the fallback and an uncached custom host on this same
            // connection. Acquiring a second Prisma connection while holding
            // the lifecycle lock can stall a cold provision on a small pool.
            defaultOrgId: async () => {
              const defaultOrg = await tx.organization.findUnique({
                where: { slug: DEFAULT_ORG_SLUG }, select: { id: true },
              });
              if (!defaultOrg) throw new Error(`Default organization missing (slug=${DEFAULT_ORG_SLUG}). Run migrations and seed the default org — do not guess another tenant.`);
              return defaultOrg.id;
            },
            resolveOrgOptions: {
              lookup: async (host) => {
                try {
                  const hostOrg = await tx.organization.findUnique({
                    where: { customDomain: host }, select: { id: true, active: true },
                  });
                  return hostOrg?.active ? hostOrg.id : null;
                } catch {
                  return null;
                }
              },
            },
          });

          const provisioned = await crossTenantOK(() => tx.user.upsert({
            where: { id: user.id },
            create: { id: user.id, organizationId, email, fullName },
            update: {},
            select: { deletedAt: true, billingDeletionPendingAt: true, billingDeletionOperationId: true },
          }));
          assertAccountActive(provisioned);

          // A missing profile is not evidence that this is a member. Existing
          // staff/partner/employer users may still have their role row or portal
          // association, so read those inside the write transaction.
          const account = await tx.user.findUniqueOrThrow({
            where: { id: user.id },
            select: {
              userRoles: { select: { role: { select: { name: true } } } },
              employer: { select: { id: true } },
              partnerUser: { select: { id: true } },
              counselorProfile: { select: { id: true } },
            },
          });
          const roleNames = account.userRoles.map((entry) => normalizeRoleName(entry.role.name));
          if (account.employer) roleNames.push('employer');
          if (account.partnerUser) roleNames.push('partner');
          if (account.counselorProfile) roleNames.push('counselor');
          const nonMemberRole = ROLE_PRECEDENCE.find(
            (role) => role !== 'member' && roleNames.includes(role),
          );

          if (!nonMemberRole) {
            let memberRole = await tx.role.findUnique({ where: { name: 'member' } });
            if (!memberRole) {
              memberRole = await tx.role.create({ data: { name: 'member' } });
            }
            // userId+roleId is unique; skipDuplicates makes the grant idempotent.
            await tx.userRole.createMany({
              data: [{ userId: user.id, roleId: memberRole.id }],
              skipDuplicates: true,
            });
          }

          await tx.profile.upsert({
            where: { userId: user.id },
            create: { userId: user.id, role: nonMemberRole ?? 'member' },
            update: {},
          });
        }),
      { shouldRetry: isConnectionAcquisitionError },
    );
  } catch (err) {
    // P2002 may be a concurrent provision for this Auth ID, or an email already
    // owned by a different Auth ID. Only the committed same-ID User + Profile
    // proves that the former case completed successfully.
    if (isUniqueConstraintError(err)) {
      const committed = await withDbRetry(() =>
        crossTenantOK(() => prisma.user.findUnique({
          where: { id: user.id },
          select: {
            id: true, profile: { select: { userId: true } },
            deletedAt: true, billingDeletionPendingAt: true, billingDeletionOperationId: true,
          },
        })),
      );
      if (committed) assertAccountActive(committed);
      if (committed?.id === user.id && committed.profile?.userId === user.id) return;
      throw new Error('APP_USER_PROVISION_IDENTITY_CONFLICT');
    }
    throw err;
  }
}
