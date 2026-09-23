import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { prisma } from '@/lib/db/prisma';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

import { withApiGuc } from '@/lib/db/withRequestGuc';
import { auditLog } from '@/lib/audit';
import { logAuditEvent } from '@/lib/audit/log';

const BUCKET = 'member-files';
const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

function storageErrorMessage(error: { message?: string } | null): string {
  const message = error?.message ?? '';
  if (/not found|does not exist|Bucket/i.test(message)) {
    return `Storage is not configured. Create the ${BUCKET} bucket in Supabase Storage.`;
  }
  return 'Failed to attach certificate file';
}export const POST = withApiGuc(async (req: NextRequest) => {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  
    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
    }
  
    const file = formData.get('file') as File | null;
    const certName = formData.get('certName') as string | null;
  
    if (!file || !certName) {
      return NextResponse.json({ error: 'file and certName are required' }, { status: 400 });
    }
    // WAP-77: never stage an empty object as certificate proof (the logo
    // routes already refuse size 0; this route silently uploaded zero bytes).
    if (file.size === 0) {
      return NextResponse.json({ error: 'The selected file is empty' }, { status: 400 });
    }
  
    if (file.size > MAX_SIZE_BYTES) {
      return NextResponse.json({ error: 'File too large (max 10MB)' }, { status: 413 });
    }
  
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (!['pdf', 'png', 'jpg', 'jpeg', 'webp'].includes(ext)) {
      return NextResponse.json({ error: 'Only PDF and image files are accepted' }, { status: 400 });
    }
    const MIME: Record<string, string> = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };
    const contentType = MIME[ext] ?? 'application/octet-stream';
  
    // Verify the cert exists for this user
    const cert = await prisma.$transaction((tx) => tx.userCertification.findUnique({
      where: { userId_certName: { userId: user.id, certName } },
    }));
    if (!cert) {
      return NextResponse.json({ error: 'Certificate not found — add it first' }, { status: 404 });
    }
  
    try {
      const uploadBytes = new Uint8Array(await file.arrayBuffer());
      const storagePath = `cert-files/${user.id}/${cert.id}.${ext}`;
      const supabase = getSupabaseAdmin();
  
      const { error } = await supabase.storage.from(BUCKET).upload(storagePath, uploadBytes, {
        upsert: true,
        contentType,
      });
  
      if (error) {
        console.error('[cert-upload] storage upload failed', error);
        return NextResponse.json({ error: storageErrorMessage(error) }, { status: 500 });
      }

      // An already verified (`approved`) certificate stays verified (Mike,
      // WAP-197): the file is saved as its proof, the review state and dates
      // are left alone, and the change is recorded in the audit log so staff
      // can see a new file arrived after verification.
      if (cert.status === 'approved') {
        await prisma.$transaction((tx) =>
          tx.userCertification.update({
            where: { id: cert.id },
            data: { proofUrl: storagePath },
          }),
        );
        const hadProof = !!cert.proofUrl;
        void auditLog({
          actorUserId: user.id,
          action: 'member.certification.proof_attached_verified',
          targetType: 'user_certification',
          targetId: cert.id,
          metadata: { certName: cert.certName, status: 'approved', replacedProof: hadProof },
        }).catch(() => {});
        void logAuditEvent({
          user: { id: user.id, role: 'member' },
          verb: 'update',
          object: { type: 'UserCertification', id: cert.id },
          result: { success: true, extensions: { field: 'proofUrl', status: 'approved', statusKept: true, replacedProof: hadProof } },
        }).catch(() => {});
        return NextResponse.json({ success: true, storagePath, status: 'approved' });
      }

      // Otherwise proof submitted → enter the admin review queue. We persist the
      // stable storage path (the `member-files` bucket is private) as
      // `proofUrl`; the admin queue mints a short-lived signed URL from it at
      // render time (same pattern as `/api/admin/members/[id]/resume-urls`).
      // Flip status to `pending` and stamp `submittedAt` so the row surfaces
      // for review.
      await prisma.$transaction((tx) =>
        tx.userCertification.update({
          where: { id: cert.id },
          data: {
            status: 'pending',
            proofUrl: storagePath,
            submittedAt: new Date(),
          },
        }),
      );

      return NextResponse.json({ success: true, storagePath, status: 'pending' });
    } catch (e) {
      console.error('[cert-upload] storage upload failed', e);
      const error =
        e instanceof Error && e.message.includes('SUPABASE_SERVICE_ROLE_KEY')
          ? 'Server configuration error (Supabase)'
          : 'Failed to attach certificate file';
      return NextResponse.json({ error }, { status: 500 });
    }
  } catch (error) {
    console.error('/member/certifications/upload:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
