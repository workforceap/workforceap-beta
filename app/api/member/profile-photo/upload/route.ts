import { NextResponse } from 'next/server';
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

    const storagePath = profilePhotoStoragePath(user.id);
    const previousPath = await prisma.profile.findUnique({
      where: { userId: user.id },
      select: { profilePhotoPath: true },
    });

    const supabase = getSupabaseAdmin();
    const { error: uploadError } = await supabase.storage
      .from(PROFILE_PHOTO_BUCKET)
      .upload(storagePath, arrayBuffer, { upsert: true, contentType });

    if (uploadError) {
      console.error('[member/profile-photo/upload] storage upload failed', uploadError);
      return NextResponse.json(
        { error: profilePhotoStorageErrorMessage(uploadError) },
        { status: 500 },
      );
    }

    await prisma.$transaction((tx) =>
      tx.profile.upsert({
        where: { userId: user.id },
        create: { userId: user.id, profilePhotoPath: storagePath },
        update: { profilePhotoPath: storagePath },
      }),
    );

    if (
      previousPath?.profilePhotoPath &&
      previousPath.profilePhotoPath !== storagePath
    ) {
      await supabase.storage
        .from(PROFILE_PHOTO_BUCKET)
        .remove([previousPath.profilePhotoPath])
        .catch((error) => {
          console.error('[member/profile-photo/upload] stale object cleanup failed', error);
        });
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
