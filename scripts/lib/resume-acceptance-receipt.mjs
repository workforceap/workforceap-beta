/**
 * Shared checks for the Resume Build DEMO acceptance lane
 * (docs/RESUME-DEMO-ACCEPTANCE.md): the exact production hostnames the lane
 * must never target, and the receipt verification the workflow runs after the
 * spec. Used by .github/workflows/resume-demo-acceptance.yml and
 * tests/e2e/resume-demo-acceptance.spec.ts so both apply the same rule.
 */
import { existsSync, readFileSync } from 'node:fs';

/** Exact production hostnames. Other *.workforceap.org hosts are not assumed to be production. */
export const PRODUCTION_HOSTS = Object.freeze(['workforceap.org', 'www.workforceap.org']);

export function isProductionHost(hostname) {
  const host = String(hostname ?? '').trim().toLowerCase().replace(/\.$/, '');
  return PRODUCTION_HOSTS.includes(host);
}

/** Hostname of an origin, or null when it is not an http(s) URL. */
export function hostnameOf(origin) {
  try {
    const url = new URL(String(origin ?? ''));
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.hostname.toLowerCase() : null;
  } catch {
    return null;
  }
}

/**
 * The workflow fails unless the acceptance receipt exists, parses, and says
 * `pass: true` with outcome `success`. Returns a reason; never throws.
 */
export function verifyAcceptanceReceipt(path) {
  if (!path || !existsSync(path)) return { ok: false, reason: 'acceptance receipt is missing' };
  let receipt;
  try {
    receipt = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return { ok: false, reason: 'acceptance receipt is not valid JSON' };
  }
  if (receipt?.pass !== true) {
    return { ok: false, reason: `acceptance did not pass (outcome: ${receipt?.outcome ?? 'unknown'})` };
  }
  if (receipt.outcome !== 'success') return { ok: false, reason: `unexpected outcome ${receipt.outcome}` };
  if (receipt.buildRequestsMade !== 1) return { ok: false, reason: 'receipt does not record exactly one Build request' };
  return { ok: true, reason: 'pass' };
}
