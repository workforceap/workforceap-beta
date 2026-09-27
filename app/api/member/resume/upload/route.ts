import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
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
import { awardPoints } from '@/lib/member/points';

import { withApiGuc } from '@/lib/db/withRequestGuc';
import { auditLog } from '@/lib/audit';
import { logAuditEvent } from '@/lib/audit/log';
import { checkResumeUploadRateLimit } from '@/lib/rate-limit';
import { isMemberUploadLifecycleError } from '@/lib/member/uploadLifecycle';

/** Create bucket `member-resumes` in Supabase Dashboard → Storage if it does not exist (private bucket is fine). */
const BUCKET = 'member-resumes';
export const POST = withApiGuc(async (request: Request) => {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { success: withinUploadLimit } = await checkResumeUploadRateLimit(user.id);
    if (!withinUploadLimit) {
      return NextResponse.json({ error: 'Too many resume uploads. Please try again later.' }, { status: 429 });
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
    }

    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ error: 'Provide a file' }, { status: 400 });
    }

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
        userId: user.id,
        uploads: [{
          field: 'resumeOriginalPath',
          extension: prepared.extension,
          contentType: prepared.contentType,
          body: prepared.bytes,
        }],
        clearFields: ['resumeEnhancedPath'],
        uploadObject: (path, body, options) => storage.upload(path, body, options),
        removeObjects: (paths) => storage.remove(paths),
        swapProfilePaths: (nextPaths) => swapResumeProfilePathsWithCas(user.id, nextPaths),
        onCleanupError: (error, paths) => {
          console.error('[member/resume/upload] object cleanup failed', { error, paths });
        },
      });
    } catch (error) {
      if (error instanceof AtomicResumeObjectSwapError && error.phase === 'upload') {
        console.error('Resume upload error:', error.causeValue);
        if (/not found|does not exist|Bucket/i.test(error.message)) {
          return NextResponse.json({ error: 'Storage is not configured. Create the member-resumes bucket in Supabase (Storage).' }, { status: 500 });
        }
        return NextResponse.json({ error: 'Failed to upload resume' }, { status: 500 });
      }
      if (isResumeProfileConflict(error)) {
        return NextResponse.json(
          { error: 'Your resume changed in another session. Reload and try again.' },
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

    // Award points for first resume upload (idempotent — fixed entityId means
    // re-uploading the same or a new resume only awards once).
    awardPoints(user.id, 'resume_uploaded', 'first-upload').catch(() => {});

    auditLog({ actorUserId: user.id, action: 'member.resume.upload', targetType: 'Resume', targetId: user.id }).catch(() => {});
    logAuditEvent({ user: { id: user.id, role: 'member' }, verb: 'create', object: { type: 'Resume', id: user.id }, result: { success: true } }).catch(() => {});
    return NextResponse.json({
      ok: true,
      path,
      extractionWarning: prepared.extractionWarning,
      enhancedInvalidated: Boolean(swapped.previousPaths.resumeEnhancedPath),
    });
  } catch (e) {
    console.error('Resume upload route error:', e);
    const msg =
      e instanceof Error && e.message.includes('SUPABASE_SERVICE_ROLE_KEY')
        ? 'Server configuration error (Supabase)'
        : 'Failed to process upload';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
});
