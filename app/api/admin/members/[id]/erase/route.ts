import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { isAdmin, isSuperAdmin } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { logCronRun } from '@/lib/admin/logCronRun';
import { withTenantScope } from '@/lib/tenant/withTenantScope';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import { hasAdminAccess } from '@/lib/auth/roleAccess';
import { auditLog } from '@/lib/audit';
import { auditRequestMeta, logAuditEvent } from '@/lib/audit/log';

import { withApiGuc } from '@/lib/db/withRequestGuc';
import { BILLING_SEND_IN_PROGRESS_ERROR, beginBillingDeletion, completeBillingDeletion, releaseBillingDeletion } from '@/lib/billing/erasureGuard';
import { anonymizeMember } from '@/lib/member/anonymizeMember';
import { deleteAuthUserForErasure, disableAuthUserForSoftDelete } from '@/lib/admin/authUserLifecycle';
import {
  ACCOUNT_STORAGE_DELETE_FAILED,
  MEMBER_FILES_BUCKET,
  MEMBER_RESUME_BUCKET,
  deleteUserStorageObjects,
} from '@/lib/gdpr/deleteUserStorage';

/**
 * POST /api/admin/members/[id]/erase
 *
 * GDPR right-to-erasure (hard delete).
 *
 * Permanently removes a member and cascading account data after the
 * account retention period, or immediately if `force=true` is passed by
 * a super-admin. Issued billing packets detach from the deleted account and
 * remain in the finance archive with their signed snapshot and send history.
 *
 * Records the erasure in WorkflowDiagnostic for compliance auditing.
 */
export const POST = withApiGuc(async (
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) => {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!(await isAdmin(user.id))) return NextResponse.json({ error: 'Forbidden: admin access required' }, { status: 403 });

    const { id } = await params;
    if (id === user.id) return NextResponse.json({ error: 'You cannot erase your own administrator account.' }, { status: 403 });
    const body: unknown = await request.json().catch(() => null);
    const force = !!body && typeof body === 'object' && (body as { force?: unknown }).force === true;
    
    // Force erase is only allowed for super-admins
    if (force && !(await isSuperAdmin(user.id))) {
      return NextResponse.json(
        { error: 'Forbidden: force erase requires super-admin privileges' },
        { status: 403 }
      );
    }

    const orgId = await getActorOrganizationId(user.id);

    // Tenant scope: lookup + write wrapped in withTenantScope so an
    // admin from Org A cannot GDPR-erase a member from Org B by guessing
    // their UUID. findFirst (not findUnique) because the scope proxy
    // adds organizationId to the where clause.
    const existing = await withTenantScope(orgId, (db) =>
      db.user.findFirst({
        where: { id },
        include: {
          profile: true,
          userRoles: { select: { role: { select: { name: true } } } },
          auditLogs: true,
          memberEvents: true,
          messagesAuthored: true,
          courseEnrollments: true,
          userCertifications: { select: { proofUrl: true } },
        },
      }),
    );

    if (!existing) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    }
    if (hasAdminAccess(existing.profile?.role ?? 'member', existing.userRoles.map((entry) => entry.role.name))) return NextResponse.json({ error: 'Administrator accounts cannot be erased from member management.' }, { status: 403 });

    const billingDeletion = await beginBillingDeletion(id, orgId);
    if (!billingDeletion.ok) return NextResponse.json({
      error: billingDeletion.reason === 'unresolved_send' ? BILLING_SEND_IN_PROGRESS_ERROR : 'The account changed during erasure. Reload and try again.',
      code: billingDeletion.reason === 'unresolved_send' ? 'billing_send_unresolved' : 'account_changed',
    }, { status: 409 });

    const extraPaths = [
      existing.profile?.resumeOriginalPath
        ? { bucket: MEMBER_RESUME_BUCKET, path: existing.profile.resumeOriginalPath }
        : null,
      existing.profile?.resumeEnhancedPath
        ? { bucket: MEMBER_RESUME_BUCKET, path: existing.profile.resumeEnhancedPath }
        : null,
      ...existing.userCertifications.map((cert) =>
        cert.proofUrl ? { bucket: MEMBER_FILES_BUCKET, path: cert.proofUrl } : null,
      ),
    ].filter((row): row is { bucket: string; path: string } => Boolean(row));

    const storage = await deleteUserStorageObjects(id, { extraPaths });
    if (!storage.ok) {
      console.error(`[gdpr-erase] storage object delete failed for ${id}:`, storage.error);
      await releaseBillingDeletion(id, billingDeletion.operationId);
      return NextResponse.json({ error: ACCOUNT_STORAGE_DELETE_FAILED, billingDeletionPending: true }, { status: 502 });
    }

    // Optionally anonymize instead of hard-delete for members that still
    // have active program enrollments. Admins can pass force=true to
    // override, but the default is hard-delete.
    const shouldAnonymize = !force && existing.deletedAt == null && existing.courseEnrollments.length > 0;

    if (shouldAnonymize) {
      // Scrub User and Profile PII together while preserving enrollment rows.
      await anonymizeMember(id, { reason: 'admin_erase', actorUserId: user.id }, prisma);
      let authDisabled;
      try {
        authDisabled = await disableAuthUserForSoftDelete(getSupabaseAdmin(), id, existing.email);
      } catch (authError) {
        console.error(`[gdpr-erase] Auth retirement outcome unknown for ${id}:`, authError);
        return NextResponse.json({ error: 'Sign-in retirement requires reconciliation.', reconciliationRequired: true }, { status: 503 });
      }
      if (!authDisabled.ok) {
        return NextResponse.json({ error: 'Sign-in retirement could not be confirmed.', reconciliationRequired: true }, { status: 502 });
      }
      await completeBillingDeletion(id, billingDeletion.operationId);

      await logCronRun('gdpr_erase', {
        memberId: id,
        action: 'anonymize',
        anonymizedBy: user.id,
      }, 'ok');

      await auditLog({
        actorUserId: user.id,
        action: 'member_anonymize',
        targetType: 'user',
        targetId: id,
        metadata: { orgId, action: 'anonymize' },
      });
      const actorRole = (await isSuperAdmin(user.id)) ? 'super_admin' : 'admin';
      await logAuditEvent({
        user: { id: user.id, role: actorRole },
        verb: 'voided',
        object: { type: 'User', id },
        result: { success: true, extensions: { action: 'anonymize', orgId } },
        request: auditRequestMeta(request),
        orgId,
      }).catch((err) => console.error('[audit] member anonymize:', err));

      return NextResponse.json({ ok: true, action: 'anonymize', memberId: id });
    }

    // Retain a deleted app tombstone while Auth is removed. Existing JWTs
    // remain denied even if the provider request fails or times out.
    await anonymizeMember(id, { reason: 'admin_erase', actorUserId: user.id }, prisma);
    let authDeleted;
    try {
      authDeleted = await deleteAuthUserForErasure(getSupabaseAdmin(), id);
    } catch (authError) {
      console.error(`[gdpr-erase] Auth deletion outcome unknown for ${id}:`, authError);
      return NextResponse.json({ error: 'Sign-in deletion requires reconciliation.', reconciliationRequired: true }, { status: 503 });
    }
    if (!authDeleted.ok) {
      return NextResponse.json({ error: 'Sign-in deletion could not be confirmed.', reconciliationRequired: true }, { status: 502 });
    }
    const removed = await withTenantScope(orgId, (db) => db.user.deleteMany({
      where: { id, billingDeletionOperationId: billingDeletion.operationId },
    }));
    if (removed.count !== 1) {
      return NextResponse.json({ error: 'Account erasure could not be confirmed.', reconciliationRequired: true }, { status: 503 });
    }

    await logCronRun('gdpr_erase', {
      memberId: id,
      action: 'hard_delete',
      deletedBy: user.id,
      force,
    }, 'ok');

    await auditLog({
      actorUserId: user.id,
      action: 'member_hard_delete',
      targetType: 'user',
      targetId: id,
      metadata: { orgId, action: 'hard_delete', force },
    });
    const actorRole = (await isSuperAdmin(user.id)) ? 'super_admin' : 'admin';
    await logAuditEvent({
      user: { id: user.id, role: actorRole },
      verb: 'deleted',
      object: { type: 'User', id },
      result: { success: true, extensions: { action: 'hard_delete', force, orgId } },
      request: auditRequestMeta(request),
      orgId,
    }).catch((err) => console.error('[audit] member hard_delete:', err));

    return NextResponse.json({ ok: true, action: 'hard_delete', memberId: id });
  } catch (error) {
    console.error('[admin/members/[id]/erase POST] error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
