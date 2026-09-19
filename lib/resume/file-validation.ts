import { Buffer } from 'node:buffer';

export const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
]);

export const ALLOWED_EXTENSIONS = new Set(['pdf', 'doc', 'docx', 'txt']);

const MAX_DOCX_ENTRIES = 8192;
const MAX_DOCX_UNCOMPRESSED_BYTES = 25 * 1024 * 1024;
const MAX_DOCX_COMPRESSION_RATIO = 100;

// Magic bytes for allowed file types
export const MAGIC_BYTES: Array<{ ext: string; bytes: number[] }> = [
  { ext: 'pdf', bytes: [0x25, 0x50, 0x44, 0x46] }, // %PDF
  { ext: 'doc', bytes: [0xD0, 0xCF, 0x11, 0xE0] }, // OLE2 (DOC)
  { ext: 'docx', bytes: [0x50, 0x4B, 0x03, 0x04] }, // PK (ZIP/DOCX)
];

export function validateFileType(
  buffer: Buffer | Uint8Array,
  mimeType: string,
  fileName: string,
  options?: { allowTxt?: boolean }
): boolean {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);

  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  if (!ALLOWED_EXTENSIONS.has(ext)) return false;

  if (ext === 'txt') {
    return options?.allowTxt === true;
  }

  if (buf.length < 4) return false;

  // Some files might contain a UTF-8 BOM or some padding before the actual magic bytes.
  // We search for the magic bytes within the first 1024 bytes of the file.
  const searchLimit = Math.min(buf.length, 1024);
  const searchArea = buf.subarray(0, searchLimit);

  const magicMatches = MAGIC_BYTES.some((m) => {
    if (m.ext !== ext) return false;

    const seq = m.bytes;
    const seqLen = seq.length;

    // Safely search for byte sequences by implementing a custom manual loop (byte-by-byte comparison)
    // to avoid edge polyfill indexOf issues with arrays
    for (let i = 0; i <= searchArea.length - seqLen; i++) {
      let match = true;
      for (let j = 0; j < seqLen; j++) {
        if (searchArea[i + j] !== seq[j]) {
          match = false;
          break;
        }
      }
      if (match) return true;
    }

    return false;
  });

  if (!magicMatches) return false;

  // H-S17: DOCX files share the ZIP magic bytes (PK\x03\x04) with any ZIP archive.
  // A malicious ZIP renamed to .docx would otherwise pass validation and be fed
  // to the bounded DOCX reader downstream. Confirm the archive is actually a DOCX by checking
  // for the canonical DOCX entries in the ZIP central directory.
  if (ext === 'docx') {
    return isDocxArchive(buf);
  }

  return true;
}

/**
 * Lightweight DOCX structure check. Parses the ZIP central directory and
 * verifies that BOTH `[Content_Types].xml` AND `word/document.xml` are
 * present as entries. This is sufficient to distinguish a real DOCX from
 * an arbitrary ZIP archive without pulling in a full unzip dependency.
 *
 * ZIP central directory record layout (little-endian):
 *   0  uint32  signature           0x02014b50
 *   28 uint16  file name length
 *   30 uint16  extra field length
 *   32 uint16  file comment length
 *   46 ...     file name (N bytes)
 *
 * End-of-central-directory record (EOCD), searched from end of file:
 *   0  uint32  signature           0x06054b50
 *   16 uint32  offset of central directory
 */
function isDocxArchive(buffer: Buffer | Uint8Array): boolean {
  const REQUIRED_ENTRIES = ['[Content_Types].xml', 'word/document.xml'];

  try {
    const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
    const isArrayBuffer = buf.buffer instanceof ArrayBuffer || (typeof SharedArrayBuffer !== 'undefined' && buf.buffer instanceof SharedArrayBuffer);
    const arr = isArrayBuffer ? buf : new Uint8Array(buf);

    const view = new DataView(arr.buffer, arr.byteOffset, arr.byteLength);
    const eocdOffset = findEocd(arr, view);
    if (eocdOffset < 0) return false;

    // EOCD must have at least 22 bytes available
    if (eocdOffset + 22 > arr.length) return false;

    const cdOffset = view.getUint32(eocdOffset + 16, true);
    const cdSize = view.getUint32(eocdOffset + 12, true);
    const totalEntries = view.getUint16(eocdOffset + 10, true);

    if (cdOffset >= arr.length || cdOffset + cdSize > arr.length) {
      return false;
    }

    const found = new Set<string>();
    let cursor = cdOffset;
    const cdEnd = cdOffset + cdSize;
    const CENTRAL_DIR_SIGNATURE = 0x02014b50;
    const HEADER_FIXED_LEN = 46;
    if (totalEntries === 0 || totalEntries > MAX_DOCX_ENTRIES) return false;

    let totalCompressedBytes = 0;
    let totalUncompressedBytes = 0;

    for (let i = 0; i < totalEntries; i++) {
      if (cursor + HEADER_FIXED_LEN > cdEnd) return false;
      const sig = view.getUint32(cursor, true);
      if (sig !== CENTRAL_DIR_SIGNATURE) return false;

      const nameLen = view.getUint16(cursor + 28, true);
      const extraLen = view.getUint16(cursor + 30, true);
      const commentLen = view.getUint16(cursor + 32, true);
      const compressedSize = view.getUint32(cursor + 20, true);
      const uncompressedSize = view.getUint32(cursor + 24, true);
      totalCompressedBytes += compressedSize;
      totalUncompressedBytes += uncompressedSize;
      if (totalUncompressedBytes > MAX_DOCX_UNCOMPRESSED_BYTES) return false;
      if (uncompressedSize > 0 && compressedSize === 0) return false;
      if (totalUncompressedBytes / Math.max(totalCompressedBytes, 1) > MAX_DOCX_COMPRESSION_RATIO) {
        return false;
      }
      const nameStart = cursor + HEADER_FIXED_LEN;
      const nameEnd = nameStart + nameLen;
      if (nameEnd > cdEnd) return false;

      const nameBytes = new Uint8Array(arr.buffer, arr.byteOffset + nameStart, nameLen);
      let name = '';
      if (typeof TextDecoder !== 'undefined') {
        name = new TextDecoder('utf-8').decode(nameBytes);
      } else {
        for (let k = 0; k < nameLen; k++) name += String.fromCharCode(nameBytes[k]);
      }

      if (REQUIRED_ENTRIES.includes(name)) {
        found.add(name);
      }

      cursor = nameEnd + extraLen + commentLen;
      if (cursor > cdEnd) return false;
    }

    return REQUIRED_ENTRIES.every((e) => found.has(e));
  } catch {
    return false;
  }
}

/**
 * Locate the End-of-Central-Directory record signature (0x06054b50)
 * by scanning backwards from the end of the buffer. The EOCD lives in
 * the last 22 + up-to-65535 bytes (its trailing comment is variable).
 */
function findEocd(buffer: Buffer | Uint8Array, view: DataView): number {
  const EOCD_SIGNATURE = 0x06054b50;
  const minOffset = Math.max(0, buffer.length - (22 + 0xffff));
  for (let i = buffer.length - 22; i >= minOffset; i--) {
    if (view.getUint32(i, true) === EOCD_SIGNATURE) {
      return i;
    }
  }
  return -1;
}
