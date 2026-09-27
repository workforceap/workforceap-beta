/** MOCKED/offline tests: no network, no deployment; receipts are temp files. */
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { hostnameOf, isProductionHost, verifyAcceptanceRun } from './resume-acceptance-receipt.mjs';

test('[mock] only the exact production hostnames are production', () => {
  assert.equal(isProductionHost('workforceap.org'), true);
  assert.equal(isProductionHost('WWW.workforceap.org.'), true);
  for (const host of ['preview.workforceap.org', 'demo.workforceap.org', 'workforceap-git-preview.vercel.app', 'workforceap.org.evil.test']) {
    assert.equal(isProductionHost(host), false, host);
  }
  assert.equal(hostnameOf('https://www.workforceap.org/dashboard'), 'www.workforceap.org');
  assert.equal(hostnameOf('not a url'), null);
  assert.equal(hostnameOf('javascript:alert(1)'), null);
});

const MEMBER = { runId: '123-1', userId: '11111111-1111-4111-8111-111111111111', email: 'resume-qa-123-1@example.com' };
const PASSING_ACCEPTANCE = { pass: true, outcome: 'success', buildRequestsMade: 1, member: MEMBER };
const VERIFIED_CLEANUP = {
  success: true, memberCreated: true, ...MEMBER, authAbsenceVerified: true, prismaUserAbsenceVerified: true,
  storage: { before: { 'member-resumes': 2, 'member-files': 0 }, removed: 2, after: { 'member-resumes': 0, 'member-files': 0 } },
};

function receipts() {
  const dir = mkdtempSync(join(tmpdir(), 'resume-receipt-'));
  let n = 0;
  const write = (body: unknown) => {
    const path = join(dir, `r${n++}.json`);
    writeFileSync(path, typeof body === 'string' ? body : JSON.stringify(body));
    return path;
  };
  const run = (acceptance: unknown, cleanup: unknown) => verifyAcceptanceRun(
    acceptance === undefined ? join(dir, 'missing-acceptance.json') : write(acceptance),
    cleanup === undefined ? join(dir, 'missing-cleanup.json') : write(cleanup),
  );
  return { run };
}

test('[mock] the full pass pair for the same member passes', () => {
  const { run } = receipts();
  assert.deepEqual(run(PASSING_ACCEPTANCE, VERIFIED_CLEANUP), {
    ok: true, reasons: ['acceptance passed as the member that cleanup removed and verified'],
  });
});

test('[mock] a passing acceptance with a no-op cleanup receipt fails', () => {
  const { run } = receipts();
  const result = run(PASSING_ACCEPTANCE, { success: true, memberCreated: false });
  assert.equal(result.ok, false);
  assert.match(result.reasons.join('\n'), /no member was created/);
});

test('[mock] a passing acceptance with cleanup for a different member or run fails', () => {
  const { run } = receipts();
  for (const [key, value] of [
    ['runId', '124-1'],
    ['userId', '22222222-2222-4222-8222-222222222222'],
    ['email', 'resume-qa-124-1@example.com'],
  ] as const) {
    const result = run(PASSING_ACCEPTANCE, { ...VERIFIED_CLEANUP, [key]: value });
    assert.equal(result.ok, false, key);
    assert.deepEqual(result.reasons, [`receipts name different members (${key} differs)`], key);
  }
  const unnamed = run(PASSING_ACCEPTANCE, { ...VERIFIED_CLEANUP, userId: undefined });
  assert.equal(unnamed.ok, false);
  assert.match(unnamed.reasons.join('\n'), /does not record the member it removed/);
});

test('[mock] a pre-create failure (refused acceptance + no-op cleanup) fails with clear reasons', () => {
  const { run } = receipts();
  const result = run(
    { pass: false, outcome: 'refused', refusal: 'refusing a production host', buildRequestsMade: 0 },
    { success: true, memberCreated: false },
  );
  assert.equal(result.ok, false);
  assert.deepEqual(result.reasons, [
    'acceptance did not pass (outcome: refused: refusing a production host)',
    'acceptance receipt records 0 Build requests, not exactly one',
    'acceptance receipt does not record the member it ran as (userId, email, runId)',
    'cleanup receipt says no member was created (pre-create failure), so no acceptance ran',
  ]);
});

test('[mock] a missing, broken, failing, multi-Build or unattributed acceptance receipt fails', () => {
  const { run } = receipts();
  for (const acceptance of [
    undefined,
    '{',
    { pass: false, outcome: 'provider_unconfigured', buildRequestsMade: 1, member: MEMBER },
    { pass: true, outcome: 'guard_factuality_422', buildRequestsMade: 1, member: MEMBER },
    { pass: true, outcome: 'success', buildRequestsMade: 2, member: MEMBER },
    { pass: true, outcome: 'success', buildRequestsMade: 1 },
  ]) {
    assert.equal(run(acceptance, VERIFIED_CLEANUP).ok, false, JSON.stringify(acceptance));
  }
});

test('[mock] cleanup must prove Auth and Prisma absence and empty member prefixes', () => {
  const { run } = receipts();
  for (const cleanup of [
    undefined,
    '{',
    { success: false, memberCreated: true, ...MEMBER, error: 'Auth lookup' },
    { success: true },
    { success: true, memberCreated: 'unknown' },
    { ...VERIFIED_CLEANUP, authAbsenceVerified: false },
    { ...VERIFIED_CLEANUP, prismaUserAbsenceVerified: undefined },
    { ...VERIFIED_CLEANUP, storage: { ...VERIFIED_CLEANUP.storage, after: { 'member-resumes': 1, 'member-files': 0 } } },
    { ...VERIFIED_CLEANUP, storage: undefined },
  ]) {
    assert.equal(run(PASSING_ACCEPTANCE, cleanup).ok, false, JSON.stringify(cleanup));
  }
});
