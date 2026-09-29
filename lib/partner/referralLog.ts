import { createHash } from 'node:crypto';

/**
 * A referralRef in a signup body is caller-controlled and may contain personal
 * information. Log a stable fingerprint for matching a reported broken link
 * without copying the submitted value into application logs.
 */
export function droppedPartnerRefLogContext(ref: string, organizationId: string) {
  return {
    organizationId,
    refFingerprint: createHash('sha256')
      .update(ref.trim().toLowerCase(), 'utf8')
      .digest('hex')
      .slice(0, 16),
  };
}
