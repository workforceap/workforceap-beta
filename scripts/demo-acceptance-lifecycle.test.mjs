import test from 'node:test';
import assert from 'node:assert/strict';
import { createJournal, createMemoryJournalStore, digest } from './lib/demo-acceptance-journal.mjs';
import { createLifecycle, fixturePlan, fixtureStateFromJournal, pendingOperations, terminalRunProof, assertCleanupQuiescent } from './lib/demo-acceptance-lifecycle.mjs';

const identity = { repository: 'workforceap/workforceap-beta', workflowRunId: '42', workflowAttempt: 1, runId: '42-1', projectRef: 'esbdrgaonplpvzmtrdhw', organizationId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', controlSha: 'a'.repeat(40), deployedSha: 'b'.repeat(40), baselineSha: 'c'.repeat(40), planHash: digest(fixturePlan('42-1', 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee')) };
async function setup() {
  const store = createMemoryJournalStore();
  const journal = createJournal(store);
  const lifecycle = createLifecycle(journal, identity, 'owner-a');
  await lifecycle.claim();
  return { store, journal, lifecycle };
}

test('creation plan is durable before an external write and a lost response is never retried', async () => {
  const { journal, lifecycle } = await setup();
  let writes = 0;
  await assert.rejects(lifecycle.write('auth-create:member', null, { email: 'synthetic@example.com' }, async () => {
    writes++;
    const durable = await journal.read(identity.runId);
    assert.equal(durable.events[1].data.plan.version, 2);
    assert.equal(durable.events.at(-1).kind, 'intent');
    throw new Error('committed; response lost');
  }, () => true), /quarantined/);
  assert.equal(pendingOperations(await journal.read(identity.runId)).length, 1);
  await assert.rejects(lifecycle.write('auth-create:member', null, {}, () => { writes++; }, () => true), /already attempted/);
  assert.equal(writes, 1);
});

test('failure to persist the intent causes zero external writes', async () => {
  let fail = false;
  const store = createMemoryJournalStore({ wrapTx(tx) { const insert = tx.insert; tx.insert = event => { if (fail) throw new Error('disk unavailable'); return insert(event); }; } });
  const lifecycle = createLifecycle(createJournal(store), identity, 'owner-a');
  await lifecycle.claim(); fail = true;
  let calls = 0;
  await assert.rejects(lifecycle.write('x', null, {}, async () => { calls++; }, () => true));
  assert.equal(calls, 0);
});

test('an unresolved app request forbids cleanup even when worker observation times out', async () => {
  const { lifecycle, journal } = await setup();
  await assert.rejects(lifecycle.write('app:member-goal', null, {}, async () => { throw new Error('timeout'); }, () => true));
  const durable = await journal.read(identity.runId);
  assert.throws(() => assertCleanupQuiescent(durable), /quarantined/);
  await assert.rejects(lifecycle.reconcile('app:member-goal', async () => null), /unknown/);
});

test('a handoff during an external call rejects stale-owner confirmation', async () => {
  const { lifecycle, journal } = await setup();
  await assert.rejects(lifecycle.write('auth-create:member', null, {}, async () => {
    const current = await journal.read(identity.runId);
    await journal.handoff(identity.runId, 'owner-a', current.revision, 'owner-b', { source: 'github', repository: identity.repository, runId: '42', status: 'completed', conclusion: 'cancelled', observedAt: new Date().toISOString() });
    return 'created';
  }, () => ({ owned: true })), /quarantined/);
  assert.equal((await journal.read(identity.runId)).owner, 'owner-b');
  assert.equal(pendingOperations(await journal.read(identity.runId)).length, 1);
});

test('recovery read errors remain unknown; confirmed Auth identity is reconstructable after local state loss', async () => {
  const { lifecycle, journal } = await setup();
  await assert.rejects(lifecycle.write('auth-create:member', null, {}, async () => { throw new Error('lost'); }, () => true));
  await assert.rejects(lifecycle.reconcile('auth-create:member', async () => { throw new Error('read failed'); }));
  await lifecycle.reconcile('auth-create:member', async () => ({ outcome: 'owned', id: '11111111-1111-4111-8111-111111111111' }));
  const state = await journal.read(identity.runId);
  assert.equal(fixtureStateFromJournal(state).users.member.userId, '11111111-1111-4111-8111-111111111111');
  assertCleanupQuiescent(state);
  await assert.rejects(lifecycle.reconcile('auth-create:member', async () => ({ outcome: 'absent' })), /No unresolved/);
});

test('terminal proof binds repository, run, attempt and exact trusted control SHA', async () => {
  const run = { id: 42, repository: { full_name: identity.repository }, head_sha: identity.controlSha, run_attempt: 1, status: 'completed', conclusion: 'cancelled' };
  assert.equal((await terminalRunProof(identity, async () => run)).status, 'completed');
  for (const patch of [{ status: 'in_progress' }, { run_attempt: 2 }, { head_sha: 'd'.repeat(40) }, { id: 43 }]) {
    await assert.rejects(terminalRunProof(identity, async () => ({ ...run, ...patch })), /not authoritatively terminal/);
  }
});
