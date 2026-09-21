/**
 * Key-based redaction for free-form JSON metadata (audit rows, member events,
 * workflow diagnostics). One implementation: the Activity tab and the
 * diagnostics store pass the key pattern that fits their surface.
 */

/** Replacement written in place of a redacted value. */
const REDACTED_VALUE = '[redacted]';

/** Contact details and secrets — what the admin Activity tab hides. */
export const CONTACT_AND_SECRET_KEY = /email|phone|token|password/i;

/**
 * Personal data that must not sit in a diagnostics store: contact details,
 * names, postal addresses, recipients and secrets.
 */
export const PERSONAL_DATA_KEY = /email|phone|name|address|token|password|^to$|^cc$|^bcc$/i;

/**
 * Deep copy of `value` with every object key matching `keyPattern` replaced by
 * {@link REDACTED_VALUE}. Arrays and nested objects are walked; scalars pass
 * through unchanged.
 */
export function redactMetadataKeys(value: unknown, keyPattern: RegExp): unknown {
  if (Array.isArray(value)) return value.map((entry) => redactMetadataKeys(entry, keyPattern));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      out[key] = keyPattern.test(key) ? REDACTED_VALUE : redactMetadataKeys(inner, keyPattern);
    }
    return out;
  }
  return value;
}

/** True when any value inside `value` (at any depth) is the redaction marker. */
export function containsRedactedValue(value: unknown): boolean {
  if (value === REDACTED_VALUE) return true;
  if (Array.isArray(value)) return value.some(containsRedactedValue);
  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).some(containsRedactedValue);
  }
  return false;
}
