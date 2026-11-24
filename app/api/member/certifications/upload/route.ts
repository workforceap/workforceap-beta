import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { prisma } from '@/lib/db/prisma';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

import { withApiGuc } from '@/lib/db/withRequestGuc';
import { auditLog } from '@/lib/audit';
import { logAuditEvent } from '@/lib/audit/log';
import { fileMatchesContentType } from '@/lib/uploads/imageSignature';

const BUCKET = 'member-files';
const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

function attachProofToApprovedCert(certId: string, storagePath: string) {
  return prisma.$transaction((tx) =>
    tx.userCertification.updateMany({
      where: { id: certId, status: 'approved' },
      data: { proofUrl: storagePath },
    }),
  );
}

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
    // The bytes must be the type the name claims: staff review this file as
    // proof, so HTML or a renamed file never gets stored as `application/pdf`.
    if (!(await fileMatchesContentType(file, contentType))) {
      return NextResponse.json({ error: 'Only PDF and image files are accepted' }, { status: 400 });
    }
  
    // Verify the cert exists for this user
    const cert = await prisma.$transaction((tx) => tx.userCertification.findUnique({
      where: { userId_certName: { userId: user.id, certName } },
    }));
    if (!cert) {
      return NextResponse.json({ error: 'Certificate not found — add it first' }, { status: 404 });
    }
  
    try {
      const uploadBytes = new Uint8Array(await file.arrayBuffer());
      // Every proof gets its own object (WAP-220). The reviewed bytes stay at
      // their path even if staff approve while this upload is in flight; the
      // old path is kept in the audit entry. Both sit under
      // cert-files/{userId}/, the prefix GDPR erasure removes.
      const storagePath = `cert-files/${user.id}/${cert.id}-${Date.now()}.${ext}`;
      const supabase = getSupabaseAdmin();
  
      const { error } = await supabase.storage.from(BUCKET).upload(storagePath, uploadBytes, {
        upsert: false,
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
      // Status is decided at write time, not from the read above: a pending
      // upload whose row is approved during the storage PUT must not fall
      // through to `status: 'pending'` and undo the review.
      let keptVerified = (await attachProofToApprovedCert(cert.id, storagePath)).count > 0;
      if (!keptVerified) {
        const queued = (
          await prisma.$transaction((tx) =>
            tx.userCertification.updateMany({
              where: { id: cert.id, status: { not: 'approved' } },
              data: {
                status: 'pending',
                proofUrl: storagePath,
                submittedAt: new Date(),
              },
            }),
          )
        ).count > 0;
        if (queued) {
          return NextResponse.json({ success: true, storagePath, status: 'pending' });
        }
        keptVerified = (await attachProofToApprovedCert(cert.id, storagePath)).count > 0;
        if (!keptVerified) {
          return NextResponse.json(
            { error: 'Certificate changed. Reload and try again.', status: 'conflict' },
            { status: 409 },
          );
        }
      }

      const hadProof = !!cert.proofUrl;
      const previousProofUrl = cert.proofUrl ?? null;
      void auditLog({
        actorUserId: user.id,
        action: 'member.certification.proof_attached_verified',
        targetType: 'user_certification',
        targetId: cert.id,
        metadata: { certName: cert.certName, status: 'approved', replacedProof: hadProof, previousProofUrl },
      }).catch(() => {});
      void logAuditEvent({
        user: { id: user.id, role: 'member' },
        verb: 'update',
        object: { type: 'UserCertification', id: cert.id },
        result: {
          success: true,
          extensions: { field: 'proofUrl', status: 'approved', statusKept: true, replacedProof: hadProof, previousProofUrl },
        },
      }).catch(() => {});
      return NextResponse.json({ success: true, storagePath, status: 'approved' });
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
