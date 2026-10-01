import 'server-only';

import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { sha256Hex } from './canonical';
import {
  SIGNATURE_ASSET_MIME,
  inspectSignaturePng,
  signatureAssetObjectKey,
  type InspectedSignaturePng,
} from './signatureAsset';
import { configuredBucket, FinanceArchiveError, requirePrivateBucket, type Options } from './storageArchive';

/**
 * Server-only, exact-byte I/O for the designated signer's approved signature
 * image in the private `billing-finance` bucket, under
 * `signature/{organizationId}/{signerUserId}/{sha256}.png`.
 *
 * Same rules as the PDF archive (storageArchive.ts): the bucket must be the
 * audited private one, keys are content-addressed, nothing is overwritten or
 * deleted, no public or signed URL is ever produced, and every read verifies
 * the size, type and SHA-256 against the database reference. Callers own who
 * may upload (the designated signer only) and the database row.
 */

const SAFE_ID = /^[A-Za-z0-9-]{1,64}$/;
const SHA256_HEX = /^[0-9a-f]{64}$/;

export type SignatureObjectRef = Readonly<{
  organizationId: string;
  signerUserId: string;
  bucket: string;
  key: string;
  sha256: string;
  byteLength: number;
}>;

function assertRefShape(ref: SignatureObjectRef, bucket: string): void {
  if (
    !ref || typeof ref !== 'object' ||
    typeof ref.organizationId !== 'string' || !SAFE_ID.test(ref.organizationId) ||
    typeof ref.signerUserId !== 'string' || !SAFE_ID.test(ref.signerUserId) ||
    ref.bucket !== bucket ||
    typeof ref.sha256 !== 'string' || !SHA256_HEX.test(ref.sha256) ||
    ref.key !== signatureAssetObjectKey(ref.organizationId, ref.signerUserId, ref.sha256) ||
    !Number.isInteger(ref.byteLength) || ref.byteLength < 34
  ) {
    throw new FinanceArchiveError('INVALID_REFERENCE');
  }
}

/** Return only verified bytes: bucket/key, PNG type, size, SHA-256 and PNG structure must all agree with the reference. */
export async function readSignaturePng(ref: SignatureObjectRef, options: Options = {}): Promise<Uint8Array> {
  const bucket = configuredBucket(options.env ?? process.env);
  assertRefShape(ref, bucket);
  const admin = options.admin ?? getSupabaseAdmin();
  await requirePrivateBucket(admin, bucket);
  const api = admin.storage.from(bucket);

  let info: Awaited<ReturnType<typeof api.info>>;
  try {
    info = await api.info(ref.key);
  } catch {
    throw new FinanceArchiveError('STORAGE_UNAVAILABLE');
  }
  if (info.error || !info.data) throw new FinanceArchiveError('STORAGE_UNAVAILABLE');
  if (info.data.bucketId !== bucket || info.data.name !== ref.key || info.data.contentType !== SIGNATURE_ASSET_MIME || info.data.size !== ref.byteLength) {
    throw new FinanceArchiveError('INTEGRITY_MISMATCH');
  }

  let downloaded: Awaited<ReturnType<typeof api.download>>;
  try {
    downloaded = await api.download(ref.key);
  } catch {
    throw new FinanceArchiveError('STORAGE_UNAVAILABLE');
  }
  if (downloaded.error || !downloaded.data) throw new FinanceArchiveError('STORAGE_UNAVAILABLE');
  if (downloaded.data.size !== ref.byteLength || (downloaded.data.type && downloaded.data.type !== SIGNATURE_ASSET_MIME)) {
    throw new FinanceArchiveError('INTEGRITY_MISMATCH');
  }
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await downloaded.data.arrayBuffer());
  } catch {
    throw new FinanceArchiveError('STORAGE_UNAVAILABLE');
  }
  if (bytes.byteLength !== ref.byteLength || sha256Hex(bytes) !== ref.sha256 || !inspectSignaturePng(bytes).ok) {
    throw new FinanceArchiveError('INTEGRITY_MISMATCH');
  }
  return bytes;
}

/**
 * Content-addressed insert of an already-inspected PNG. A duplicate or
 * ambiguous upload response is safe to retry: only an existing object with
 * matching metadata and bytes is reused. No attempt removes or replaces an
 * object another attempt may own.
 */
export async function storeSignaturePng(
  input: { organizationId: string; signerUserId: string; bytes: Uint8Array },
  options: Options = {},
): Promise<{ ref: SignatureObjectRef; png: InspectedSignaturePng; reused: boolean }> {
  if (!input || !(input.bytes instanceof Uint8Array)) throw new FinanceArchiveError('INVALID_INPUT');
  if (!SAFE_ID.test(input.organizationId) || !SAFE_ID.test(input.signerUserId)) throw new FinanceArchiveError('INVALID_INPUT');
  // The caller may still own a mutable buffer: freeze the exact upload/hash input first.
  const bytes = Uint8Array.from(input.bytes);
  const inspected = inspectSignaturePng(bytes);
  if (!inspected.ok) throw new FinanceArchiveError('INVALID_INPUT');

  const bucket = configuredBucket(options.env ?? process.env);
  const admin = options.admin ?? getSupabaseAdmin();
  const ref: SignatureObjectRef = Object.freeze({
    organizationId: input.organizationId,
    signerUserId: input.signerUserId,
    bucket,
    key: signatureAssetObjectKey(input.organizationId, input.signerUserId, inspected.png.sha256),
    sha256: inspected.png.sha256,
    byteLength: bytes.byteLength,
  });

  await requirePrivateBucket(admin, bucket);
  let uploadError: unknown = null;
  try {
    const uploaded = await admin.storage.from(bucket).upload(ref.key, bytes, { contentType: SIGNATURE_ASSET_MIME, upsert: false });
    uploadError = uploaded.error;
  } catch (error) {
    uploadError = error;
  }

  try {
    await readSignaturePng(ref, options);
  } catch (error) {
    if (error instanceof FinanceArchiveError && error.code === 'INTEGRITY_MISMATCH') throw error;
    throw new FinanceArchiveError('STORAGE_UNAVAILABLE');
  }
  return { ref, png: inspected.png, reused: Boolean(uploadError) };
}
