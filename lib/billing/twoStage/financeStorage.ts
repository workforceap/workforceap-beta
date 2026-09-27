/**
 * Finance archive storage for two-stage J5/J6 files: a private Supabase
 * Storage bucket separate from every member bucket. The bucket itself (DDL,
 * policies) is provisioned in Mike Brown's separate slice; this module only
 * names it, builds keys, validates uploads and checks the bucket before use.
 *
 *  - Bucket: BILLING_FINANCE_BUCKET (server-side env), default `billing-finance`.
 *    Never `member-resumes`, `member-files` or `employer-logos`, which
 *    lib/gdpr/deleteUserStorage.ts (or the public logo flow) owns.
 *  - Keys are server-generated and content-addressed:
 *    cases/{caseId}/{j5|j6|voucher|board-invoice|external-j5}/{sha256}.pdf
 *  - Uploads are PDFs only, at most 10 MiB, checked by magic bytes, and the
 *    SHA-256 is computed on the server from the exact bytes received. The
 *    bytes are stored unchanged (no stamping, no re-encoding).
 *  - Preflight: before any upload, sign or send the bucket must exist and be
 *    private, or the action fails closed with a fixed message.
 */
import { MAX_UPLOAD_BYTES } from './constants';
import { sha256Hex } from './canonical';

export const DEFAULT_FINANCE_BUCKET = 'billing-finance';
export const FORBIDDEN_FINANCE_BUCKETS: ReadonlySet<string> = new Set(['member-resumes', 'member-files', 'employer-logos']);
export const FINANCE_STORAGE_UNAVAILABLE = 'The billing finance archive is not available. No file was stored, signed or sent.';

const BUCKET_NAME = /^[a-z0-9][a-z0-9-]{1,62}$/;

/** The configured finance bucket, or null when the setting is unsafe (fail closed). */
export function financeBucketName(env: Record<string, string | undefined> = process.env): string | null {
  const raw = env.BILLING_FINANCE_BUCKET?.trim() || DEFAULT_FINANCE_BUCKET;
  return BUCKET_NAME.test(raw) && !FORBIDDEN_FINANCE_BUCKETS.has(raw) ? raw : null;
}

export type ArtifactKind = 'j5_signed_pdf' | 'j6_signed_pdf' | 'board_signed_voucher' | 'board_invoice' | 'external_j5_copy';

export const ARTIFACT_KEY_SEGMENT: Readonly<Record<ArtifactKind, string>> = {
  j5_signed_pdf: 'j5',
  j6_signed_pdf: 'j6',
  board_signed_voucher: 'voucher',
  board_invoice: 'board-invoice',
  external_j5_copy: 'external-j5',
};

const SAFE_ID = /^[A-Za-z0-9-]{1,64}$/;
const HEX64 = /^[0-9a-f]{64}$/;

/** Server-generated object key (matches billing_artifacts_storage_check). */
export function financeObjectKey(caseId: string, kind: ArtifactKind, sha256: string): string {
  if (!SAFE_ID.test(caseId)) throw new Error('Invalid case id for a finance object key');
  if (!HEX64.test(sha256)) throw new Error('Invalid sha256 for a finance object key');
  return `cases/${caseId}/${ARTIFACT_KEY_SEGMENT[kind]}/${sha256}.pdf`;
}

export type ValidatedUpload = { bytes: Uint8Array; sha256: string; byteLength: number; mimeType: 'application/pdf'; fileName: string };

/** Validate an uploaded board voucher / invoice / manual quote. The returned bytes are the input bytes, unchanged. */
export function validateFinanceUpload(input: { bytes: Uint8Array; fileName: string }): { ok: true; upload: ValidatedUpload } | { ok: false; error: string } {
  const { bytes } = input;
  if (bytes.byteLength === 0) return { ok: false, error: 'The file is empty.' };
  if (bytes.byteLength > MAX_UPLOAD_BYTES) return { ok: false, error: 'The file is larger than 10 MB.' };
  const magic = String.fromCharCode(...bytes.subarray(0, 5));
  if (magic !== '%PDF-') return { ok: false, error: 'Upload the voucher as a PDF file.' };
  const baseName = input.fileName.split(/[\\/]/).pop()?.trim() ?? '';
  const fileName = (baseName || 'upload.pdf').replace(/[^\w.\- ]+/g, '_').slice(0, 120);
  return { ok: true, upload: { bytes, sha256: sha256Hex(bytes), byteLength: bytes.byteLength, mimeType: 'application/pdf', fileName } };
}

/** Bytes read back from the archive must hash to the recorded sha256 before they are attached or served. */
export function verifyArchivedBytes(bytes: Uint8Array, expected: { sha256: string; byteLength: number }): boolean {
  return bytes.byteLength === expected.byteLength && sha256Hex(bytes) === expected.sha256;
}

type BucketInfo = { id?: string; name?: string; public?: boolean } | null;
export type FinanceStorageClient = {
  storage: { getBucket: (id: string) => Promise<{ data: BucketInfo; error: { message?: string } | null }> };
};

export type FinancePreflight = { ok: true; bucket: string } | { ok: false; code: 'misconfigured' | 'missing' | 'public' | 'unreachable'; message: string };

/** Fail closed unless the finance bucket exists and is private. Messages are fixed labels (no provider detail). */
export async function preflightFinanceStorage(client: FinanceStorageClient, env: Record<string, string | undefined> = process.env): Promise<FinancePreflight> {
  const bucket = financeBucketName(env);
  if (!bucket) return { ok: false, code: 'misconfigured', message: FINANCE_STORAGE_UNAVAILABLE };
  let result: Awaited<ReturnType<FinanceStorageClient['storage']['getBucket']>>;
  try {
    result = await client.storage.getBucket(bucket);
  } catch {
    return { ok: false, code: 'unreachable', message: FINANCE_STORAGE_UNAVAILABLE };
  }
  if (result.error || !result.data) return { ok: false, code: 'missing', message: FINANCE_STORAGE_UNAVAILABLE };
  if (result.data.public !== false) return { ok: false, code: 'public', message: FINANCE_STORAGE_UNAVAILABLE };
  return { ok: true, bucket };
}
