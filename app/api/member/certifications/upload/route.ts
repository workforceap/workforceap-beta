import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getUser } from '@/lib/auth/server';
import { prisma } from '@/lib/db/prisma';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

import { withApiGuc } from '@/lib/db/withRequestGuc';
import { auditLog } from '@/lib/audit';
import { logAuditEvent } from '@/lib/audit/log';
import { fileMatchesContentType } from '@/lib/uploads/imageSignature';
import { assertMemberUploadWritable, isDefiniteStorageRejection, isMemberUploadLifecycleError, MemberUploadDefiniteStorageError, MemberUploadPersistenceOutcomeError, MemberUploadStorageOutcomeError, withMemberUploadClaim } from '@/lib/member/uploadLifecycle';
import { captureApiError } from '@/lib/observability/captureApiError';

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
      const verified = cert.status === 'approved';
      // Every upload gets a fresh path. A rejected write can then remove its
      // staged proof without deleting a prior file or overwriting staff's
      // verified evidence. GDPR erasure scans this member prefix.
      const storagePath = `cert-files/${user.id}/${cert.id}-${randomUUID()}.${ext}`;
      const supabase = getSupabaseAdmin();
      const storage = supabase.storage.from(BUCKET);
      let storageUploadError: { message?: string } | null = null;

      // An already verified (`approved`) certificate stays verified (Mike,
      // WAP-197): the file is saved as its proof, the review state and dates
      // are left alone, and the change is recorded in the audit log so staff
      // can see a new file arrived after verification.
      // The status condition closes the read-then-write window (WAP-220): if
      // staff changed the review between the read above and this write, no
      // row matches and the file goes through the review path below instead.
      let keptVerified: boolean;
      try {
        keptVerified = await withMemberUploadClaim({
          userId: user.id,
          removeObjects: (paths) => storage.remove(paths),
          onCleanupError: (cleanupError) => captureApiError(cleanupError, {
            route: 'member/certifications/upload rejected-object cleanup',
            userId: user.id,
            extra: { storagePath },
          }),
          run: async (operationId, recordAttempt) => {
            recordAttempt(storagePath);
            const uploaded = await storage.upload(storagePath, uploadBytes, {
              upsert: false,
              contentType,
            }).catch((error) => { throw new MemberUploadStorageOutcomeError(error); });
            if (uploaded.error) {
              storageUploadError = uploaded.error;
              throw isDefiniteStorageRejection(uploaded.error)
                ? new MemberUploadDefiniteStorageError(uploaded.error)
                : new MemberUploadStorageOutcomeError(uploaded.error);
            }
            try {
              return await prisma.$transaction(async (tx) => {
                await assertMemberUploadWritable(tx, user.id, operationId);
                if (verified) {
                  const result = await tx.userCertification.updateMany({
                    where: { id: cert.id, userId: user.id, status: 'approved' },
                    data: { proofUrl: storagePath },
                  });
                  if (result.count > 0) return true;
                }
                // A status change during upload sends the proof for review again.
                await tx.userCertification.update({
                  where: { id: cert.id, userId: user.id },
                  data: {
                    status: 'pending',
                    proofUrl: storagePath,
                    submittedAt: new Date(),
                  },
                });
                return false;
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
        if ((error instanceof MemberUploadDefiniteStorageError || error instanceof MemberUploadStorageOutcomeError)
          && storageUploadError && error.causeValue === storageUploadError) {
          console.error('[cert-upload] storage upload failed', storageUploadError);
          return NextResponse.json({ error: storageErrorMessage(storageUploadError) }, { status: 500 });
        }
        throw error;
      }
      if (keptVerified) {
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
      }

      // Otherwise proof submitted → enter the admin review queue. We persist the
      // unique storage path (the `member-files` bucket is private) as
      // `proofUrl`; the admin queue mints a short-lived signed URL from it at
      // render time (same pattern as `/api/admin/members/[id]/resume-urls`).
      // The pointer and pending status were saved in the locked transaction.

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
