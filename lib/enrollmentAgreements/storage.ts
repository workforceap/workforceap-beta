import 'server-only';
import { createHash } from 'node:crypto';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { EnrollmentAgreementError } from './errors';

export const AGREEMENT_BUCKET = 'member-files';
export function agreementStoragePath(memberId: string, submissionId: string): string {
  return `enrollment-agreements/${memberId}/${submissionId}.pdf`;
}
export const agreementSha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

/** Fail closed on a missing or public bucket; never silently change bucket policy. */
export async function requirePrivateAgreementStorage() {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.storage.getBucket(AGREEMENT_BUCKET);
    if (error || !data || data.public !== false) throw new Error('Private bucket preflight failed');
    return supabase.storage.from(AGREEMENT_BUCKET);
  } catch {
    // No upload has been issued at this point. Classify rejected promises as
    // preflight failures too, so the caller can safely release its own fence.
    throw new EnrollmentAgreementError(503, 'PRIVATE_STORAGE_UNAVAILABLE', 'Private enrollment document storage is unavailable. Please contact the team.');
  }
}

export async function storeAgreementPdf(storagePath: string, bytes: Uint8Array): Promise<void> {
  const storage = await requirePrivateAgreementStorage();
  const { error } = await storage.upload(storagePath, bytes, { contentType: 'application/pdf', upsert: false, cacheControl: '0' });
  if (error) throw new EnrollmentAgreementError(503, 'UPLOAD_UNAVAILABLE', 'The upload outcome could not be confirmed. Please contact the team before retrying.');
}

/** Called only for this request's newly staged UUID after a failed database write. */
export async function removeStagedAgreementPdf(storagePath: string): Promise<void> {
  const storage = await requirePrivateAgreementStorage();
  const { error } = await storage.remove([storagePath]);
  if (error) throw new EnrollmentAgreementError(503, 'UPLOAD_CLEANUP_UNAVAILABLE', 'The upload could not be completed. Please contact the team before retrying.');
}

export async function readStoredAgreementPdf(row: { id: string; memberId: string; storagePath: string; sha256: string; sizeBytes: number }): Promise<Uint8Array> {
  if (row.storagePath !== agreementStoragePath(row.memberId, row.id)) throw new EnrollmentAgreementError(503, 'DOCUMENT_UNAVAILABLE', 'This document is temporarily unavailable.');
  const storage = await requirePrivateAgreementStorage();
  const { data, error } = await storage.download(row.storagePath);
  if (error || !data || data.size !== row.sizeBytes) throw new EnrollmentAgreementError(503, 'DOCUMENT_UNAVAILABLE', 'This document is temporarily unavailable.');
  const bytes = new Uint8Array(await data.arrayBuffer());
  if (agreementSha256(bytes) !== row.sha256) throw new EnrollmentAgreementError(503, 'DOCUMENT_UNAVAILABLE', 'This document is temporarily unavailable.');
  return bytes;
}

export function agreementPdfResponse(bytes: Uint8Array, filename: string): Response {
  return new Response(Buffer.from(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(bytes.byteLength),
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "sandbox; default-src 'none'",
      'Referrer-Policy': 'no-referrer',
    },
  });
}
