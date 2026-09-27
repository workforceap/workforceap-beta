import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { isAdmin } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import {
  prepareResumeUpload,
  ResumeUploadValidationError,
} from '@/lib/resume/prepareResumeUpload';
import {
  AtomicResumeObjectSwapError,
  type ResumeObjectUpload,
} from '@/lib/resume/atomicResumeObjectSwap';
import {
  isResumeProfileConflict,
  replaceClaimedResumeObjects,
  swapResumeProfilePathsWithCas,
} from '@/lib/resume/resumeProfileStorage';
import {
  hasSubstantiveResumeText,
  RESUME_TEXT_SAVE_ERROR,
  sanitizeResumePlainText,
} from '@/lib/resume/extractionQuality';
import { completeCareerOsResumeActions } from '@/lib/workflows/completeCareerOsActions';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import { auditLog } from '@/lib/audit';
import { auditRequestMeta, logAuditEvent } from '@/lib/audit/log';
import { isMemberUploadLifecycleError } from '@/lib/member/uploadLifecycle';

import { withApiGuc } from '@/lib/db/withRequestGuc';

// Create bucket "member-resumes" in Supabase Dashboard → Storage if it does not exist
const BUCKET = 'member-resumes';
const MAX_ENHANCED_RESUME_CHARS = 120_000;
export const POST = withApiGuc(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  try {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await isAdmin(user.id)))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id: userId } = await params;

  // Tenant scope: an admin can only upload resumes for members of
  // their organization. Without this filter, an admin from Org A
  // could overwrite an Org B member's resume blob.
  const orgId = await getActorOrganizationId(user.id);
  const member = await prisma.$transaction((tx) => tx.user.findFirst({
    where: { id: userId, organizationId: orgId },
    include: { profile: true },
  }));
  if (!member || member.deletedAt) {
    return NextResponse.json({ error: 'Member not found' }, { status: 404 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const file = formData.get('resumeOriginal') as File | null;
  const enhancedEntry = formData.get('resumeEnhanced');
  const enhancedText = typeof enhancedEntry === 'string' ? enhancedEntry : null;
  const hasOriginalFile = Boolean(file && file.size > 0);

  if (!hasOriginalFile && !enhancedText?.trim()) {
    return NextResponse.json({ error: 'Provide resumeOriginal file and/or resumeEnhanced text' }, { status: 400 });
  }

  let preparedOriginal: Awaited<ReturnType<typeof prepareResumeUpload>> | null = null;
  if (hasOriginalFile && file) {
    try {
      preparedOriginal = await prepareResumeUpload(file);
    } catch (error) {
      if (error instanceof ResumeUploadValidationError) {
        return NextResponse.json({ error: error.message, code: error.code }, { status: 400 });
      }
      throw error;
    }
  }

  let safeEnhancedText: string | null = null;
  if (enhancedText?.trim()) {
    if (enhancedText.length > MAX_ENHANCED_RESUME_CHARS) {
      return NextResponse.json(
        { error: 'Enhanced resume text is too large (max 120,000 characters).' },
        { status: 413 },
      );
    }
    safeEnhancedText = sanitizeResumePlainText(enhancedText);
    if (!hasSubstantiveResumeText(safeEnhancedText)) {
      return NextResponse.json(
        { error: RESUME_TEXT_SAVE_ERROR, code: 'resume_text_unreadable' },
        { status: 400 },
      );
    }
  }

  // Construct the storage client only after every supplied resume variant has
  // passed validation. A failure above therefore preserves both profile paths
  // and the blobs they currently reference.
  const supabase = getSupabaseAdmin();
  const storage = supabase.storage.from(BUCKET);
  const uploads: ResumeObjectUpload[] = [];
  if (preparedOriginal) {
    uploads.push({
      field: 'resumeOriginalPath',
      extension: preparedOriginal.extension,
      contentType: preparedOriginal.contentType,
      body: preparedOriginal.bytes,
    });
  }
  if (safeEnhancedText) {
    uploads.push({
      field: 'resumeEnhancedPath',
      extension: 'txt',
      contentType: 'text/plain',
      body: safeEnhancedText,
    });
  }

  let swapped: Awaited<ReturnType<typeof replaceClaimedResumeObjects>>;
  try {
    swapped = await replaceClaimedResumeObjects({
      userId,
      uploads,
      clearFields: preparedOriginal && !safeEnhancedText ? ['resumeEnhancedPath'] : [],
      uploadObject: (path, body, options) => storage.upload(path, body, options),
      removeObjects: (paths) => storage.remove(paths),
      swapProfilePaths: (nextPaths, operationId) => swapResumeProfilePathsWithCas(userId, nextPaths, operationId),
      onCleanupError: (error, paths) => {
        console.error('[admin/upload-resume] object cleanup failed', { error, paths });
      },
    });
  } catch (error) {
    if (error instanceof AtomicResumeObjectSwapError && error.phase === 'upload') {
      if (error.field === 'resumeEnhancedPath') {
        console.error('Enhanced resume upload error:', error.causeValue);
        return NextResponse.json({ error: 'Failed to upload enhanced resume' }, { status: 500 });
      }
      console.error('Resume upload error:', error.causeValue);
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
  const originalPath = swapped.paths.resumeOriginalPath ?? null;
  const enhancedPath = swapped.paths.resumeEnhancedPath ?? null;

  if (enhancedPath && safeEnhancedText && hasSubstantiveResumeText(safeEnhancedText)) {
    await completeCareerOsResumeActions(userId).catch((error) => {
      console.error('[admin/upload-resume] completeCareerOsResumeActions failed:', error);
    });
  }

  auditLog({
    actorUserId: user.id,
    action: 'admin_member_resume_upload',
    targetType: 'User',
    targetId: userId,
    metadata: { originalPath, enhancedPath },
  }).catch((err) => console.error('[upload-resume] audit log failed:', err));
  logAuditEvent({
    user: { id: user.id, role: 'admin' },
    verb: 'uploaded',
    object: { type: 'MemberResume', id: userId },
    result: { success: true, extensions: { originalPath, enhancedPath } },
    request: auditRequestMeta(request),
  }).catch((err) => console.error('[upload-resume] xAPI audit log failed:', err));

  return NextResponse.json({
    ok: true,
    originalPath,
    enhancedPath,
    extractionWarning: preparedOriginal?.extractionWarning ?? null,
    enhancedInvalidated: Boolean(
      preparedOriginal && !safeEnhancedText && swapped.previousPaths.resumeEnhancedPath,
    ),
  });

  } catch (error) {
    console.error('/admin/members/[id]/upload-resume error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});

