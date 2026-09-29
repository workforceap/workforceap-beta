import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { getUser } from '@/lib/auth/server';
import { prisma } from '@/lib/db/prisma';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { assertStaffCanAccessMemberRecord } from '@/lib/counselor/staffMemberAccess';
import { isResumeObjectPathOwnedByUser } from '@/lib/resume/atomicResumeObjectSwap';
import { inspectStoredEnhancedResume } from '@/lib/resume/inspectStoredEnhancedResume';
import { isReadOnlyPortalAuditHeader } from '@/lib/audit/readOnlyPortalAudit';

import { withApiGuc } from '@/lib/db/withRequestGuc';

const BUCKET = 'member-resumes';

function pathRevision(path: string): string {
  return createHash('sha256').update(path).digest('hex').slice(0, 16);
}

function storageErrorMessage(error: { message?: string } | null, action: 'sign' | 'download'): string {
  const message = error?.message ?? '';
  if (/not found|does not exist|Bucket/i.test(message)) {
    return `Storage is not configured. Create the ${BUCKET} bucket in Supabase Storage.`;
  }
  return action === 'sign' ? 'Could not create resume download link' : 'Could not load resume file';
}

function extOf(p: string | null | undefined) {
  if (!p) return null;
  const base = p.split('/').pop() ?? '';
  const i = base.lastIndexOf('.');
  return i >= 0 ? base.slice(i + 1).toLowerCase() : null;
}

type Props = { params: Promise<{ memberId: string }> };export const GET = withApiGuc(async (req: NextRequest, { params }: Props) => {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  
    const { memberId } = await params;
  
    const allowed = await assertStaffCanAccessMemberRecord(user.id, memberId);
    if (!allowed) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  
    try {
      const profile = await prisma.$transaction((tx) => tx.profile.findUnique({
        where: { userId: memberId },
        select: { resumeOriginalPath: true, resumeEnhancedPath: true },
      }));
  
      const originalPath = profile?.resumeOriginalPath ?? null;
      const enhancedPath = profile?.resumeEnhancedPath ?? null;
      if ((originalPath && !isResumeObjectPathOwnedByUser(memberId, originalPath))
        || (enhancedPath && !isResumeObjectPathOwnedByUser(memberId, enhancedPath))) {
        return NextResponse.json({ error: 'Resume record is invalid' }, { status: 409 });
      }

      if (isReadOnlyPortalAuditHeader(req.headers)) {
        return NextResponse.json({
          hasOriginal: !!originalPath,
          hasEnhanced: !!enhancedPath,
          enhancedUnavailable: false,
          originalUrl: null,
          enhancedUrl: null,
          enhancedText: null,
          originalExt: null,
          enhancedExt: null,
          previewOriginalPath: null,
          previewEnhancedPath: null,
          auditSuppressed: true,
        });
      }
  
      const supabase = getSupabaseAdmin();
      let originalUrl: string | null = null;
      let enhancedUrl: string | null = null;
      let enhancedText: string | null = null;
      let enhancedReadable = false;
  
      if (originalPath) {
        const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(originalPath, 3600);
        if (error || !data?.signedUrl) {
          console.error('[counselor/members/.../resume] createSignedUrl original failed:', error);
          return NextResponse.json({ error: storageErrorMessage(error, 'sign') }, { status: 502 });
        }
        originalUrl = data.signedUrl;
      }
      if (enhancedPath) {
        const { data: fileData, error } = await supabase.storage.from(BUCKET).download(enhancedPath);
        if (error || !fileData) {
          console.error('[counselor/members/.../resume] download enhanced failed:', error);
        } else {
          const inspected = await inspectStoredEnhancedResume(
            Buffer.from(await fileData.arrayBuffer()),
            enhancedPath,
          );
          enhancedReadable = inspected.readable;
          enhancedText = inspected.text;
          if (enhancedReadable) {
            const signed = await supabase.storage.from(BUCKET).createSignedUrl(enhancedPath, 3600);
            if (signed.error || !signed.data?.signedUrl) {
              console.error('[counselor/members/.../resume] createSignedUrl enhanced failed:', signed.error);
              enhancedReadable = false;
              enhancedText = null;
            } else {
              enhancedUrl = signed.data.signedUrl;
            }
          }
        }
      }
  
      const base = `/api/counselor/members/${encodeURIComponent(memberId)}/resume`;
  
      return NextResponse.json({
        hasOriginal: !!originalPath,
        hasEnhanced: enhancedReadable,
        enhancedUnavailable: !!enhancedPath && !enhancedReadable,
        originalUrl,
        enhancedUrl,
        enhancedText,
        originalExt: extOf(originalPath),
        enhancedExt: enhancedReadable ? extOf(enhancedPath) : null,
        previewOriginalPath: originalPath
          ? `${base}/preview?variant=original&v=${pathRevision(originalPath)}`
          : null,
        previewEnhancedPath: enhancedReadable && enhancedPath
          ? `${base}/preview?variant=enhanced&v=${pathRevision(enhancedPath)}`
          : null,
      });
    } catch (err) {
      console.error('[counselor/members/.../resume]', err);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  } catch (error) {
    console.error('/counselor/members/[memberId]/resume:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
