import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
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
import { eraseEnrollmentAgreementData } from '@/lib/gdpr/enrollmentAgreementData';
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
 * Permanently removes a member and all cascading data after the
 * legal-hold period, or immediately if `force=true` is passed by
 * a super-admin.
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
      return NextResponse.json({ error: ACCOUNT_STORAGE_DELETE_FAILED }, { status: 502 });
    }

    // Optionally anonymize instead of hard-delete for members that still
    // have active program enrollments. Admins can pass force=true to
    // override, but the default is hard-delete.
    const shouldAnonymize = !force && existing.deletedAt == null && existing.courseEnrollments.length > 0;

    if (shouldAnonymize) {
      // Anonymize: scramble PII but keep enrollment records for reporting
      const hash = `anon_${Buffer.from(id).toString('base64url').slice(0, 12)}`;
      // This route's enrolled-member branch does not call anonymizeMember.
      // Clear all submission metadata after blob deletion, before reporting
      // anonymization; this remains required when the upload feature is off.
      await withTenantScope(orgId, (db) => eraseEnrollmentAgreementData(id, db));
      await withTenantScope(orgId, (db) =>
        db.user.update({
          where: { id },
          data: {
            email: `${hash}@anonymized.invalid`,
            fullName: 'Anonymized User',
            phone: null,
            assessmentAnswers: Prisma.JsonNull,
            careerRecommendationJson: Prisma.JsonNull,
            wioaQualificationJson: Prisma.JsonNull,
            wioaReviewNotes: null,
            deletedAt: new Date(),
          },
        }),
      );

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

    // Hard delete via Prisma cascading relations
    await withTenantScope(orgId, (db) => db.user.delete({ where: { id } }));

    // Also remove from Supabase Auth so the identity cannot be reused
    const supabaseAdmin = getSupabaseAdmin();
    const { error } = await supabaseAdmin.auth.admin.deleteUser(id);
    if (error) {
      console.error(`[gdpr-erase] Supabase auth delete error for ${id}:`, error.message);
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
