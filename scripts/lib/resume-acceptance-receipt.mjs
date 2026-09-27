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

/**
 * The workflow also fails unless the cleanup receipt exists and proves the
 * disposable member is gone: success, Auth absence verified, Prisma user
 * absence verified, and every member-prefix storage count after cleanup is 0.
 * The only other accepted receipt is `memberCreated: false` (no creation
 * marker existed), which cannot coexist with a passing acceptance run.
 */
export function verifyCleanupReceipt(path) {
  if (!path || !existsSync(path)) return { ok: false, reason: 'cleanup receipt is missing' };
  let receipt;
  try {
    receipt = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return { ok: false, reason: 'cleanup receipt is not valid JSON' };
  }
  if (receipt?.success !== true) return { ok: false, reason: `cleanup did not succeed (${receipt?.error ?? 'no error recorded'})` };
  if (receipt.memberCreated === false) return { ok: true, reason: 'no member was created' };
  if (receipt.memberCreated !== true) return { ok: false, reason: 'cleanup receipt does not say whether a member was created' };
  if (receipt.authAbsenceVerified !== true) return { ok: false, reason: 'Auth absence was not verified' };
  if (receipt.prismaUserAbsenceVerified !== true) return { ok: false, reason: 'Prisma user absence was not verified' };
  const after = receipt.storage?.after;
  if (!after || typeof after !== 'object' || Object.keys(after).length === 0) {
    return { ok: false, reason: 'cleanup receipt has no member-prefix storage counts' };
  }
  if (Object.values(after).some((count) => count !== 0)) return { ok: false, reason: 'member-prefix storage objects remain' };
  return { ok: true, reason: 'member removed and verified' };
}
