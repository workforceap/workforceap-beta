import type { AdminUserAttributes } from '@supabase/supabase-js';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

type Admin = ReturnType<typeof getSupabaseAdmin>;

/** ~100 years: Supabase has no "indefinite" ban, only a duration. */
const SOFT_DELETE_BAN_DURATION = '876600h';

/** Valid, per-identity Auth address; the recoverable original stays in the app marker. */
export function retiredAuthEmail(userId: string): string {
  return `deleted-${userId}@deleted.invalid`;
}

function matchesSelectedIdentity(actual: { id: string; email?: string }, userId: string, expectedEmail: string): boolean {
  const email = actual.email?.trim().toLowerCase();
  return actual.id === userId && (email === expectedEmail.trim().toLowerCase() || email === retiredAuthEmail(userId).toLowerCase());
}

export type DisableAuthUserResult =
  | { ok: true; alreadyMissing: boolean }
  | { ok: false; message: string; providerUnchanged?: true };

function isConfirmedMissingAuthUser(error: { status?: number; code?: string }): boolean {
  return error.status === 404 || error.code === 'user_not_found';
}

/** Confirm Auth removal before an app tombstone can be hard-purged. */
export async function deleteAuthUserForErasure(admin: Admin, userId: string): Promise<DisableAuthUserResult> {
  const { data, error: lookupError } = await admin.auth.admin.getUserById(userId);
  if (lookupError) return isConfirmedMissingAuthUser(lookupError)
    ? { ok: true, alreadyMissing: true }
    : { ok: false, message: 'Could not verify the selected sign-in account.' };
  if (!data.user || data.user.id !== userId) {
    return { ok: false, message: 'The selected sign-in identity could not be confirmed.' };
  }
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (!error) return { ok: true, alreadyMissing: false };
  return isConfirmedMissingAuthUser(error)
    ? { ok: true, alreadyMissing: true }
    : { ok: false, message: 'Could not confirm sign-in account deletion.' };
}

/**
 * Admin "soft delete" used to hard-delete the Supabase auth user, which made
 * the app-side restore a no-op for sign-in (the row came back, the login did
 * not — 9/2/26 ops report). Verify the selected identity, ban it, and retire
 * its email so a later signup cannot collide with the deleted Auth address.
 * {@link reenableAuthUserAfterRestore} restores the original address and login.
 */
export async function disableAuthUserForSoftDelete(
  admin: Admin,
  userId: string,
  expectedEmail: string,
): Promise<DisableAuthUserResult> {
  const { data, error: lookupError } = await admin.auth.admin.getUserById(userId);
  if (lookupError) return isConfirmedMissingAuthUser(lookupError)
    ? { ok: true, alreadyMissing: true }
    : { ok: false, message: 'Could not verify the selected sign-in account.', providerUnchanged: true };
  if (!data.user || !matchesSelectedIdentity(data.user, userId, expectedEmail)) {
    return { ok: false, message: 'The sign-in identity does not match the selected account. No Auth account was changed.', providerUnchanged: true };
  }
  const { error } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: SOFT_DELETE_BAN_DURATION,
    email: retiredAuthEmail(userId),
    email_confirm: true,
  });
  if (!error) return { ok: true, alreadyMissing: false };
  if (isConfirmedMissingAuthUser(error)) {
    // Nothing to disable — the auth user is already gone (legacy hard delete).
    return { ok: true, alreadyMissing: true };
  }
  return { ok: false, message: error.message };
}

/**
 * Admin erasure intentionally discards the original email before Auth cleanup.
 * The immutable Auth id must match the selected app User; email cannot be
 * compared on a retry because an erasure marker contains no original address.
 */
export async function disableAuthUserForIrreversibleErase(admin: Admin, userId: string): Promise<DisableAuthUserResult> {
  const { data, error: lookupError } = await admin.auth.admin.getUserById(userId);
  if (lookupError) return isConfirmedMissingAuthUser(lookupError)
    ? { ok: true, alreadyMissing: true }
    : { ok: false, message: 'Could not verify the selected sign-in account.' };
  if (!data.user || data.user.id !== userId) {
    return { ok: false, message: 'The selected sign-in identity could not be confirmed.' };
  }
  const { error } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: SOFT_DELETE_BAN_DURATION,
    email: retiredAuthEmail(userId),
    email_confirm: true,
  });
  if (!error || isConfirmedMissingAuthUser(error)) return { ok: true, alreadyMissing: !!error };
  return { ok: false, message: 'Could not confirm sign-in account retirement.' };
}

export type ReenableAuthUserResult =
  | { ok: true; action: 'unbanned' | 'recreated' }
  | { ok: false; message: string };

/**
 * Bring a restored user's login back. Lifts the soft-delete ban when the auth
 * user still exists; when it was hard-deleted by the old code path, re-creates
 * it under the SAME id (User.id is the auth id and is referenced everywhere)
 * with a confirmed email and no password, so the member finishes with the
 * normal "Reset password" flow.
 */
export async function reenableAuthUserAfterRestore(
  admin: Admin,
  user: { id: string; email: string; fullName?: string | null; phone?: string | null },
): Promise<ReenableAuthUserResult> {
  const email = user.email.trim().toLowerCase();
  const { data: existing, error: lookupError } = await admin.auth.admin.getUserById(user.id);
  if (!lookupError) {
    if (!existing.user || !matchesSelectedIdentity(existing.user, user.id, email)) {
      return { ok: false, message: 'The sign-in identity does not match the selected account. No Auth account was changed.' };
    }
    const { error: unbanError } = await admin.auth.admin.updateUserById(user.id, {
      ban_duration: 'none', email, email_confirm: true,
    });
    return unbanError ? { ok: false, message: unbanError.message } : { ok: true, action: 'unbanned' };
  }
  if (!isConfirmedMissingAuthUser(lookupError)) {
    return { ok: false, message: 'Could not verify the selected sign-in account.' };
  }

  // GoTrue's admin create endpoint accepts a caller-supplied `id`; the
  // supabase-js type does not declare it, hence the cast.
  const attributes = {
    id: user.id,
    email,
    email_confirm: true,
    user_metadata: {
      ...(user.fullName ? { full_name: user.fullName } : {}),
      ...(user.phone ? { phone: user.phone } : {}),
    },
  } as AdminUserAttributes & { id: string };
  const { data, error: createError } = await admin.auth.admin.createUser(attributes);
  if (createError) {
    return { ok: false, message: `Auth user was hard-deleted and could not be re-created: ${createError.message}` };
  }
  if (data.user?.id !== user.id) {
    // The project ignored our id: do not leave a stray auth user behind.
    if (data.user?.id) {
      await admin.auth.admin.deleteUser(data.user.id).catch(() => undefined);
    }
    return {
      ok: false,
      message:
        'Auth user was hard-deleted and the auth service would not re-create it under the original id. Invite the member again from Admin → Invites.',
    };
  }
  return { ok: true, action: 'recreated' };
}
