/**
 * Identify an image by its leading bytes ("magic numbers"), not its name.
 *
 * Only the three formats member uploads accept are recognised. Pass at least
 * the first 12 bytes of the file; a shorter or unrecognised header is `null`.
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
