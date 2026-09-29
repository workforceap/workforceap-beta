/**
 * MOCKED — NOT ACCEPTANCE. Offline tests of the WAP-6 receipt rules in
 * scripts/lib/five-role-acceptance.mjs: temp JSON files only, no Preview, no
 * DEMO project, no database. A pass here proves only that the verifier cannot
 * report a pass without all three real receipts agreeing.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  ACCEPTANCE_KIND,
  acceptanceRefusal,
  CLEANUP_KIND,
  emailFor,
  FIVE_ROLES,
  READBACK_KIND,
  runIdFor,
  verifyFiveRoleRun,
} from './lib/five-role-acceptance.mjs';

const RUN = '123456-1';
const id = (n: number) => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`;
const USER = Object.fromEntries(FIVE_ROLES.map((role: string, i: number) => [role, id(i + 1)])) as Record<string, string>;
const RECORD = Object.fromEntries(FIVE_ROLES.map((role: string, i: number) => [role, id(i + 11)])) as Record<string, string>;

function acceptance(overrides: Record<string, unknown> = {}) {
  return {
    kind: ACCEPTANCE_KIND, runId: RUN, attempts: 1, pass: true, outcome: 'success',
    roles: Object.fromEntries(FIVE_ROLES.map((role: string) => [role, {
      userId: USER[role], email: emailFor(RUN, role), identityVerified: true,
      action: { method: 'POST', path: '/x', status: 200, ok: true }, recordId: RECORD[role],
      appReadback: { status: 200, matched: true },
    }])),
    ...overrides,
  };
}
function readback(overrides: Record<string, unknown> = {}) {
  return {
    kind: READBACK_KIND, runId: RUN, success: true,
    roles: Object.fromEntries(FIVE_ROLES.map((role: string) => [role, { recordId: RECORD[role], found: true, ownerMatched: true, valueMatched: true }])),
    ...overrides,
  };
}
function cleanup(overrides: Record<string, unknown> = {}) {
  return {
    kind: CLEANUP_KIND, runId: RUN, success: true, fixturesCreated: true, auditRowsRetained: true,
    users: Object.fromEntries(FIVE_ROLES.map((role: string) => [role, {
      userId: USER[role], email: emailFor(RUN, role), authAbsenceVerified: true, databaseAbsenceVerified: true,
    }])),
    partner: { partnerId: RECORD.partner, deleted: true, absenceVerified: true },
    notes: { deleted: 2, absenceVerified: true },
    ...overrides,
  };
}

function files(a: unknown, r: unknown, c: unknown) {
  const dir = mkdtempSync(join(tmpdir(), 'wap6-receipts-'));
  const paths = { a: join(dir, 'a.json'), r: join(dir, 'r.json'), c: join(dir, 'c.json') };
  for (const [key, value] of [['a', a], ['r', r], ['c', c]] as const) {
    if (value !== undefined) writeFileSync(paths[key], typeof value === 'string' ? value : JSON.stringify(value));
  }
  return paths;
}
const verify = (a: unknown, r: unknown, c: unknown) => {
  const p = files(a, r, c);
  return verifyFiveRoleRun(p.a, p.r, p.c);
};
const withRole = (receipt: ReturnType<typeof acceptance>, role: string, patch: Record<string, unknown>) => ({
  ...receipt, roles: { ...receipt.roles, [role]: { ...(receipt.roles as Record<string, object>)[role], ...patch } },
});

test('[mocked — NOT acceptance] three agreeing receipts are the only passing shape', () => {
  assert.deepEqual(verify(acceptance(), readback(), cleanup()).ok, true);
});

test('[mocked — NOT acceptance] a missing or unreadable receipt never passes', () => {
  for (const [a, r, c, reason] of [
    [undefined, readback(), cleanup(), /acceptance receipt is missing/],
    [acceptance(), undefined, cleanup(), /readback receipt is missing/],
    [acceptance(), readback(), undefined, /cleanup receipt is missing/],
    ['{not json', readback(), cleanup(), /acceptance receipt is not valid JSON/],
    [acceptance(), '[]', cleanup(), /readback receipt is not a JSON object/],
  ] as const) {
    const result = verify(a, r, c);
    assert.equal(result.ok, false);
    assert.match(result.reasons.join('\n'), reason);
  }
});

test('[mocked — NOT acceptance] partial acceptance: a missing role, a failed write or an unmatched app readback fails', () => {
  const { admin: _admin, ...fourRoles } = acceptance().roles as Record<string, unknown>;
  const cases: Array<[unknown, RegExp]> = [
    [{ ...acceptance(), roles: fourRoles }, /acceptance receipt does not cover exactly the five roles/],
    [withRole(acceptance(), 'employer', { action: { status: 403, ok: false } }), /employer: the write did not succeed \(status 403\)/],
    [withRole(acceptance(), 'partner', { appReadback: { status: 200, matched: false } }), /partner: the app readback did not show the written value/],
    [withRole(acceptance(), 'member', { identityVerified: false }), /member: session identity was not verified/],
    [withRole(acceptance(), 'counselor', { recordId: null }), /counselor: no written record ID/],
    [withRole(acceptance(), 'admin', { email: 'admin-test@workforceap.org' }), /admin: acceptance ran as a user that is not this run's synthetic admin/],
    [{ ...acceptance(), pass: false, outcome: 'refused', refusal: 'x' }, /acceptance did not pass \(outcome: refused: x\)/],
    [{ ...acceptance(), attempts: 2 }, /exactly one attempt/],
    [{ ...acceptance(), kind: 'resume' }, /acceptance receipt has the wrong kind/],
  ];
  for (const [a, reason] of cases) {
    const result = verify(a, readback(), cleanup());
    assert.equal(result.ok, false);
    assert.match(result.reasons.join('\n'), reason);
  }
});

test('[mocked — NOT acceptance] a pass needs the database readback, for the same records', () => {
  const r = readback();
  const roles = r.roles as Record<string, Record<string, unknown>>;
  const cases: Array<[unknown, RegExp]> = [
    [{ ...r, success: false, error: 'db' }, /database readback did not succeed \(db\)/],
    [{ ...r, roles: { ...roles, member: { ...roles.member, found: false } } }, /member: the written row was not found/],
    [{ ...r, roles: { ...roles, admin: { ...roles.admin, valueMatched: false } } }, /admin: the database value is not the written value/],
    [{ ...r, roles: { ...roles, counselor: { ...roles.counselor, ownerMatched: false } } }, /counselor: the database row is not owned/],
    [{ ...r, roles: { ...roles, employer: { ...roles.employer, recordId: id(99) } } }, /employer: readback checked a different record/],
  ];
  for (const [readbackReceipt, reason] of cases) {
    const result = verify(acceptance(), readbackReceipt, cleanup());
    assert.equal(result.ok, false);
    assert.match(result.reasons.join('\n'), reason);
  }
});

test('[mocked — NOT acceptance] a pass needs verified cleanup absence for every fixture', () => {
  const c = cleanup();
  const users = c.users as Record<string, Record<string, unknown>>;
  const cases: Array<[unknown, RegExp]> = [
    [{ ...c, success: false, error: 'Auth delete' }, /cleanup did not succeed \(Auth delete\)/],
    [{ ...c, fixturesCreated: false, informationalOnly: true }, /fixtures were not all created \(false\)/],
    [{ ...c, fixturesCreated: 'partial' }, /fixtures were not all created \(partial\)/],
    [{ ...c, users: { ...users, partner: { ...users.partner, authAbsenceVerified: false } } }, /partner: Auth absence was not verified/],
    [{ ...c, users: { ...users, member: { ...users.member, databaseAbsenceVerified: false } } }, /member: database absence was not verified/],
    [{ ...c, partner: { absenceVerified: false } }, /partner organization absence was not verified/],
    [{ ...c, notes: { deleted: 0 } }, /note absence was not verified/],
    [{ ...c, kind: 'resume' }, /cleanup receipt has the wrong kind/],
  ];
  for (const [cleanupReceipt, reason] of cases) {
    const result = verify(acceptance(), readback(), cleanupReceipt);
    assert.equal(result.ok, false);
    assert.match(result.reasons.join('\n'), reason);
  }
});

test('[mocked — NOT acceptance] receipts from different runs or users never combine into a pass', () => {
  const other = verify(acceptance(), readback({ runId: '999-1' }), cleanup());
  assert.equal(other.ok, false);
  assert.match(other.reasons.join('\n'), /receipts name different runs/);

  const c = cleanup();
  const users = c.users as Record<string, Record<string, unknown>>;
  const swapped = verify(acceptance(), readback(), { ...c, users: { ...users, employer: { ...users.employer, userId: id(77) } } });
  assert.equal(swapped.ok, false);
  assert.match(swapped.reasons.join('\n'), /employer: acceptance and cleanup name different users/);
});

test('[mocked — NOT acceptance] the spec refuses production, shared accounts, missing confirmation and re-run IDs', () => {
  const env: Record<string, string> = {
    FIVE_ROLE_ACCEPTANCE_CONFIRMED: '1', PLAYWRIGHT_BASE_URL: 'https://workforceap-beta-git-preview-x.vercel.app',
    FIVE_ROLE_QA_RUN_ID: RUN, FIVE_ROLE_QA_EMPLOYER_RECORD_ID: RECORD.employer, FIVE_ROLE_QA_PARTNER_RECORD_ID: RECORD.partner,
  };
  for (const role of FIVE_ROLES as string[]) {
    env[`FIVE_ROLE_QA_${role.toUpperCase()}_EMAIL`] = emailFor(RUN, role);
    env[`FIVE_ROLE_QA_${role.toUpperCase()}_ID`] = USER[role];
    env[`FIVE_ROLE_QA_${role.toUpperCase()}_PASSWORD`] = 'x'.repeat(32);
  }
  assert.equal(acceptanceRefusal(env), null);
  assert.match(acceptanceRefusal({ ...env, PLAYWRIGHT_BASE_URL: 'https://www.workforceap.org' })!, /production host/);
  assert.match(acceptanceRefusal({ ...env, FIVE_ROLE_ACCEPTANCE_CONFIRMED: '' })!, /CONFIRMED/);
  assert.match(acceptanceRefusal({ ...env, FIVE_ROLE_QA_MEMBER_EMAIL: 'member-test@workforceap.org' })!, /member account is not this run's synthetic user/);
  assert.match(acceptanceRefusal({ ...env, FIVE_ROLE_QA_RUN_ID: '123456-2' })!, /first-attempt run ID/);
  assert.match(acceptanceRefusal({ ...env, FIVE_ROLE_QA_ADMIN_PASSWORD: '' })!, /admin account inputs are not set/);
  assert.throws(() => runIdFor('123456', '2'), /re-runs are refused/);
  assert.equal(runIdFor('123456', '1'), RUN);
  assert.throws(() => emailFor('123456-2', 'member'), /non-synthetic/);
});
