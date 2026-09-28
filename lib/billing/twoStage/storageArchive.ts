import 'server-only';

import { createHash } from 'node:crypto';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

/**
 * Server-only, exact-byte I/O for the retained J5/J6 finance archive.
 * Callers own authorization, stage/version attestations, and the database row.
 * This module never signs, sends, overwrites, or deletes an object.
 */
export const FINANCE_ARCHIVE_BUCKET = 'billing-finance';
export const FINANCE_ARCHIVE_MAX_BYTES = 10 * 1024 * 1024;
export const FINANCE_ARCHIVE_MIME = 'application/pdf' as const;

export const FINANCE_ARCHIVE_KEY_SEGMENTS = {
  j5_signed_pdf: 'j5',
  j6_signed_pdf: 'j6',
  board_signed_voucher: 'voucher',
  board_invoice: 'board-invoice',
  external_j5_copy: 'external-j5',
} as const;

export type FinanceArchiveKind = keyof typeof FINANCE_ARCHIVE_KEY_SEGMENTS;
export type FinanceArchiveRef = Readonly<{
  caseId: string;
  kind: FinanceArchiveKind;
  bucket: string;
  key: string;
  sha256: string;
  byteLength: number;
  mimeType: typeof FINANCE_ARCHIVE_MIME;
}>;

export type FinanceArchiveErrorCode =
  | 'INVALID_INPUT'
  | 'INVALID_REFERENCE'
  | 'STORAGE_UNAVAILABLE'
  | 'INTEGRITY_MISMATCH';

export class FinanceArchiveError extends Error {
  constructor(readonly code: FinanceArchiveErrorCode) {
    super({
      INVALID_INPUT: 'The billing PDF is invalid.',
      INVALID_REFERENCE: 'The billing archive reference is invalid.',
      STORAGE_UNAVAILABLE: 'The private billing finance archive is unavailable.',
      INTEGRITY_MISMATCH: 'The billing archive object failed its integrity check.',
    }[code]);
    this.name = 'FinanceArchiveError';
  }
}

type Admin = ReturnType<typeof getSupabaseAdmin>;
type Options = { admin?: Admin; env?: Record<string, string | undefined> };

const SAFE_CASE_ID = /^[A-Za-z0-9-]{1,64}$/;
const SHA256_HEX = /^[0-9a-f]{64}$/;
function configuredBucket(env: Record<string, string | undefined>): string {
  const bucket = env.BILLING_FINANCE_BUCKET?.trim() || FINANCE_ARCHIVE_BUCKET;
  // The dedicated bucket migration proves its private policy boundary. A
  // different private bucket may grant browser access through Storage RLS.
  if (bucket !== FINANCE_ARCHIVE_BUCKET) {
    throw new FinanceArchiveError('STORAGE_UNAVAILABLE');
  }
  return FINANCE_ARCHIVE_BUCKET;
}

function assertCaseId(caseId: string): void {
  if (typeof caseId !== 'string' || !SAFE_CASE_ID.test(caseId)) {
    throw new FinanceArchiveError('INVALID_INPUT');
  }
}

function assertKind(kind: FinanceArchiveKind): void {
  if (!Object.hasOwn(FINANCE_ARCHIVE_KEY_SEGMENTS, kind)) {
    throw new FinanceArchiveError('INVALID_INPUT');
  }
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function isPdf(bytes: Uint8Array): boolean {
  return bytes.byteLength >= 5
    && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44
    && bytes[3] === 0x46 && bytes[4] === 0x2d;
}

function objectKey(caseId: string, kind: FinanceArchiveKind, hash: string): string {
  return `cases/${caseId}/${FINANCE_ARCHIVE_KEY_SEGMENTS[kind]}/${hash}.pdf`;
}

function assertReference(ref: FinanceArchiveRef, bucket: string): void {
  if (!ref || typeof ref !== 'object' || typeof ref.caseId !== 'string' || !SAFE_CASE_ID.test(ref.caseId)
    || !Object.hasOwn(FINANCE_ARCHIVE_KEY_SEGMENTS, ref.kind)
    || ref.bucket !== bucket || typeof ref.sha256 !== 'string' || !SHA256_HEX.test(ref.sha256)
    || ref.key !== objectKey(ref.caseId, ref.kind, ref.sha256)
    || !Number.isInteger(ref.byteLength) || ref.byteLength < 1 || ref.byteLength > FINANCE_ARCHIVE_MAX_BYTES
    || ref.mimeType !== FINANCE_ARCHIVE_MIME) {
    throw new FinanceArchiveError('INVALID_REFERENCE');
  }
}

async function requirePrivateBucket(admin: Admin, bucket: string): Promise<void> {
  let result: Awaited<ReturnType<Admin['storage']['getBucket']>>;
  try {
    result = await admin.storage.getBucket(bucket);
  } catch {
    throw new FinanceArchiveError('STORAGE_UNAVAILABLE');
  }
  if (result.error || result.data?.id !== bucket || result.data.name !== bucket || result.data.public !== false) {
    throw new FinanceArchiveError('STORAGE_UNAVAILABLE');
  }
}

/**
 * Return only verified bytes. Metadata and download bytes must agree with the
 * immutable database reference. No signed URL or public URL is produced.
 */
export async function readFinanceArchivePdf(ref: FinanceArchiveRef, options: Options = {}): Promise<Uint8Array> {
  const bucket = configuredBucket(options.env ?? process.env);
  assertReference(ref, bucket);
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
  if (info.data.bucketId !== bucket || info.data.name !== ref.key
    || info.data.contentType !== FINANCE_ARCHIVE_MIME || info.data.size !== ref.byteLength) {
    throw new FinanceArchiveError('INTEGRITY_MISMATCH');
  }

  let downloaded: Awaited<ReturnType<typeof api.download>>;
  try {
    downloaded = await api.download(ref.key);
  } catch {
    throw new FinanceArchiveError('STORAGE_UNAVAILABLE');
  }
  if (downloaded.error || !downloaded.data) throw new FinanceArchiveError('STORAGE_UNAVAILABLE');
  if (downloaded.data.size !== ref.byteLength
    || (downloaded.data.type && downloaded.data.type !== FINANCE_ARCHIVE_MIME)) {
    throw new FinanceArchiveError('INTEGRITY_MISMATCH');
  }
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await downloaded.data.arrayBuffer());
  } catch {
    throw new FinanceArchiveError('STORAGE_UNAVAILABLE');
  }
  if (!isPdf(bytes) || bytes.byteLength !== ref.byteLength || sha256(bytes) !== ref.sha256) {
    throw new FinanceArchiveError('INTEGRITY_MISMATCH');
  }
  return bytes;
}

/**
 * Content-addressed insert. A duplicate or ambiguous upload response is safe
 * to retry: only an existing object with matching metadata and bytes is reused.
 * No failed attempt removes or replaces an object that another attempt may own.
 */
export async function archiveFinancePdf(
  input: { caseId: string; kind: FinanceArchiveKind; bytes: Uint8Array },
  options: Options = {},
): Promise<{ ref: FinanceArchiveRef; reused: boolean }> {
  if (!input || !(input.bytes instanceof Uint8Array)) throw new FinanceArchiveError('INVALID_INPUT');
  assertCaseId(input.caseId);
  assertKind(input.kind);
  if (input.bytes.byteLength < 1 || input.bytes.byteLength > FINANCE_ARCHIVE_MAX_BYTES || !isPdf(input.bytes)) {
    throw new FinanceArchiveError('INVALID_INPUT');
  }

  // The caller can still own a mutable Buffer. Freeze the exact upload/hash
  // input before the first await, so later caller mutation cannot change it.
  const bytes = Uint8Array.from(input.bytes);
  const bucket = configuredBucket(options.env ?? process.env);
  const admin = options.admin ?? getSupabaseAdmin();
  const contentHash = sha256(bytes);
  const ref: FinanceArchiveRef = Object.freeze({
    caseId: input.caseId,
    kind: input.kind,
    bucket,
    key: objectKey(input.caseId, input.kind, contentHash),
    sha256: contentHash,
    byteLength: bytes.byteLength,
    mimeType: FINANCE_ARCHIVE_MIME,
  });

  await requirePrivateBucket(admin, bucket);
  let uploadError: unknown = null;
  try {
    const uploaded = await admin.storage.from(bucket).upload(ref.key, bytes, {
      contentType: FINANCE_ARCHIVE_MIME,
      upsert: false,
    });
    uploadError = uploaded.error;
  } catch (error) {
    uploadError = error;
  }

  try {
    await readFinanceArchivePdf(ref, options);
  } catch (error) {
    if (error instanceof FinanceArchiveError && error.code === 'INTEGRITY_MISMATCH') throw error;
    throw new FinanceArchiveError('STORAGE_UNAVAILABLE');
  }
  return { ref, reused: Boolean(uploadError) };
}
