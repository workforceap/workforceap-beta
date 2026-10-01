import { NextRequest, NextResponse } from 'next/server';
import { Buffer } from 'node:buffer';
import { getUser } from '@/lib/auth/server';
import { prisma } from '@/lib/db/prisma';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { assertStaffCanAccessMemberRecord } from '@/lib/counselor/staffMemberAccess';
import { isResumeObjectPathOwnedByUser } from '@/lib/resume/atomicResumeObjectSwap';
import { extractTextFromResumeBuffer } from '@/lib/resume/extractTextFromResumeBuffer';
import { hasSubstantiveResumeText, sanitizeResumePlainText } from '@/lib/resume/extractionQuality';
import { resumePlainTextPreviewHtml } from '@/lib/resume/resumePreviewHtml';

import { withApiGuc } from '@/lib/db/withRequestGuc';

const BUCKET = 'member-resumes';

type Props = { params: Promise<{ memberId: string }> };export const POST = withApiGuc(async (req: NextRequest, { params }: Props) => {
  try {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { memberId } = await params;
  const allowed = await assertStaffCanAccessMemberRecord(user.id, memberId);
  if (!allowed) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const variant = req.nextUrl.searchParams.get('variant') === 'enhanced' ? 'enhanced' : 'original';

  const profile = await prisma.$transaction((tx) => tx.profile.findUnique({
    where: { userId: memberId },
    select: { resumeOriginalPath: true, resumeEnhancedPath: true },
  }));

  const path =
    variant === 'enhanced' ? profile?.resumeEnhancedPath : profile?.resumeOriginalPath;
  if (!path) {
    return NextResponse.json({ error: 'No file for this variant' }, { status: 404 });
  }
  if (!isResumeObjectPathOwnedByUser(memberId, path)) {
    return NextResponse.json({ error: 'Resume record is invalid' }, { status: 409 });
  }

  const lower = path.toLowerCase();
  if (!lower.endsWith('.docx') && !lower.endsWith('.doc')) {
    return NextResponse.json({ error: 'Not a Word document' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error || !data) {
    return NextResponse.json({ error: 'Could not load file' }, { status: 502 });
  }

  const buf = Buffer.from(await data.arrayBuffer());
  try {
    const text = await extractTextFromResumeBuffer(buf, lower.endsWith('.docx') ? 'docx' : 'doc');
    const safeText = variant === 'enhanced' ? sanitizeResumePlainText(text) : text;
    if (variant === 'enhanced' && !hasSubstantiveResumeText(safeText)) {
      return NextResponse.json(
        { error: 'This enhanced resume is not readable. The original file was kept.' },
        { status: 422 },
      );
    }
    return NextResponse.json({
      html: resumePlainTextPreviewHtml(safeText),
    });
  } catch {
    return NextResponse.json(
      { error: 'Could not convert this document for preview. Try PDF or download the file.' },
      { status: 422 }
    );
  }

  } catch (error) {
    console.error('/counselor/members/[memberId]/resume/docx-html error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});

