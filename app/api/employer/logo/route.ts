import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { getEmployerForUser } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { resolveSupabasePublicAssetUrl } from '@/lib/storage/publicAssetUrl';

import { withApiGuc } from '@/lib/db/withRequestGuc';
import { auditLog } from '@/lib/audit';
import { logAuditEvent } from '@/lib/audit/log';
import { fileMatchesContentType } from '@/lib/uploads/imageSignature';

const BUCKET = 'employer-logos';
const MAX_SIZE = 2 * 1024 * 1024;export const POST = withApiGuc(async (request: Request) => {
  try {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const ctx = await getEmployerForUser(user.id);
  if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json({ error: 'Expected a multipart form upload with a `file` field' }, { status: 400 });
  }
  const file = formData.get('file') as File | null;
  if (!file || file.size === 0) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'File too large (max 2MB)' }, { status: 400 });
  }

  const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
  if (!['png', 'jpg', 'jpeg'].includes(ext)) {
    return NextResponse.json({ error: 'Use PNG or JPG only' }, { status: 400 });
  }
  const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg' };
  const contentType = MIME[ext] ?? 'image/png';
  // Logos are served publicly under this content type, so the bytes must
  // really be that image (a `.png` holding JPEG or HTML is refused).
  if (!(await fileMatchesContentType(file, contentType))) {
    return NextResponse.json({ error: 'Use PNG or JPG only' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const path = `${ctx.employerId}/logo.${ext}`;
  const uploadBytes = new Uint8Array(await file.arrayBuffer());

  const { error } = await supabase.storage.from(BUCKET).upload(path, uploadBytes, {
    upsert: true,
    contentType,
  });

  if (error) {
    console.error('[employer logo] upload error:', error);
    return NextResponse.json(
      { error: 'Upload failed. Ensure the employer-logos bucket exists in Supabase Storage.' },
      { status: 500 }
    );
  }

  await prisma.$transaction((tx) => tx.employer.update({
    where: { id: ctx.employerId },
    data: { logoUrl: path },
  }));

  auditLog({ actorUserId: user.id, action: 'employer_logo_uploaded', targetType: 'Employer', targetId: ctx.employerId, metadata: { path } }).catch(() => {});
  logAuditEvent({ user: { id: user.id, role: 'employer' }, verb: 'uploaded', object: { type: 'EmployerLogo', id: ctx.employerId }, result: { success: true, extensions: { path } } }).catch(() => {});

  return NextResponse.json({ ok: true, logoUrl: resolveSupabasePublicAssetUrl(BUCKET, path) });

  } catch (error) {
    console.error('/employer/logo error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
