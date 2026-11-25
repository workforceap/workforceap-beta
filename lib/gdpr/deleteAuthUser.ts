import { getSupabaseAdmin } from '@/lib/supabase-admin';

type SupabaseAdminClient = ReturnType<typeof getSupabaseAdmin>;

/**
 * True only when Auth confirms it has no row for this id. Hard-erase treats
 * that as success so a retry can still remove the application row, so a
 * false positive here deletes the app row while the login survives — the
 * exact revival bug the erase route closes. A bare 404 (wrong base URL, a
 * proxy) or an unrelated "… not found" message is NOT confirmation: GoTrue
 * answers a missing user with code `user_not_found`, or 404 "User not found"
 * on older servers.
 */
export function isSupabaseAuthUserMissing(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const record = error as { message?: unknown; status?: unknown; code?: unknown };
  if (record.code === 'user_not_found') return true;
  return (
    record.status === 404 &&
    typeof record.message === 'string' &&
    /\buser not found\b/i.test(record.message)
  );
}

export async function deleteSupabaseAuthUser(
  userId: string,
  supabaseAdmin?: SupabaseAdminClient,
) {
  try {
    const admin = supabaseAdmin ?? getSupabaseAdmin();
    return await admin.auth.admin.deleteUser(userId);
  } catch (error) {
    return { error };
  }
}
