import { getSupabaseAdmin } from '@/lib/supabase-admin';

type SupabaseAdminClient = ReturnType<typeof getSupabaseAdmin>;

/**
 * True when Auth already has no row for this id. Hard-erase must treat that
 * as success so a retry can still remove the application row.
 */
export function isSupabaseAuthUserMissing(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const record = error as { message?: unknown; status?: unknown; code?: unknown };
  if (record.status === 404 || record.code === 'user_not_found') return true;
  return typeof record.message === 'string' && /user.*not.*found|not found/i.test(record.message);
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
