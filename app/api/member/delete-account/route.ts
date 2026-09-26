import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { prisma } from '@/lib/db/prisma';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { logAuditEvent } from '@/lib/audit/log';
import { anonymizeMember } from '@/lib/member/anonymizeMember';
import { isAdmin } from '@/lib/auth/roles';
import { BILLING_SEND_IN_PROGRESS_ERROR, beginBillingDeletion, completeBillingDeletion, releaseBillingDeletion } from '@/lib/billing/erasureGuard';

import { withApiGuc } from '@/lib/db/withRequestGuc';
import {
  ACCOUNT_STORAGE_DELETE_FAILED,
  deleteUserStorageObjects,
} from '@/lib/gdpr/deleteUserStorage';

export const POST = withApiGuc(async () => {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (await isAdmin(user.id)) return NextResponse.json({ error: 'Administrator accounts cannot be deleted from member account settings.' }, { status: 403 });

    const billingDeletion = await beginBillingDeletion(user.id);
    if (!billingDeletion.ok) return NextResponse.json({
    error: billingDeletion.reason === 'unresolved_send' ? BILLING_SEND_IN_PROGRESS_ERROR : 'The account changed during deletion. Reload and try again.',
    code: billingDeletion.reason === 'unresolved_send' ? 'billing_send_unresolved' : 'account_changed',
    }, { status: 409 });
  
    try {
      const storage = await deleteUserStorageObjects(user.id);
      if (!storage.ok) {
        console.error('[delete-account] storage object delete failed:', storage.error);
        await releaseBillingDeletion(user.id, billingDeletion.operationId);
        return NextResponse.json({ error: ACCOUNT_STORAGE_DELETE_FAILED, billingDeletionPending: true }, { status: 502 });
      }

      // WAP-169: soft-delete, release the email from the unique constraint
      // and scrub the profile through the shared anonymiser. The row is kept
      // (anonymised) for DELETED_ACCOUNT_RETENTION_DAYS so an admin can
      // restore the sign-in, then hard-purged by the retention cron. The
      // audit row is written by the helper without the original address —
      // this route used to log `metadata.originalEmail` into the 3-year log.
      const anonymized = await anonymizeMember(user.id, { reason: 'member_self_delete' }, prisma);
      if (anonymized) {
        logAuditEvent({
          user: { id: user.id, role: 'member' },
          verb: 'deleted',
          object: { type: 'User', id: user.id },
          result: { success: true },
        }).catch(() => {});
      }
  
      // Hard-delete from Supabase Auth so the user cannot log back in
      const supabaseAdmin = getSupabaseAdmin();
      const { error } = await supabaseAdmin.auth.admin.deleteUser(user.id);
      if (error) {
        console.error('[delete-account] Supabase auth delete error:', error.message);
        await releaseBillingDeletion(user.id, billingDeletion.operationId);
        return NextResponse.json({ error: 'Failed to delete account' }, { status: 502 });
      }
      await completeBillingDeletion(user.id, billingDeletion.operationId);

      return NextResponse.json({ ok: true });
    } catch (err) {
      console.error('[delete-account] error:', err);
      return NextResponse.json({ error: 'Failed to delete account' }, { status: 500 });
    }
  } catch (error) {
    console.error('/member/delete-account:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
