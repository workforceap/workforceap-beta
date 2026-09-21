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
 * Contact details, postal addresses and secrets — what the generic
 * `workflow_diagnostics` writer strips from a template payload.
 */
export const PERSONAL_DATA_KEY = /email|phone|address|token|password/i;

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
