import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getUser } from '@/lib/auth/server';
import { prisma } from '@/lib/db/prisma';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { withApiGuc } from '@/lib/db/withRequestGuc';
import { auditLog } from '@/lib/audit';
import { logAuditEvent } from '@/lib/audit/log';
import { invalidateMemberState } from '@/lib/member/getMemberState';
import {
  PROFILE_PHOTO_BUCKET,
  PROFILE_PHOTO_MAX_BYTES,
  profilePhotoStorageErrorMessage,
  profilePhotoStoragePath,
  resolveProfilePhotoContentType,
} from '@/lib/portal/memberProfilePhoto';
import { detectImageSignature } from '@/lib/uploads/imageSignature';
import { assertMemberUploadWritable, isMemberUploadLifecycleError, MemberUploadPersistenceOutcomeError, MemberUploadStorageOutcomeError, withMemberUploadClaim } from '@/lib/member/uploadLifecycle';
import { captureApiError } from '@/lib/observability/captureApiError';

export const POST = withApiGuc(async (request: Request) => {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
    }

    const file = formData.get('file');
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: 'Provide a photo file' }, { status: 400 });
    }

    if (file.size > PROFILE_PHOTO_MAX_BYTES) {
      return NextResponse.json({ error: 'Photo is too large (max 5 MB)' }, { status: 413 });
    }

    if (!resolveProfilePhotoContentType(file.name)) {
      return NextResponse.json({ error: 'Use a JPG, PNG, or WebP photo' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    // The bytes decide the type. The editor always names its crop
    // `profile-photo.webp`, but WebKit cannot encode WebP from a canvas and
    // hands back PNG, so the name alone is not a reliable type.
    const contentType = detectImageSignature(new Uint8Array(arrayBuffer, 0, Math.min(12, arrayBuffer.byteLength)));
    if (!contentType) {
      return NextResponse.json({ error: 'Use a JPG, PNG, or WebP photo' }, { status: 400 });
    }

    // A unique key lets a rejected upload be removed without touching the
    // previously committed photo (or an erasure worker's own Storage scan).
    const storagePath = profilePhotoStoragePath(user.id, randomUUID());

    const supabase = getSupabaseAdmin();
    const storage = supabase.storage.from(PROFILE_PHOTO_BUCKET);
    let uploadError: { message?: string } | null = null;
    let previousPath: string | null;
    try {
      previousPath = await withMemberUploadClaim({
        userId: user.id,
        removeObjects: (paths) => storage.remove(paths),
        onCleanupError: (cleanupError) => captureApiError(cleanupError, {
          route: 'member/profile-photo/upload rejected-object cleanup',
          userId: user.id,
          extra: { storagePath },
        }),
        run: async (operationId, recordAttempt) => {
          recordAttempt(storagePath);
          const uploaded = await storage.upload(storagePath, arrayBuffer, { upsert: false, contentType })
            .catch((error) => { throw new MemberUploadStorageOutcomeError(error); });
          if (uploaded.error) {
            uploadError = uploaded.error;
            throw new MemberUploadStorageOutcomeError(uploaded.error);
          }
          try {
            return await prisma.$transaction(async (tx) => {
              await assertMemberUploadWritable(tx, user.id, operationId);
              const previous = await tx.profile.findUnique({
                where: { userId: user.id },
                select: { profilePhotoPath: true },
              });
              await tx.profile.upsert({
                where: { userId: user.id },
                create: { userId: user.id, profilePhotoPath: storagePath },
                update: { profilePhotoPath: storagePath },
              });
              return previous?.profilePhotoPath ?? null;
            });
          } catch (error) {
            if (isMemberUploadLifecycleError(error)) throw error;
            throw new MemberUploadPersistenceOutcomeError(error);
          }
        },
      });
    } catch (error) {
      if (isMemberUploadLifecycleError(error)) {
        return NextResponse.json({ error: 'This account is no longer accepting uploads.' }, { status: 409 });
      }
      if (error instanceof MemberUploadStorageOutcomeError && uploadError && error.causeValue === uploadError) {
        console.error('[member/profile-photo/upload] storage upload failed', uploadError);
        return NextResponse.json({ error: profilePhotoStorageErrorMessage(uploadError) }, { status: 500 });
      }
      throw error;
    }

    if (
      previousPath &&
      previousPath !== storagePath
    ) {
      try {
        const { error: removeError } = await supabase.storage
          .from(PROFILE_PHOTO_BUCKET)
          .remove([previousPath]);
        if (removeError) throw removeError;
      } catch (error) {
        captureApiError(error, {
          route: 'member/profile-photo/upload previous-object cleanup',
          userId: user.id,
          extra: { previousPath },
        });
      }
    }

    await invalidateMemberState(user.id);

    auditLog({
      actorUserId: user.id,
      action: 'member.profilePhoto.upload',
      targetType: 'ProfilePhoto',
      targetId: user.id,
    }).catch(() => {});
    logAuditEvent({
      user: { id: user.id, role: 'member' },
      verb: 'update',
      object: { type: 'ProfilePhoto', id: user.id },
      result: { success: true },
    }).catch(() => {});

    return NextResponse.json({ ok: true, path: storagePath });
  } catch (error) {
    console.error('/member/profile-photo/upload error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
