import { prisma } from '@/lib/db/prisma';
import { withDbRetry, isConnectionAcquisitionError } from '@/lib/db/withDbRetry';
import { tryCurrentRequestHeaders } from '@/lib/tenant/currentRequestHeaders';
import type { HeadersLike } from '@/lib/tenant/resolveOrgFromRequest';
import { resolveProvisionOrganizationId } from '@/lib/tenant/resolveProvisionOrg';
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
 * The write is one transaction. It is idempotent — a no-op when the rows already
 * exist — and tolerates concurrent creation only after confirming that this
 * Auth ID now has both app rows. A unique-email collision with another Auth
 * ID must not be mistaken for a successful provision. Existing
 * `users.organizationId` is never overwritten.
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
    prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true, organizationId: true, profile: { select: { userId: true } } },
    }),
  );
  if (existing && existing.profile) return;
  if (options.readOnlyAudit) return;

  const email = user.email?.trim() || `${user.id}@placeholder.local`;
  const fullName =
    (typeof user.user_metadata?.full_name === 'string' && user.user_metadata.full_name.trim()) ||
    'Member';
  const organizationId = existing?.organizationId ?? await withDbRetry(async () =>
    resolveProvisionOrganizationId({
      explicitOrganizationId: options.organizationId,
      headers: options.headers ?? (await tryCurrentRequestHeaders()),
      appMetadata: user.app_metadata,
    }),
  );

  try {
    await withDbRetry(
      () =>
        prisma.$transaction(async (tx) => {
          await tx.user.upsert({
            where: { id: user.id },
            create: { id: user.id, organizationId, email, fullName },
            update: {},
          });

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
        prisma.user.findUnique({
          where: { id: user.id },
          select: { id: true, profile: { select: { userId: true } } },
        }),
      );
      if (committed?.id === user.id && committed.profile?.userId === user.id) return;
      throw new Error('APP_USER_PROVISION_IDENTITY_CONFLICT');
    }
    throw err;
  }
}
