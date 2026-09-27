/** MOCKED/offline tests: no network, no deployment; receipts are temp files. */
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { hostnameOf, isProductionHost, verifyAcceptanceReceipt, verifyCleanupReceipt } from './resume-acceptance-receipt.mjs';

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

test('[mock] the receipt check fails on a missing, broken, failing or multi-Build receipt', () => {
  const dir = mkdtempSync(join(tmpdir(), 'resume-receipt-'));
  const write = (name: string, body: string) => { const path = join(dir, name); writeFileSync(path, body); return path; };
  assert.equal(verifyAcceptanceReceipt(join(dir, 'missing.json')).ok, false);
  assert.equal(verifyAcceptanceReceipt(write('broken.json', '{')).ok, false);
  assert.equal(verifyAcceptanceReceipt(write('fail.json', JSON.stringify({ pass: false, outcome: 'provider_unconfigured' }))).ok, false);
  assert.equal(verifyAcceptanceReceipt(write('odd.json', JSON.stringify({ pass: true, outcome: 'guard_factuality_422', buildRequestsMade: 1 }))).ok, false);
  assert.equal(verifyAcceptanceReceipt(write('two.json', JSON.stringify({ pass: true, outcome: 'success', buildRequestsMade: 2 }))).ok, false);
  assert.deepEqual(
    verifyAcceptanceReceipt(write('ok.json', JSON.stringify({ pass: true, outcome: 'success', buildRequestsMade: 1 }))),
    { ok: true, reason: 'pass' },
  );
});

test('[mock] the cleanup receipt check requires verified Auth and Prisma absence and empty member prefixes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'resume-cleanup-'));
  const write = (name: string, body: unknown) => {
    const path = join(dir, name);
    writeFileSync(path, typeof body === 'string' ? body : JSON.stringify(body));
    return path;
  };
  const good = {
    success: true, memberCreated: true, authAbsenceVerified: true, prismaUserAbsenceVerified: true,
    storage: { before: { 'member-resumes': 2, 'member-files': 0 }, removed: 2, after: { 'member-resumes': 0, 'member-files': 0 } },
  };
  assert.equal(verifyCleanupReceipt(join(dir, 'missing.json')).ok, false);
  assert.equal(verifyCleanupReceipt(write('broken.json', '{')).ok, false);
  assert.equal(verifyCleanupReceipt(write('failed.json', { success: false, error: 'Auth lookup' })).ok, false);
  assert.equal(verifyCleanupReceipt(write('auth.json', { ...good, authAbsenceVerified: false })).ok, false);
  assert.equal(verifyCleanupReceipt(write('prisma.json', { ...good, prismaUserAbsenceVerified: undefined })).ok, false);
  assert.equal(verifyCleanupReceipt(write('left.json', { ...good, storage: { ...good.storage, after: { 'member-resumes': 1, 'member-files': 0 } } })).ok, false);
  assert.equal(verifyCleanupReceipt(write('nocounts.json', { ...good, storage: undefined })).ok, false);
  assert.equal(verifyCleanupReceipt(write('unknown.json', { success: true })).ok, false);
  assert.equal(verifyCleanupReceipt(write('ok.json', good)).ok, true);
  assert.equal(verifyCleanupReceipt(write('none.json', { success: true, memberCreated: false })).ok, true);
});
