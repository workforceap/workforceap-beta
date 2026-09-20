import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { isAdmin } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { resolveSupabasePublicAssetUrl } from '@/lib/storage/publicAssetUrl';
import { getActorOrganizationId } from '@/lib/tenant/organization';

import { withApiGuc } from '@/lib/db/withRequestGuc';
import { auditLog } from '@/lib/audit';

const BUCKET = 'organization-branding';
const MAX_SIZE = 2 * 1024 * 1024;export const POST = withApiGuc(async (request: Request) => {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!(await isAdmin(user.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    // Use the actor's organization, not the platform default. Without this a
    // tenant admin (whose User.organizationId is not the default WorkforceAP
    // org) could overwrite the default tenant's branding by uploading their
    // own logo, AND would never be able to update their own tenant's logo.
    const organizationId = await getActorOrganizationId(user.id);

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
    if (!['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) {
      return NextResponse.json({ error: 'Use PNG, JPG, WebP, or GIF' }, { status: 400 });
    }
    const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' };
    const contentType = MIME[ext] ?? 'image/png';

    const supabase = getSupabaseAdmin();
    const path = `${organizationId}/logo.${ext}`;
    const uploadBytes = new Uint8Array(await file.arrayBuffer());

    const { error } = await supabase.storage.from(BUCKET).upload(path, uploadBytes, {
      upsert: true,
      contentType,
    });

    if (error) {
      console.error('[org logo] upload error:', error);
      return NextResponse.json(
        {
          error:
            'Upload failed. Create a public Supabase Storage bucket named organization-branding (same pattern as employer-logos).',
        },
        { status: 500 }
      );
    }

    await prisma.$transaction((tx) => tx.organization.update({
      where: { id: organizationId },
      data: { logo: path },
    }));

    // Audit (WAP-18): tenant branding change.
    void auditLog({
      actorUserId: user.id,
      action: 'admin_org_logo_upload',
      targetType: 'organization',
      targetId: organizationId,
      metadata: { path, contentType, bytes: file.size },
    }).catch(() => {});

    return NextResponse.json({ ok: true, logo: resolveSupabasePublicAssetUrl(BUCKET, path) });
  } catch (error) {
    console.error('[admin/organization/logo] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
