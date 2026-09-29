import 'server-only';

/**
 * The finance archive as the M3 routes use it: #2704's
 * `lib/billing/twoStage/storageArchive.ts` (exact-byte, content-addressed,
 * private bucket, no signed or public URL). Routes call it through this port
 * so tests can swap in a fake; production always uses the real module.
 *
 * `storageArchive.ts` supports the five PDF kinds only. M1's
 * `voucher_receipt_signature` kind has no key segment there, so M3 never
 * archives or reads it (fail closed) until Mike adds it.
 */
import type { ArtifactKind } from '../financeStorage';
import {
  archiveFinancePdf,
  FINANCE_ARCHIVE_KEY_SEGMENTS,
  readFinanceArchivePdf,
  type FinanceArchiveErrorCode,
  type FinanceArchiveKind,
  type FinanceArchiveRef,
} from '../storageArchive';
import { readSignaturePng, storeSignaturePng, type SignatureObjectRef } from '../signatureStorage';
import { apiError } from './http';

export type { FinanceArchiveRef };

export type FinanceArchivePort = {
  archiveFinancePdf(input: { caseId: string; kind: FinanceArchiveKind; bytes: Uint8Array }): Promise<{ ref: FinanceArchiveRef; reused: boolean }>;
  readFinanceArchivePdf(ref: FinanceArchiveRef): Promise<Uint8Array>;
};

const realArchive: FinanceArchivePort = {
  archiveFinancePdf: (input) => archiveFinancePdf(input),
  readFinanceArchivePdf: (ref) => readFinanceArchivePdf(ref),
};

let current: FinanceArchivePort = realArchive;

export function financeArchive(): FinanceArchivePort {
  return current;
}

/** Test hook: replace the archive with a fake. Returns a restore function. */
export function setFinanceArchiveForTests(port: FinanceArchivePort): () => void {
  const previous = current;
  current = port;
  return () => {
    current = previous;
  };
}

export function isArchivableKind(kind: string): kind is FinanceArchiveKind {
  return Object.hasOwn(FINANCE_ARCHIVE_KEY_SEGMENTS, kind);
}

export function archiveErrorCode(error: unknown): FinanceArchiveErrorCode | null {
  const e = error as { name?: string; code?: string } | null;
  return e && e.name === 'FinanceArchiveError' && typeof e.code === 'string' ? (e.code as FinanceArchiveErrorCode) : null;
}

/** The ref of an artifact row (bucket/key/hash/size as stored). Fails closed for a kind the archive does not support. */
export function refFor(row: { caseId: string; kind: string; storageBucket: string; storageKey: string; sha256: string; byteLength: number }): FinanceArchiveRef {
  if (!isArchivableKind(row.kind)) throw apiError(503, 'FINANCE_ARCHIVE_UNAVAILABLE', 'The billing finance archive does not hold this kind of file yet.');
  return { caseId: row.caseId, kind: row.kind, bucket: row.storageBucket, key: row.storageKey, sha256: row.sha256, byteLength: row.byteLength, mimeType: 'application/pdf' };
}

/** Read verified bytes, mapping archive failures to the route errors. */
export async function readArchived(row: Parameters<typeof refFor>[0]): Promise<Uint8Array> {
  try {
    return await financeArchive().readFinanceArchivePdf(refFor(row));
  } catch (error) {
    const code = archiveErrorCode(error);
    if (code === 'INTEGRITY_MISMATCH') throw apiError(502, 'ARCHIVE_INTEGRITY_MISMATCH', 'An archived file failed its integrity check. Nothing was sent. Contact an administrator.');
    if (code) throw apiError(503, 'FINANCE_ARCHIVE_UNAVAILABLE', 'The billing finance archive is not available.');
    throw error;
  }
}

// ---------------------------------------------------------------------------
// The designated signer's approved signature image (org-level, signature/… keys).

export type SignatureStorePort = {
  storeSignaturePng(input: { organizationId: string; signerUserId: string; bytes: Uint8Array }): ReturnType<typeof storeSignaturePng>;
  readSignaturePng(ref: SignatureObjectRef): Promise<Uint8Array>;
};

const realSignatureStore: SignatureStorePort = {
  storeSignaturePng: (input) => storeSignaturePng(input),
  readSignaturePng: (ref) => readSignaturePng(ref),
};

let currentSignatureStore: SignatureStorePort = realSignatureStore;

export function signatureStore(): SignatureStorePort {
  return currentSignatureStore;
}

/** Test hook: replace the signature store with a fake. Returns a restore function. */
export function setSignatureStoreForTests(port: SignatureStorePort): () => void {
  const previous = currentSignatureStore;
  currentSignatureStore = port;
  return () => {
    currentSignatureStore = previous;
  };
}

/** The storage reference of a signature asset row. */
export function signatureRefFor(row: { organizationId: string; signerUserId: string; storageBucket: string; storageKey: string; sha256: string; byteLength: number }): SignatureObjectRef {
  return { organizationId: row.organizationId, signerUserId: row.signerUserId, bucket: row.storageBucket, key: row.storageKey, sha256: row.sha256, byteLength: row.byteLength };
}

/** Read verified signature image bytes, mapping archive failures to the route errors. */
export async function readSignatureImage(row: Parameters<typeof signatureRefFor>[0]): Promise<Uint8Array> {
  try {
    return await signatureStore().readSignaturePng(signatureRefFor(row));
  } catch (error) {
    const code = archiveErrorCode(error);
    if (code === 'INTEGRITY_MISMATCH') throw apiError(502, 'ARCHIVE_INTEGRITY_MISMATCH', 'The signature image failed its integrity check. Nothing was signed. Contact an administrator.');
    if (code) throw apiError(503, 'FINANCE_ARCHIVE_UNAVAILABLE', 'The billing finance archive is not available. Nothing was signed.');
    throw error;
  }
}

export type { ArtifactKind };
