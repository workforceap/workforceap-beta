/**
 * The designated signer's approved handwritten-signature image (pure rules;
 * the database enforces the same in billing_signer_signature_assets and the
 * billing_stage_record_rules sign trigger).
 *
 *  - One PNG per organization is active at a time. Only the designated signer
 *    (billing_designated_signers), logged in as himself, uploads it; that
 *    upload is his approval. It is append-only apart from one revoke.
 *  - It is not a billing_artifacts row: artifacts stay PDF-only case
 *    documents. The bytes live in the private billing-finance bucket under
 *    signature/{organizationId}/{signerUserId}/{sha256}.png, checked here by
 *    magic bytes and structure, hashed on the server, stored unchanged.
 *  - Every J5/J6 sign freezes the active asset (id + sha256) in
 *    content.signature, and the database refuses a sign without an active
 *    asset (SIGNATURE_ASSET_MISSING) or with another one
 *    (SIGNATURE_ASSET_MISMATCH). Revoking or replacing the asset never alters
 *    an already-signed record: it keeps its frozen hash.
 *  - The image never authorizes anything by itself: signing is still only the
 *    designated signer's own authenticated action (signing.ts authorizeSigner).
 */
import { sha256Hex } from './canonical';

export const SIGNATURE_ASSET_MIME = 'image/png' as const;
export const SIGNATURE_ASSET_MAX_BYTES = 5 * 1024 * 1024;
export const SIGNATURE_ASSET_MAX_DIMENSION_PX = 6000;
/** The PNG signature (8 bytes) plus the IHDR chunk (4 + 4 + 13 + 4): what the database checks. */
export const SIGNATURE_ASSET_HEADER_BYTES = 33;

export const SIGNATURE_ASSET_MISSING = 'SIGNATURE_ASSET_MISSING';
export const SIGNATURE_ASSET_MISMATCH = 'SIGNATURE_ASSET_MISMATCH';
export const SIGNATURE_ASSET_WRONG_PRINCIPAL = 'SIGNATURE_ASSET_WRONG_PRINCIPAL';

/** What a signed content freezes: the exact active asset. */
export type SignatureAssetRef = { assetId: string; assetSha256: string };

/** One billing_signer_signature_assets row as the app reads it. */
export type SignerSignatureAsset = {
  id: string;
  organizationId: string;
  signerUserId: string;
  sha256: string;
  revokedAt: Date | string | null;
};

export type InspectedSignaturePng = {
  mimeType: typeof SIGNATURE_ASSET_MIME;
  sha256: string;
  byteLength: number;
  widthPx: number;
  heightPx: number;
  /** The first 33 bytes, stored in png_header for the database check. */
  pngHeader: Uint8Array;
};

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const HEX64 = /^[0-9a-f]{64}$/;
const SAFE_ID = /^[A-Za-z0-9-]{1,64}$/;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function u32(bytes: Uint8Array, at: number): number {
  return ((bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0;
}

/**
 * Validate an uploaded signature image: a well-formed, non-animated PNG
 * (magic bytes, IHDR first with a valid CRC, every chunk in bounds, ending
 * exactly at IEND), within the size and pixel bounds. Returns the server-side
 * hash and the header the database re-checks. The bytes are never altered.
 */
export function inspectSignaturePng(bytes: Uint8Array): { ok: true; png: InspectedSignaturePng } | { ok: false; error: string } {
  const notPng = { ok: false as const, error: 'Upload the signature as a PNG image.' };
  if (bytes.byteLength <= SIGNATURE_ASSET_HEADER_BYTES) return notPng;
  if (bytes.byteLength > SIGNATURE_ASSET_MAX_BYTES) return { ok: false, error: 'The signature image is larger than 5 MB.' };
  if (!PNG_SIGNATURE.every((b, i) => bytes[i] === b)) return notPng;
  // IHDR: length 13, type "IHDR", valid fields and CRC.
  if (u32(bytes, 8) !== 13 || String.fromCharCode(...bytes.subarray(12, 16)) !== 'IHDR') return notPng;
  if (crc32(bytes.subarray(12, 29)) !== u32(bytes, 29)) return notPng;
  const widthPx = u32(bytes, 16);
  const heightPx = u32(bytes, 20);
  const [bitDepth, colorType, compression, filter, interlace] = bytes.subarray(24, 29);
  if (![1, 2, 4, 8, 16].includes(bitDepth) || ![0, 2, 3, 4, 6].includes(colorType) || compression !== 0 || filter !== 0 || interlace > 1) return notPng;
  if (widthPx < 1 || heightPx < 1 || widthPx > SIGNATURE_ASSET_MAX_DIMENSION_PX || heightPx > SIGNATURE_ASSET_MAX_DIMENSION_PX) {
    return { ok: false, error: `The signature image must be at most ${SIGNATURE_ASSET_MAX_DIMENSION_PX} x ${SIGNATURE_ASSET_MAX_DIMENSION_PX} pixels.` };
  }
  // Walk the chunks: each in bounds, no animation, image data present, IEND last.
  let at = 8;
  let sawIdat = false;
  for (;;) {
    if (at + 12 > bytes.byteLength) return notPng;
    const length = u32(bytes, at);
    const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
    const end = at + 12 + length;
    if (!/^[A-Za-z]{4}$/.test(type) || end > bytes.byteLength) return notPng;
    if (type === 'acTL') return { ok: false, error: 'The signature image must not be animated.' };
    if (type === 'IDAT') sawIdat = true;
    if (type === 'IEND') {
      if (length !== 0 || end !== bytes.byteLength || !sawIdat) return notPng;
      break;
    }
    at = end;
  }
  return {
    ok: true,
    png: {
      mimeType: SIGNATURE_ASSET_MIME,
      sha256: sha256Hex(bytes),
      byteLength: bytes.byteLength,
      widthPx,
      heightPx,
      pngHeader: bytes.slice(0, SIGNATURE_ASSET_HEADER_BYTES),
    },
  };
}

/** Server-generated object key (matches billing_signer_signature_assets_storage_check). */
export function signatureAssetObjectKey(organizationId: string, signerUserId: string, sha256: string): string {
  if (!SAFE_ID.test(organizationId) || !SAFE_ID.test(signerUserId)) throw new Error('Invalid id for a signature object key');
  if (!HEX64.test(sha256)) throw new Error('Invalid sha256 for a signature object key');
  return `signature/${organizationId}/${signerUserId}/${sha256}.png`;
}

export type SignatureAssetRefusal = {
  ok: false;
  code: 'SIGNER_PRINCIPAL_UNSET' | typeof SIGNATURE_ASSET_MISSING | typeof SIGNATURE_ASSET_MISMATCH | typeof SIGNATURE_ASSET_WRONG_PRINCIPAL;
  error: string;
};
export type SignatureAssetGate = { ok: true; asset: SignatureAssetRef } | SignatureAssetRefusal;

const norm = (v: string | null | undefined) => v?.trim().toLowerCase() || null;

/** Only the designated signer, as himself, may upload (and so approve) his signature image. */
export function canUploadSignatureAsset(input: { actorUserId: string | null | undefined; designatedSignerUserId: string | null | undefined }): { ok: true } | SignatureAssetRefusal {
  const designated = norm(input.designatedSignerUserId);
  if (!designated) return { ok: false, code: 'SIGNER_PRINCIPAL_UNSET', error: 'No signer principal is designated yet.' };
  if (norm(input.actorUserId) !== designated) {
    return { ok: false, code: SIGNATURE_ASSET_WRONG_PRINCIPAL, error: 'Only the designated signer can upload and approve his signature.' };
  }
  return { ok: true };
}

/** The designated signer's one active asset, or null. */
export function activeSignatureAsset(assets: readonly SignerSignatureAsset[], designatedSignerUserId: string | null | undefined): SignerSignatureAsset | null {
  const designated = norm(designatedSignerUserId);
  if (!designated) return null;
  const active = assets.filter((a) => !a.revokedAt && norm(a.signerUserId) === designated && HEX64.test(a.sha256));
  return active.length === 1 ? active[0] : null;
}

/** The content.signature a new draft freezes (null when no active asset: that draft cannot be signed). */
export function signatureRefForContent(asset: SignerSignatureAsset | null): SignatureAssetRef | null {
  return asset ? { assetId: asset.id, assetSha256: asset.sha256 } : null;
}

/**
 * Sign-time gate (same rule as the database): the designated signer has one
 * active asset and the content freezes exactly it.
 */
export function signatureAssetStatus(input: {
  designatedSignerUserId: string | null | undefined;
  assets: readonly SignerSignatureAsset[];
  frozen: SignatureAssetRef | null | undefined;
}): SignatureAssetGate {
  if (!norm(input.designatedSignerUserId)) return { ok: false, code: 'SIGNER_PRINCIPAL_UNSET', error: 'No signer principal is designated yet; signing stays closed.' };
  const active = activeSignatureAsset(input.assets, input.designatedSignerUserId);
  if (!active) return { ok: false, code: SIGNATURE_ASSET_MISSING, error: 'The signer has no active approved signature image; signing stays closed.' };
  if (!input.frozen || input.frozen.assetId !== active.id || input.frozen.assetSha256 !== active.sha256) {
    return { ok: false, code: SIGNATURE_ASSET_MISMATCH, error: 'This draft was prepared with another signature image. Rebuild the draft and review it again.' };
  }
  return { ok: true, asset: { assetId: active.id, assetSha256: active.sha256 } };
}
