import { createHash } from 'node:crypto';

/** SHA-256 of bytes, lowercase hex (matches Postgres `encode(sha256(x), 'hex')`). */
export function sha256Hex(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * JSON with object keys sorted at every level, so the same content always
 * hashes the same regardless of property order. Rejects values JSON cannot
 * round-trip (undefined, functions, non-finite numbers).
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('canonicalJson: non-finite number');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object') {
    const entries = Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => {
        const v = (value as Record<string, unknown>)[key];
        if (v === undefined) throw new TypeError(`canonicalJson: undefined at "${key}"`);
        return `${JSON.stringify(key)}:${canonicalJson(v)}`;
      });
    return `{${entries.join(',')}}`;
  }
  throw new TypeError(`canonicalJson: unsupported ${typeof value}`);
}

export function contentSha256(content: unknown): string {
  return sha256Hex(canonicalJson(content));
}
