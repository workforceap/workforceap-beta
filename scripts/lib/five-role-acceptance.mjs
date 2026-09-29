/**
 * Shared rules for the WAP-6 five-role DEMO action and persistence acceptance
 * lane (docs/FIVE-ROLE-DEMO-ACCEPTANCE.md,
 * .github/workflows/five-role-demo-acceptance.yml). Used by the fixture CLI
 * (scripts/five-role-demo-fixture.ts), the Playwright spec
 * (tests/e2e/five-role-demo-acceptance.spec.ts) and the final verifier
 * (scripts/verify-five-role-acceptance.mjs), so all three apply one rule.
 *
 * A run passes only when THREE receipts agree:
 *   acceptance  every role signed in as its own synthetic user, made its one
 *               write through the Preview app and read it back through the app;
 *   readback    the fixture CLI found each written row in the DEMO database by
 *               its recorded ID, owned by that user, with the written value;
 *   cleanup     every user, the partner row, the notes and each written record
 *               are gone, each absence checked by a lookup after the delete.
 */
import { existsSync, readFileSync } from 'node:fs';
import { hostnameOf, isProductionHost } from './resume-acceptance-receipt.mjs';

/** The five portal roles, in the order the spec acts. Matches QA_ROLES in portal-qa-guard.cjs. */
export const FIVE_ROLES = Object.freeze(['member', 'counselor', 'admin', 'employer', 'partner']);

export const RUN_ID = /^\d{1,20}-1$/;
export const FIVE_ROLE_QA_EMAIL = /^wap6-qa-\d{1,20}-1-(member|counselor|admin|employer|partner)@example\.com$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const ACCEPTANCE_KIND = 'wap6-five-role-acceptance';
export const READBACK_KIND = 'wap6-five-role-readback';
export const CLEANUP_KIND = 'wap6-five-role-cleanup';

/**
 * `<GITHUB_RUN_ID>-<GITHUB_RUN_ATTEMPT>`. Only attempt 1 is accepted: one
 * dispatch is one attempt, and a re-run never creates a second set of users.
 */
export function runIdFor(githubRunId, githubRunAttempt) {
  if (!/^\d{1,20}$/.test(String(githubRunId ?? ''))) throw new Error('GITHUB_RUN_ID must be numeric.');
  if (String(githubRunAttempt ?? '') !== '1') {
    throw new Error('One dispatch is one attempt: re-runs are refused. Dispatch the workflow again instead.');
  }
  return `${githubRunId}-1`;
}

export function emailFor(runId, role) {
  if (!RUN_ID.test(runId) || !FIVE_ROLES.includes(role)) throw new Error('Refusing a non-synthetic identity.');
  return `wap6-qa-${runId}-${role}@example.com`;
}

/** Slug of the per-run synthetic partner organization. */
export function partnerSlugFor(runId) {
  if (!RUN_ID.test(runId)) throw new Error('Refusing a non-synthetic partner.');
  return `portal-qa-wap6-${runId}`;
}

/**
 * The value each role writes. The fixture seeds employer and partner with
 * the "(before)" form, so an update is distinguishable from the seed.
 */
export function writtenValueFor(runId, role) {
  if (!RUN_ID.test(runId)) throw new Error('Refusing a non-synthetic run.');
  switch (role) {
    case 'member': return `WAP-6 QA goal ${runId}`;
    case 'counselor': return `WAP-6 QA counselor note ${runId}`;
    case 'admin': return `WAP-6 QA admin note ${runId}`;
    case 'employer': return `WAP-6 QA Employer ${runId}`;
    case 'partner': return `WAP-6 QA Partner ${runId}`;
    default: throw new Error(`Unknown role ${role}`);
  }
}

export function seededValueFor(runId, role) {
  return `${writtenValueFor(runId, role)} (before)`;
}

/**
 * One action and one app readback per role (file:line references are in the
 * runbook). `recordFrom` names where the spec takes the written row's ID.
 */
export const ROLE_ACTIONS = Object.freeze({
  member: { method: 'POST', path: '/api/member/goals', readback: 'GET /api/member/goals' },
  counselor: { method: 'POST', path: '/api/counselor/members/:memberId/notes', readback: 'GET /api/counselor/members/:memberId/notes' },
  admin: { method: 'POST', path: '/api/admin/members/:memberId/notes', readback: 'GET /api/admin/members/:memberId/notes' },
  employer: { method: 'PATCH', path: '/api/employer/onboarding-profile', readback: 'GET /employer/jobs/new (#company-name)' },
  partner: { method: 'PATCH', path: '/api/partner/onboarding-profile', readback: 'GET /api/partner/dashboard (partnerName)' },
});

/**
 * Why the spec must not act, or null. Every input must be present and each
 * account must be this run's synthetic user; the target must not be a
 * production hostname.
 */
export function acceptanceRefusal(env) {
  const baseURL = String(env.PLAYWRIGHT_BASE_URL ?? '').trim();
  const runId = String(env.FIVE_ROLE_QA_RUN_ID ?? '').trim();
  if (env.FIVE_ROLE_ACCEPTANCE_CONFIRMED !== '1') return 'FIVE_ROLE_ACCEPTANCE_CONFIRMED is not set';
  if (!baseURL) return 'PLAYWRIGHT_BASE_URL is not set';
  const host = hostnameOf(baseURL);
  if (!host) return 'PLAYWRIGHT_BASE_URL is not an http(s) URL';
  if (isProductionHost(host)) return 'refusing a production host';
  if (!RUN_ID.test(runId)) return 'FIVE_ROLE_QA_RUN_ID is not a first-attempt run ID';
  for (const role of FIVE_ROLES) {
    const upper = role.toUpperCase();
    const email = String(env[`FIVE_ROLE_QA_${upper}_EMAIL`] ?? '').trim().toLowerCase();
    const id = String(env[`FIVE_ROLE_QA_${upper}_ID`] ?? '').trim();
    const password = String(env[`FIVE_ROLE_QA_${upper}_PASSWORD`] ?? '');
    if (!email || !id || !password) return `the ${role} account inputs are not set`;
    if (email !== emailFor(runId, role)) return `the ${role} account is not this run's synthetic user`;
    if (!UUID.test(id)) return `the ${role} ID is not a UUID`;
  }
  if (!UUID.test(String(env.FIVE_ROLE_QA_EMPLOYER_RECORD_ID ?? '').trim())) return 'FIVE_ROLE_QA_EMPLOYER_RECORD_ID is not a UUID';
  if (!UUID.test(String(env.FIVE_ROLE_QA_PARTNER_RECORD_ID ?? '').trim())) return 'FIVE_ROLE_QA_PARTNER_RECORD_ID is not a UUID';
  return null;
}

function readReceipt(path, label) {
  if (!path || !existsSync(path)) return { receipt: null, reason: `${label} receipt is missing` };
  try {
    const receipt = JSON.parse(readFileSync(path, 'utf8'));
    if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) {
      return { receipt: null, reason: `${label} receipt is not a JSON object` };
    }
    return { receipt, reason: null };
  } catch {
    return { receipt: null, reason: `${label} receipt is not valid JSON` };
  }
}

function exactRoles(map, label) {
  const keys = map && typeof map === 'object' ? Object.keys(map).sort() : [];
  const expected = [...FIVE_ROLES].sort();
  return keys.length === expected.length && keys.every((key, i) => key === expected[i])
    ? []
    : [`${label} receipt does not cover exactly the five roles`];
}

export function acceptanceReasons(receipt) {
  const reasons = [];
  if (receipt.kind !== ACCEPTANCE_KIND) reasons.push('acceptance receipt has the wrong kind');
  if (receipt.pass !== true || receipt.outcome !== 'success') {
    reasons.push(`acceptance did not pass (outcome: ${receipt.outcome ?? 'unknown'}${receipt.refusal ? `: ${receipt.refusal}` : ''})`);
  }
  if (receipt.attempts !== 1) reasons.push('acceptance receipt does not record exactly one attempt');
  reasons.push(...exactRoles(receipt.roles, 'acceptance'));
  for (const role of FIVE_ROLES) {
    const entry = receipt.roles?.[role];
    if (!entry) continue;
    if (!UUID.test(String(entry.userId ?? ''))) reasons.push(`${role}: acceptance does not record the user ID`);
    if (typeof receipt.runId === 'string' && RUN_ID.test(receipt.runId) && entry.email !== emailFor(receipt.runId, role)) {
      reasons.push(`${role}: acceptance ran as a user that is not this run's synthetic ${role}`);
    }
    if (entry.identityVerified !== true) reasons.push(`${role}: session identity was not verified`);
    const status = entry.action?.status;
    if (entry.action?.ok !== true || !Number.isInteger(status) || status < 200 || status > 299) {
      reasons.push(`${role}: the write did not succeed (status ${status ?? 'none'})`);
    }
    if (!UUID.test(String(entry.recordId ?? ''))) reasons.push(`${role}: no written record ID`);
    if (entry.appReadback?.matched !== true) reasons.push(`${role}: the app readback did not show the written value`);
  }
  // Five distinct users and five distinct records: one row can never stand in for two roles.
  const entries = FIVE_ROLES.map((role) => receipt.roles?.[role]).filter(Boolean);
  const userIds = entries.map((entry) => entry.userId).filter(Boolean);
  const recordIds = entries.map((entry) => entry.recordId).filter(Boolean);
  if (new Set(userIds).size !== userIds.length) reasons.push('acceptance receipt reuses a user ID across roles');
  if (new Set(recordIds).size !== recordIds.length) reasons.push('acceptance receipt reuses a record ID across roles');
  return reasons;
}

export function readbackReasons(receipt, acceptance) {
  const reasons = [];
  if (receipt.kind !== READBACK_KIND) reasons.push('readback receipt has the wrong kind');
  if (receipt.success !== true) reasons.push(`database readback did not succeed (${receipt.error ?? 'no error recorded'})`);
  reasons.push(...exactRoles(receipt.roles, 'readback'));
  for (const role of FIVE_ROLES) {
    const entry = receipt.roles?.[role];
    if (!entry) continue;
    if (entry.found !== true) reasons.push(`${role}: the written row was not found in the database`);
    if (entry.valueMatched !== true) reasons.push(`${role}: the database value is not the written value`);
    if (entry.ownerMatched !== true) reasons.push(`${role}: the database row is not owned by the synthetic ${role}`);
    const accepted = acceptance?.roles?.[role];
    if (accepted && entry.recordId !== accepted.recordId) reasons.push(`${role}: readback checked a different record than acceptance wrote`);
    if (accepted && entry.userId !== accepted.userId) reasons.push(`${role}: readback checked a different user than acceptance ran as`);
  }
  return reasons;
}

export function cleanupReasons(receipt, acceptance) {
  if (receipt.kind !== CLEANUP_KIND) return ['cleanup receipt has the wrong kind'];
  if (receipt.success !== true) return [`cleanup did not succeed (${receipt.error ?? 'no error recorded'})`];
  if (receipt.fixturesCreated !== true) {
    return [`cleanup receipt says the five fixtures were not all created (${String(receipt.fixturesCreated)}), so no acceptance ran`];
  }
  const reasons = [...exactRoles(receipt.users, 'cleanup')];
  for (const role of FIVE_ROLES) {
    const entry = receipt.users?.[role];
    if (!entry) continue;
    if (entry.authAbsenceVerified !== true) reasons.push(`${role}: Auth absence was not verified`);
    if (entry.databaseAbsenceVerified !== true) reasons.push(`${role}: database absence was not verified`);
  }
  if (receipt.partner?.absenceVerified !== true) reasons.push('partner organization absence was not verified');
  if (receipt.notes?.absenceVerified !== true) reasons.push('note absence was not verified');
  const acceptedPartner = acceptance?.roles?.partner?.recordId;
  if (!acceptedPartner || receipt.partner?.partnerId !== acceptedPartner) {
    reasons.push('cleanup removed a different partner organization than acceptance wrote to');
  }
  // Every written record, by the exact ID acceptance reported, was looked up and found absent.
  for (const role of FIVE_ROLES) {
    const record = receipt.records?.[role];
    const accepted = acceptance?.roles?.[role]?.recordId;
    if (!record || record.absenceVerified !== true) reasons.push(`${role}: absence of the written record was not verified`);
    else if (!accepted || record.recordId !== accepted) reasons.push(`${role}: cleanup checked a different record than acceptance wrote`);
  }
  return reasons;
}

/**
 * Every receipt must carry a valid first-attempt runId (`<GITHUB_RUN_ID>-1`)
 * equal to the run being verified. A missing, empty, malformed, re-run or
 * other-run ID never passes, even when the other receipts agree with it.
 */
function runIdReasons(label, receipt, expectedRunId) {
  const runId = receipt?.runId;
  if (typeof runId !== 'string' || !RUN_ID.test(runId)) return [`${label} receipt has no valid first-attempt runId`];
  if (runId !== expectedRunId) return [`${label} receipt is for another run, not this workflow run`];
  return [];
}

/**
 * The ONE green check. Reads the three receipts together and passes only when
 * each passes on its own, ALL THREE carry the expected first-attempt run ID of
 * the workflow run being verified, and they name the same five users and
 * (acceptance vs readback) the same records. `expectedRunId` comes from the
 * workflow (runIdFor(GITHUB_RUN_ID, GITHUB_RUN_ATTEMPT)), never from a
 * receipt. Every reason is returned so one failure never hides another.
 * Never throws.
 */
export function verifyFiveRoleRun(acceptancePath, readbackPath, cleanupPath, expectedRunId) {
  const acceptance = readReceipt(acceptancePath, 'acceptance');
  const readback = readReceipt(readbackPath, 'readback');
  const cleanup = readReceipt(cleanupPath, 'cleanup');
  const reasons = [];
  const expectedValid = typeof expectedRunId === 'string' && RUN_ID.test(expectedRunId);
  if (!expectedValid) reasons.push('the expected workflow run ID is not a valid first-attempt run ID');
  if (acceptance.reason) reasons.push(acceptance.reason);
  else reasons.push(...acceptanceReasons(acceptance.receipt));
  if (readback.reason) reasons.push(readback.reason);
  else reasons.push(...readbackReasons(readback.receipt, acceptance.receipt));
  if (cleanup.reason) reasons.push(cleanup.reason);
  else reasons.push(...cleanupReasons(cleanup.receipt, acceptance.receipt));

  if (expectedValid) {
    for (const [label, loaded] of [['acceptance', acceptance], ['readback', readback], ['cleanup', cleanup]]) {
      if (loaded.receipt) reasons.push(...runIdReasons(label, loaded.receipt, expectedRunId));
    }
  }
  for (const role of FIVE_ROLES) {
    const accepted = acceptance.receipt?.roles?.[role];
    const removed = cleanup.receipt?.users?.[role];
    if (accepted && removed) {
      if (accepted.userId !== removed.userId || accepted.email !== removed.email) {
        reasons.push(`${role}: acceptance and cleanup name different users`);
      }
    }
  }
  return reasons.length === 0
    ? { ok: true, reasons: ['all five roles wrote, read back through the app and the database, and cleanup verified every fixture absent'] }
    : { ok: false, reasons };
}
