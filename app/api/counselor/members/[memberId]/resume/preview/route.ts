import { NextRequest, NextResponse } from 'next/server';
import { Buffer } from 'node:buffer';
import { getUser } from '@/lib/auth/server';
import { prisma } from '@/lib/db/prisma';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { assertStaffCanAccessMemberRecord } from '@/lib/counselor/staffMemberAccess';
import { isResumeObjectPathOwnedByUser } from '@/lib/resume/atomicResumeObjectSwap';
import { inspectStoredEnhancedResume } from '@/lib/resume/inspectStoredEnhancedResume';

import { withApiGuc } from '@/lib/db/withRequestGuc';

const BUCKET = 'member-resumes';

type Props = { params: Promise<{ memberId: string }> };export const GET = withApiGuc(async (req: NextRequest, { params }: Props) => {
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

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error || !data) {
    return NextResponse.json({ error: 'Could not load file' }, { status: 502 });
  }

  const buf = Buffer.from(await data.arrayBuffer());
  if (variant === 'enhanced' && !(await inspectStoredEnhancedResume(buf, path)).readable) {
    return NextResponse.json(
      { error: 'This enhanced resume is not readable. The original file was kept.' },
      { status: 422 },
    );
  }
  const name = path.split('/').pop() ?? 'resume';
  const lower = name.toLowerCase();
  let contentType = 'application/octet-stream';
  if (lower.endsWith('.pdf')) contentType = 'application/pdf';
  else if (lower.endsWith('.docx'))
    contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  else if (lower.endsWith('.doc')) contentType = 'application/msword';

  return new NextResponse(buf, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `inline; filename="${encodeURIComponent(name)}"`,
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
    },
  });

  } catch (error) {
    console.error('/counselor/members/[memberId]/resume/preview error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});

