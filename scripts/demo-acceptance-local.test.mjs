import test from 'node:test';
import assert from 'node:assert/strict';
import { localFixtureEnvironment, localReceiptDigest, verifyLocalExecution, localContractIdentity } from './lib/demo-acceptance-local.mjs';
test('local-only identity carries no invented hosted workflow provenance', () => {
  const identity = localContractIdentity('a'.repeat(40), 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee');
  assert.equal(identity.runId, 'local-aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee');
  assert.equal(identity.repository, undefined); assert.equal(identity.workflowRunId, undefined); assert.equal(identity.workflowAttempt, undefined);
  assert.equal(identity.organizationId, 'local-fixtures-only');
  assert.notEqual(identity.planHash, localContractIdentity('b'.repeat(40), 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee').planHash);
});
test('local server and browser environment excludes all hosted credentials', () => {
  const env = localFixtureEnvironment({ PATH: '/bin', HOME: '/home/test', DEMO_QA_DATABASE_URL: 'private', DEMO_QA_SERVICE_ROLE_KEY: 'private', GH_TOKEN: 'private', FIVE_ROLE_QA_ADMIN_PASSWORD: 'private', NODE_OPTIONS: '--require unsafe' }, 'a'.repeat(40), 'local-only'.repeat(5));
  assert.equal(env.PATH, '/bin');
  assert.equal(env.PORTAL_ACCEPTANCE_OWNED_DISCONNECTED_SERVER, 'true');
  for (const key of ['DEMO_QA_DATABASE_URL', 'DEMO_QA_SERVICE_ROLE_KEY', 'GH_TOKEN', 'FIVE_ROLE_QA_ADMIN_PASSWORD', 'NODE_OPTIONS']) assert.equal(env[key], undefined);
});
test('local fixture execution binds exact bytes, source and workflow identity', () => {
  const identity = { controlSha: 'a'.repeat(40), deployedSha: 'a'.repeat(40), workflowRunId: '42' };
  const ownership = { kind: 'owned-disconnected-listener', controlSha: identity.controlSha, origin: 'http://127.0.0.1:3107', serverPid: 42, listenerPid: 43, socketInode: '1234', nonceDigest: 'd'.repeat(64) };
  const bytes = Buffer.from(JSON.stringify({ receipts: [], localIsolation: ownership }));
  const execution = { kind: 'portal-local-fixture-execution', status: 'completed', serverStopped: true, sourceTreeClean: true, ownership, identity, controlSha: identity.controlSha, workflowRunId: '42', workflowAttempt: 1, command: 'node scripts/run-portal-local-fixtures.mjs', receiptDigest: localReceiptDigest(bytes), startedAt: '2026-10-27T00:00:00Z', completedAt: '2026-10-27T00:01:00Z' };
  verifyLocalExecution(execution, bytes, identity);
  for (const patch of [{ workflowRunId: '43' }, { controlSha: 'b'.repeat(40) }, { serverStopped: false }, { localContractOnly: true }, { receiptDigest: '0'.repeat(64) }, { ownership: { ...ownership, nonceDigest: 'e'.repeat(64) } }]) assert.throws(() => verifyLocalExecution({ ...execution, ...patch }, bytes, identity));
});
