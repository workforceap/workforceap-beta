/**
 * Identify an image by its leading bytes ("magic numbers"), not its name.
 *
 * `detectImageSignature` recognises only the three formats profile photos
 * accept; `detectUploadSignature` below adds PDF and GIF for certificate
 * proofs and logos. Pass at least the first 12 bytes of the file; a shorter or
 * unrecognised header is `null`.
 */
type SniffedImageType = 'image/jpeg' | 'image/png' | 'image/webp';

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function asciiAt(bytes: Uint8Array, offset: number, text: string): boolean {
  if (bytes.length < offset + text.length) return false;
  for (let i = 0; i < text.length; i += 1) {
    if (bytes[offset + i] !== text.charCodeAt(i)) return false;
  }
  return true;
}

export function detectImageSignature(bytes: Uint8Array): SniffedImageType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (bytes.length >= PNG.length && PNG.every((b, i) => bytes[i] === b)) {
    return 'image/png';
  }
  if (asciiAt(bytes, 0, 'RIFF') && asciiAt(bytes, 8, 'WEBP')) {
    return 'image/webp';
  }
  return null;
}

/** Every type an upload route can sniff: the three images above, plus PDF and GIF. */
export type SniffedUploadType = SniffedImageType | 'application/pdf' | 'image/gif';

/**
 * Identify a certificate proof or a logo by its leading bytes. Pass at least
 * the first 12 bytes; a shorter or unrecognised header is `null`.
 *
 * PDF must start with `%PDF-` at offset 0 (a file with junk before the header
 * is refused, not searched), GIF with `GIF87a` or `GIF89a`.
 */
export function detectUploadSignature(bytes: Uint8Array): SniffedUploadType | null {
  if (asciiAt(bytes, 0, '%PDF-')) return 'application/pdf';
  if (asciiAt(bytes, 0, 'GIF87a') || asciiAt(bytes, 0, 'GIF89a')) return 'image/gif';
  return detectImageSignature(bytes);
}

/**
 * True when the file's first bytes are the type its extension claims (so a
 * `.png` holding JPEG bytes, or a `.pdf` holding HTML, is false). Reads only
 * the header, never the whole file.
 */
export async function fileMatchesContentType(file: Blob, contentType: string): Promise<boolean> {
  const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  return detectUploadSignature(header) === contentType;
}
