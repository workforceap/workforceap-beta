import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { isAdmin, isCounselor, isSuperAdmin } from '@/lib/auth/roles';
import { resolveActOnBehalf } from '@/lib/auth/actAsSubject';
import { withTenantScope } from '@/lib/tenant/withTenantScope';
import { getSubjectOrganizationId } from "@/lib/tenant/organization";
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import {
  prepareResumeUpload,
  ResumeUploadValidationError,
} from '@/lib/resume/prepareResumeUpload';
import {
  AtomicResumeObjectSwapError,
  replaceResumeObjectsAtomically,
} from '@/lib/resume/atomicResumeObjectSwap';
import {
  isResumeProfileConflict,
  swapResumeProfilePathsWithCas,
} from '@/lib/resume/resumeProfileStorage';
import { auditLog } from '@/lib/audit';
import { logAuditEvent } from '@/lib/audit/log';
import { isMemberUploadLifecycleError } from '@/lib/member/uploadLifecycle';

import { withApiGuc } from '@/lib/db/withRequestGuc';

/**
 * Track A — Tenant Isolation Hardening (Sprint A.2 batch 5).
 * See `docs/PROGRAM-ENTERPRISE-GRADE.md` and `docs/TENANT-ISOLATION.md`.
 *
 * The member existence check goes through `withTenantScope` so a
 * counselor from Org A cannot upload a resume to an Org B member's
 * profile by guessing the UUID. `Profile` is NOT in
 * `TENANT_SCOPED_MODELS` — it inherits tenancy via the `userId` FK to
 * `User` — so the upsert stays on the raw client; the membership gate
 * above prevents cross-tenant writes.
 */

const BUCKET = 'member-resumes';
export const POST = withApiGuc(async (request: Request) => {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  
    const [counselorRole, adminRole, superAdminRole] = await Promise.all([
      isCounselor(user.id),
      isAdmin(user.id),
      isSuperAdmin(user.id),
    ]);
    if (!counselorRole && !adminRole && !superAdminRole) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
    }
  
    const memberId = formData.get('memberId');
    if (!memberId || typeof memberId !== 'string') {
      return NextResponse.json({ error: 'memberId is required' }, { status: 400 });
    }

    const onBehalf = await resolveActOnBehalf(user.id, memberId);
    if (!onBehalf.ok) {
      return NextResponse.json({ error: onBehalf.error }, { status: onBehalf.status });
    }
    const authorizedMemberId = onBehalf.subjectUserId;
  
    const orgId = await getSubjectOrganizationId(authorizedMemberId);
    const member = await withTenantScope(orgId, (db) =>
      db.user.findFirst({
        where: { id: authorizedMemberId },
        select: { id: true },
      }),
    );
    if (!member) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    }
  
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'Provide a file' }, { status: 400 });

    let prepared: Awaited<ReturnType<typeof prepareResumeUpload>>;
    try {
      prepared = await prepareResumeUpload(file);
    } catch (error) {
      if (error instanceof ResumeUploadValidationError) {
        return NextResponse.json({ error: error.message, code: error.code }, { status: 400 });
      }
      throw error;
    }

    const supabase = getSupabaseAdmin();
    const storage = supabase.storage.from(BUCKET);
    let swapped: Awaited<ReturnType<typeof replaceResumeObjectsAtomically>>;
    try {
      swapped = await replaceResumeObjectsAtomically({
        userId: authorizedMemberId,
        uploads: [{
          field: 'resumeOriginalPath',
          extension: prepared.extension,
          contentType: prepared.contentType,
          body: prepared.bytes,
        }],
        clearFields: ['resumeEnhancedPath'],
        uploadObject: (path, body, options) => storage.upload(path, body, options),
        removeObjects: (paths) => storage.remove(paths),
        swapProfilePaths: (nextPaths) => swapResumeProfilePathsWithCas(authorizedMemberId, nextPaths),
        onCleanupError: (error, paths) => {
          console.error('[upload-resume] object cleanup failed', { error, paths });
        },
      });
    } catch (error) {
      if (error instanceof AtomicResumeObjectSwapError && error.phase === 'upload') {
        console.error('[upload-resume] storage error', error.causeValue);
        return NextResponse.json({ error: 'Failed to upload resume' }, { status: 500 });
      }
      if (isResumeProfileConflict(error)) {
        return NextResponse.json(
          { error: 'This resume changed while the upload was running. Reload and try again.' },
          { status: 409 },
        );
      }
      if (isMemberUploadLifecycleError(error)) {
        return NextResponse.json({ error: 'This account is no longer accepting uploads.' }, { status: 409 });
      }
      throw error;
    }
    const path = swapped.paths.resumeOriginalPath;
    if (!path) throw new Error('Resume profile swap did not return an original path');
  
    auditLog({
      actorUserId: user.id,
      action: 'counselor_upload_resume',
      targetType: 'User',
      targetId: authorizedMemberId,
      metadata: { path, orgId },
    }).catch(() => {});
    logAuditEvent({
      user: { id: user.id, role: 'counselor' },
      verb: 'uploaded',
      object: { type: 'Resume', id: authorizedMemberId },
      result: { success: true, extensions: { path } },
      orgId,
    }).catch(() => {});

    return NextResponse.json({
      ok: true,
      text: prepared.text.slice(0, 8000),
      extractionWarning: prepared.extractionWarning,
      enhancedInvalidated: Boolean(swapped.previousPaths.resumeEnhancedPath),
    });
  } catch (error) {
    console.error('/counselor/sessions/upload-resume:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
