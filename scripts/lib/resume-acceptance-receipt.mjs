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

function readReceipt(path, label) {
  if (!path || !existsSync(path)) return { receipt: null, reason: `${label} receipt is missing` };
  try {
    return { receipt: JSON.parse(readFileSync(path, 'utf8')), reason: null };
  } catch {
    return { receipt: null, reason: `${label} receipt is not valid JSON` };
  }
}

function acceptanceReasons(receipt) {
  const reasons = [];
  if (receipt?.pass !== true) {
    const refusal = receipt?.refusal ? `: ${receipt.refusal}` : '';
    reasons.push(`acceptance did not pass (outcome: ${receipt?.outcome ?? 'unknown'}${refusal})`);
  } else if (receipt.outcome !== 'success') {
    reasons.push(`unexpected acceptance outcome ${receipt.outcome}`);
  }
  if (receipt?.buildRequestsMade !== 1) {
    reasons.push(`acceptance receipt records ${receipt?.buildRequestsMade ?? 'no'} Build requests, not exactly one`);
  }
  const member = receipt?.member;
  if (!member || !member.userId || !member.email || !member.runId) {
    reasons.push('acceptance receipt does not record the member it ran as (userId, email, runId)');
  }
  return reasons;
}

function cleanupReasons(receipt) {
  if (receipt?.success !== true) return [`cleanup did not succeed (${receipt?.error ?? 'no error recorded'})`];
  if (receipt.memberCreated === false) {
    return ['cleanup receipt says no member was created (pre-create failure), so no acceptance ran'];
  }
  if (receipt.memberCreated !== true) return ['cleanup receipt does not say a member was created'];
  const reasons = [];
  if (receipt.authAbsenceVerified !== true) reasons.push('Auth absence was not verified');
  if (receipt.prismaUserAbsenceVerified !== true) reasons.push('Prisma user absence was not verified');
  const after = receipt.storage?.after;
  if (!after || typeof after !== 'object' || Object.keys(after).length === 0) {
    reasons.push('cleanup receipt has no member-prefix storage counts');
  } else if (Object.values(after).some((count) => count !== 0)) {
    reasons.push('member-prefix storage objects remain');
  }
  if (!receipt.userId || !receipt.email || !receipt.runId) {
    reasons.push('cleanup receipt does not record the member it removed (userId, email, runId)');
  }
  return reasons;
}

/**
 * The ONE green check of the workflow. It reads both receipts together and
 * passes only when:
 * - the acceptance receipt says pass, outcome success, exactly one Build
 *   request, and records the member it ran as;
 * - the cleanup receipt says success for a CREATED member, with Auth and
 *   Prisma absence verified and every member-prefix storage count at 0;
 * - both receipts name the same runId, member userId and email.
 * A `memberCreated: false` cleanup receipt (pre-create failure) never passes.
 * Every reason is returned so one failure never hides another. Never throws.
 */
export function verifyAcceptanceRun(acceptancePath, cleanupPath) {
  const acceptance = readReceipt(acceptancePath, 'acceptance');
  const cleanup = readReceipt(cleanupPath, 'cleanup');
  const reasons = [];
  if (acceptance.reason) reasons.push(acceptance.reason);
  else reasons.push(...acceptanceReasons(acceptance.receipt));
  if (cleanup.reason) reasons.push(cleanup.reason);
  else reasons.push(...cleanupReasons(cleanup.receipt));
  const member = acceptance.receipt?.member;
  const removed = cleanup.receipt;
  if (member && removed?.memberCreated === true) {
    for (const key of ['runId', 'userId', 'email']) {
      if (member[key] && removed[key] && member[key] !== removed[key]) {
        reasons.push(`receipts name different members (${key} differs)`);
      }
    }
  }
  return reasons.length === 0
    ? { ok: true, reasons: ['acceptance passed as the member that cleanup removed and verified'] }
    : { ok: false, reasons };
}
