import { prisma } from '@/lib/db/prisma';
import { crossTenantOK } from '@/lib/tenant/withTenantScope';

/**
 * First name of the signed-in user for the person-facing greeting
 * ("Welcome back, {first name}.") on the counselor, employer and partner homes.
 *
 * Returns `undefined` when the name is unknown or the lookup is unavailable
 * (for example a test that mocks the Prisma client without the `user` model),
 * so the page keeps its workspace title instead of failing. One primary-key
 * read; never throws. Call it inside the page's existing `Promise.all` so it
 * costs no serial round trip. The users row is the source of truth: Auth
 * `user_metadata.full_name` is free but goes stale, because the admin
 * edit-profile and counselor profile routes update `users.full_name` only.
 */
export async function signedInFirstName(userId: string): Promise<string | undefined> {
  // The signed-in user's own row by the verified session id (never request
  // input). An id is unique across tenants, so this cannot reach another
  // tenant's data; `crossTenantOK` records that for the tenant ratchet
  // (docs/TENANT-ISOLATION.md "Allowlist").
  return crossTenantOK(async () => {
    const model = (prisma as { user?: { findUnique?: typeof prisma.user.findUnique } }).user;
    if (typeof model?.findUnique !== 'function') return undefined;
    try {
      const row = await model.findUnique({ where: { id: userId }, select: { fullName: true } });
      return row?.fullName?.trim().split(/\s+/)[0] || undefined;
    } catch {
      return undefined;
    }
  });
}
