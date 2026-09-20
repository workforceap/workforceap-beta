import { NextResponse } from 'next/server';
import { auditLog } from '@/lib/audit';
import { logAuditEvent } from '@/lib/audit/log';
import { createServerClient } from '@supabase/ssr';
import { prisma } from '@/lib/db/prisma';
import { getUser } from '@/lib/auth/server';
import { getSupabaseCookieOptions } from '@/lib/supabaseCookieOptions';
import { cookies } from 'next/headers';
import { getSupabaseEnv } from '@/lib/supabase/env';
import { deleteSupabaseAuthUser } from '@/lib/gdpr/deleteAuthUser';
import {
  ACCOUNT_STORAGE_DELETE_FAILED,
  deleteUserStorageObjects,
} from '@/lib/gdpr/deleteUserStorage';

import { withApiGuc } from '@/lib/db/withRequestGuc';
import { persistEvent } from '@/lib/events/track';
import { anonymizeMember } from '@/lib/member/anonymizeMember';

export const POST = withApiGuc(async (request: Request) => {
  try {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!user.email) {
    // Password re-authentication requires an email on the account.
    // Accounts without an email (e.g. phone-only auth) must use a different deletion flow.
    return NextResponse.json(
      { error: 'Account has no email on file; password re-authentication is not possible.' },
      { status: 400 },
    );
  }

  let body: { password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
  const password = typeof body?.password === 'string' ? body.password : '';
  if (!password) {
    return NextResponse.json({ error: 'Password confirmation required' }, { status: 400 });
  }

  // Re-authenticate to confirm ownership before destructive action
  const cookieStore = await cookies();
  const cookieOpts = getSupabaseCookieOptions(false);
  const { url: supabaseUrl, anonKey: supabaseAnonKey } = getSupabaseEnv();

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookieOptions: cookieOpts,
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options as Parameters<typeof cookieStore.set>[2]);
          });
        },
      },
    }
  );

  const { error: authError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password,
  });
  if (authError) {
    return NextResponse.json({ error: 'Incorrect password. Account deletion cancelled.' }, { status: 403 });
  }

  // Revoke Supabase session first (prevents continued use)
  await supabase.auth.signOut({ scope: 'global' });

  const userId = user.id;

  const storage = await deleteUserStorageObjects(userId);
  if (!storage.ok) {
    console.error('[gdpr/delete] storage object delete failed:', storage.error);
    return NextResponse.json({ error: ACCOUNT_STORAGE_DELETE_FAILED }, { status: 502 });
  }

  // WAP-169: same anonymiser as /api/member/delete-account and the retention
  // purge. The two raw UPDATEs this replaced left the phone number and every
  // special-category column (disability, income, veteran status, ethnicity,
  // barriers, work authorisation) in place and never set `deleted_at`, so
  // these rows were kept indefinitely. The helper also sets `deleted_at`, so
  // the 30-day purge now removes the row like any other deletion.
  await anonymizeMember(userId, { reason: 'gdpr_account_delete' }, prisma);

  // Mark as deleted. (This used to be a raw INSERT that bound the metadata
  // as text into the jsonb column, which PostgreSQL rejects with 42804 — so
  // every deletion 500'd here, after the rows above were already anonymized.)
  await persistEvent({
    userId,
    eventName: 'account_deleted',
    entityType: 'gdpr',
    metadata: { deletedAt: new Date().toISOString(), reason: 'user_requested' },
  }, prisma);

  // Delete Supabase auth user (irreversible — prevents re-login with old credentials)
  let deleteAuthError: unknown = null;
  try {
    const result = await deleteSupabaseAuthUser(userId);
    deleteAuthError = result.error;
  } catch (error) {
    deleteAuthError = error;
  }

  if (deleteAuthError) {
    console.error('[gdpr/delete] Supabase auth delete failed:', deleteAuthError);
    return NextResponse.json(
      {
        error: 'Account data was anonymized, but auth deletion failed. Please contact support to complete account deletion.',
      },
      { status: 500 },
    );
  }

  // The actor snapshot is pinned: `users.email` is now the recoverable
  // deleted marker (which embeds the original address for the 30-day restore
  // window), and letting auditLog look the actor up would copy it into the
  // 3-year `actor_email_snapshot` — the leak WAP-169 exists to close.
  auditLog({
    actorUserId: userId,
    action: 'gdpr_account_delete',
    targetType: 'User',
    targetId: userId,
    actorEmailSnapshot: null,
    actorRoleSnapshot: 'member',
  }).catch(() => {});
  logAuditEvent({ user: { id: userId, role: 'member' }, verb: 'deleted', object: { type: 'User', id: userId }, result: { success: true } }).catch(() => {});
  return NextResponse.json({
    ok: true,
    message: 'Your account has been deleted. Personal data has been anonymized and all sessions revoked.',
  });

  } catch (error) {
    console.error('/gdpr/delete error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
