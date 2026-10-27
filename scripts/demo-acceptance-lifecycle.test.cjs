const test = require('node:test');
const assert = require('node:assert/strict');
const { createJournal, createMemoryJournalStore, digest } = require('./lib/demo-acceptance-journal.mjs');
const { createLifecycle, fixturePlan, fixtureStateFromJournal, pendingOperations, terminalRunProof, assertCleanupQuiescent, assertAcceptanceAction } = require('./lib/demo-acceptance-lifecycle.mjs');

const identity = { repository: 'workforceap/workforceap-beta', workflowRunId: '42', workflowAttempt: 1, runId: '42-1', projectRef: 'esbdrgaonplpvzmtrdhw', organizationId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', controlSha: 'a'.repeat(40), deployedSha: 'b'.repeat(40), baselineSha: 'c'.repeat(40), planHash: digest(fixturePlan('42-1', 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee')) };
async function setup() {
  const store = createMemoryJournalStore();
  const journal = createJournal(store);
  const lifecycle = createLifecycle(journal, identity, `${identity.repository}/42-1`);
  await lifecycle.claim();
  return { store, journal, lifecycle };
}
test('cleanup-only ownership cannot initiate product writes and unknown actions are refused', () => {
  assertAcceptanceAction('member-goal', 'acceptance');
  assertAcceptanceAction('browser-login:baseline:counselor', 'acceptance');
  assert.throws(() => assertAcceptanceAction('member-goal', 'recover-cleanup'), /not an approved/);
  assert.throws(() => assertAcceptanceAction('browser-login:production:admin', 'acceptance'), /not an approved/);
  assert.throws(() => assertAcceptanceAction('provider-enrollment', 'acceptance'), /not an approved/);
});

test('creation plan is durable before an external write and a lost response is never retried', async () => {
  const { journal, lifecycle } = await setup();
  let writes = 0;
  await assert.rejects(lifecycle.write('auth-create:member', null, { email: 'synthetic@example.com' }, async () => {
    writes++;
    const durable = await journal.read(identity.runId);
    assert.equal(durable.events[1].data.plan.version, 2);
    assert.equal(durable.events.at(-2).kind, 'intent');
    assert.equal(durable.events.at(-1).kind, 'dispatch-started');
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
    await journal.handoff(identity.runId, `${identity.repository}/42-1`, current.revision, `${identity.repository}/43-1`, { source: 'github', owner: `${identity.repository}/42-1`, headSha: identity.controlSha, workflowAttempt: 1, repository: identity.repository, runId: '42', status: 'completed', conclusion: 'cancelled', observedAt: new Date().toISOString() });
    return 'created';
  }, () => ({ owned: true })), /quarantined/);
  assert.equal((await journal.read(identity.runId)).owner, `${identity.repository}/43-1`);
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

test('a received write followed by a UI/readback mismatch remains failed but can clean up', async () => {
  const { lifecycle, journal } = await setup();
  const ownedGraph = { Goal: [{ id: 'owned-goal', title: 'written' }] };
  await assert.rejects(lifecycle.write('app:member-goal', null, {}, async received => {
    await received({ status: 201 });
    throw new Error('UI selector mismatch after the write landed');
  }, () => false, { readKnownFailure: async () => ({ ownedGraph, acceptancePassed: false }) }), /cleanup remains available/);
  const state = await journal.read(identity.runId);
  assert.equal(state.events.at(-1).kind, 'failed-confirmed');
  assert.deepEqual(state.events.at(-1).data.observed.ownedGraph, ownedGraph);
  assertCleanupQuiescent(state);
  await assert.rejects(lifecycle.write('app:member-goal', null, {}, async () => 'retry', () => true), /already attempted/);
});

test('a durable Auth intent before dispatch can reconcile proven absence without sending', async () => {
  const { lifecycle, journal } = await setup();
  await lifecycle.append('intent', { operationId: 'auth-create:member', preimage: null });
  const state = await journal.read(identity.runId);
  assert.equal(state.events.some(event => event.kind === 'dispatch-started'), false);
  await lifecycle.reconcile('auth-create:member', async () => ({ outcome: 'absent', neverDispatched: true }));
  assertCleanupQuiescent(await journal.read(identity.runId));
});

test('a selector failure before the login POST stays a known never-dispatched failure', async () => {
  const { lifecycle, journal } = await setup();
  await assert.rejects(lifecycle.write('app:login:member', null, {}, async () => { throw new Error('Login field missing before POST'); }, () => true,
    { deferDispatch: true, readKnownFailure: async () => ({ ownedGraph: {}, acceptancePassed: false }) }), /cleanup remains available/);
  const state = await journal.read(identity.runId);
  assert.equal(state.events.some(event => event.kind === 'dispatch-started'), false);
  assert.equal(state.events.at(-1).data.neverDispatched, true);
  assertCleanupQuiescent(state);
});

test('a later recovery owner must itself be terminal before another handoff', async () => {
  const owner = `${identity.repository}/90-1`;
  const run = { id: 90, repository: { full_name: identity.repository }, head_sha: 'd'.repeat(40), run_attempt: 1, status: 'in_progress', event: 'workflow_dispatch', head_branch: 'master', path: '.github/workflows/five-role-demo-acceptance.yml' };
  await assert.rejects(terminalRunProof(identity, async id => { assert.equal(id, '90'); return run; }, owner), /terminal/);
  const proof = await terminalRunProof(identity, async () => ({ ...run, status: 'completed', conclusion: 'cancelled' }), owner);
  assert.equal(proof.runId, '90'); assert.equal(proof.owner, owner);
});
