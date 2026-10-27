/**
 * Native unit tests for the DEMO portal QA journal (no network, no DB).
 * Memory store simulates SERIALIZABLE transactions for competing claims/CAS.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ALLOWED_KINDS,
  PROJECT_REF,
  canonical,
  createJournal,
  createMemoryJournalStore,
  createPrismaJournalStore,
  digest,
  normalizeIdentity,
} from './lib/demo-acceptance-journal.mjs';

const SHA40_A = 'a'.repeat(40);
const SHA40_B = 'b'.repeat(40);
const SHA40_C = 'c'.repeat(40);
const PLAN = 'd'.repeat(64);
const ORG = '11111111-2222-4333-8444-555555555555';

function identity(overrides = {}) {
  return normalizeIdentity({
    repository: 'workforceap/workforceap-beta',
    workflowRunId: 9001,
    workflowAttempt: 1,
    projectRef: PROJECT_REF,
    organizationId: ORG,
    controlSha: SHA40_A,
    deployedSha: SHA40_B,
    baselineSha: SHA40_C,
    planHash: PLAN,
    ...overrides,
    runId: String(overrides.runId ?? '42') + '-1',
    workflowRunId: String(overrides.runId ?? '42'),
  });
}

function githubProof(overrides = {}) {
  return {
    source: 'github',
    repository: 'workforceap/workforceap-beta',
    runId: 13,
    status: 'completed',
    conclusion: 'success',
    observedAt: '2026-10-27T00:00:00.000Z',
    ...overrides,
  };
}

test('canonical sorts keys recursively and digest is SHA256 of canonical', () => {
  const a = { z: 1, a: { c: 3, b: [2, { y: 1, x: 0 }] } };
  const b = { a: { b: [2, { x: 0, y: 1 }], c: 3 }, z: 1 };
  assert.equal(canonical(a), canonical(b));
  assert.equal(digest(a), digest(b));
  assert.match(digest(a), /^[0-9a-f]{64}$/);
  assert.notEqual(digest(a), digest({ ...a, z: 2 }));
});

test('claim requires empty revision 0 and returns chained state', async () => {
  const journal = createJournal(createMemoryJournalStore());
  const id = identity();
  const state = await journal.claim(id, 'owner-a');
  assert.equal(state.revision, 1);
  assert.equal(state.owner, 'owner-a');
  assert.deepEqual(state.identity, id);
  assert.equal(state.events[0].kind, 'claimed');
  assert.equal(state.events[0].prevDigest, null);
  assert.equal(state.digest, state.events[0].digest);
  assert.equal(state.events[0].id, digest(`${id.runId}/1`));

  await assert.rejects(() => journal.claim(id, 'owner-b'), /revision 0 empty/);
});

test('competing claims: only one wins under serialized memory transactions', async () => {
  const store = createMemoryJournalStore();
  const journal = createJournal(store);
  const id = identity({ runId: 7, workflowRunId: 7 });

  const results = await Promise.allSettled([
    journal.claim(id, 'claimant-1'),
    journal.claim(id, 'claimant-2'),
  ]);
  const fulfilled = results.filter((r) => r.status === 'fulfilled');
  const rejected = results.filter((r) => r.status === 'rejected');
  assert.equal(fulfilled.length, 1);
  assert.equal(rejected.length, 1);
  assert.match(String(rejected[0].reason.message), /revision 0 empty/);
  const read = await journal.read('7-1');
  assert.equal(read.revision, 1);
  assert.ok(['claimant-1', 'claimant-2'].includes(read.owner));
});

test('append CAS owner+revision; rejects claimed/handoff via generic append', async () => {
  const journal = createJournal(createMemoryJournalStore());
  const id = identity({ runId: 8 });
  const claimed = await journal.claim(id, 'owner-a');
  await assert.rejects(
    () => journal.append('8-1', 'owner-a', claimed.revision, 'claimed', {}),
    /generic append/,
  );
  await assert.rejects(
    () => journal.append('8-1', 'owner-a', claimed.revision, 'handoff', {}),
    /generic append/,
  );
  await assert.rejects(
    () => journal.append('8-1', 'wrong', claimed.revision, 'intent', { step: 1 }),
    /stale owner/,
  );
  await assert.rejects(
    () => journal.append('8-1', 'owner-a', claimed.revision + 1, 'intent', { step: 1 }),
    /stale revision/,
  );

  const next = await journal.append('8-1', 'owner-a', claimed.revision, 'intent', { step: 1 });
  assert.equal(next.revision, 2);
  assert.equal(next.events[1].kind, 'intent');
  assert.equal(next.events[1].prevDigest, claimed.digest);
  assert.deepEqual(next.identity, id);
});

test('rejects secret keys in data', async () => {
  const journal = createJournal(createMemoryJournalStore());
  const id = identity({ runId: 9 });
  const claimed = await journal.claim(id, 'owner-a');
  await assert.rejects(
    () => journal.append('9-1', 'owner-a', claimed.revision, 'intent', { apiKey: 'x' }),
    /secret key/,
  );
});

test('append on unclaimed journal rejects missing chain', async () => {
  const journal = createJournal(createMemoryJournalStore());
  await assert.rejects(
    () => journal.append('99-1', 'owner-a', 0, 'intent', { step: 1 }),
    /missing chain/,
  );
});

test('out-of-order and duplicate revisions are rejected', async () => {
  const durable = new Map();
  const store = createMemoryJournalStore({ durable });
  const journal = createJournal(store);
  const id = identity({ runId: 14 });
  await journal.claim(id, 'owner-a');
  const claimed = [...durable.values()][0];
  const dup = structuredClone(claimed);
  dup.id = digest(`${id.runId}/2`);
  dup.revision = 2;
  dup.prevDigest = claimed.digest;
  dup.kind = 'intent';
  dup.data = {};
  delete dup.identity;
  dup.digest = digest({
    data: dup.data,
    id: dup.id,
    kind: dup.kind,
    owner: dup.owner,
    prevDigest: dup.prevDigest,
    revision: dup.revision,
    runId: dup.runId,
  });
  durable.set(dup.id, dup);
  // Break order: revision 2 then a forged revision 4 gap.
  const gap = structuredClone(dup);
  gap.id = digest(`${id.runId}/4`);
  gap.revision = 4;
  gap.prevDigest = dup.digest;
  gap.digest = digest({
    data: gap.data,
    id: gap.id,
    kind: gap.kind,
    owner: gap.owner,
    prevDigest: gap.prevDigest,
    revision: gap.revision,
    runId: gap.runId,
  });
  durable.set(gap.id, gap);
  await assert.rejects(() => journal.read('14-1'), /out-of-order/);
});

test('readback failure aborts when find does not return inserted event', async () => {
  const store = createMemoryJournalStore({
    wrapTx(tx) {
      const originalInsert = tx.insert.bind(tx);
      tx.insert = async (event) => {
        await originalInsert(event);
      };
      tx.find = async () => null;
    },
  });
  const journal = createJournal(store);
  await assert.rejects(() => journal.claim(identity({ runId: 10 }), 'owner-a'), /readback failure/);
});

test('chain tamper is rejected on read and append', async () => {
  const durable = new Map();
  const store = createMemoryJournalStore({ durable });
  const journal = createJournal(store);
  const id = identity({ runId: 11 });
  await journal.claim(id, 'owner-a');
  const [event] = [...durable.values()];
  event.digest = '0'.repeat(64);
  durable.set(event.id, event);

  await assert.rejects(() => journal.read('11-1'), /tampered chain/);
  await assert.rejects(
    () => journal.append('11-1', 'owner-a', 1, 'intent', { step: 1 }),
    /tampered chain/,
  );
});

test('crash after durable intent survives; recovery continues from stored chain', async () => {
  const durable = new Map();
  const store = createMemoryJournalStore({ durable });
  const journal = createJournal(store);
  const id = identity({ runId: 12 });
  const claimed = await journal.claim(id, 'owner-a');
  const afterIntent = await journal.append('12-1', 'owner-a', claimed.revision, 'intent', {
    phase: 'apply',
  });
  assert.equal(afterIntent.events.at(-1).kind, 'intent');

  // Simulate process crash: new store/journal over the same durable map.
  const recovered = createJournal(createMemoryJournalStore({ durable }));
  const read = await recovered.read('12-1');
  assert.equal(read.revision, 2);
  assert.equal(read.events[1].kind, 'intent');
  const continued = await recovered.append('12-1', 'owner-a', read.revision, 'confirmed', {
    ok: true,
  });
  assert.equal(continued.revision, 3);
  assert.equal(continued.events[1].kind, 'intent');
});

test('handoff rejects live run, wrong run, guessed timeout; accepts completed proof', async () => {
  const journal = createJournal(createMemoryJournalStore());
  const id = identity({ runId: 13, workflowRunId: 9001 });
  const claimed = await journal.claim(id, 'owner-a');

  await assert.rejects(
    () =>
      journal.handoff('13-1', 'owner-a', claimed.revision, 'owner-b', githubProof({ status: 'in_progress' })),
    /live run/,
  );
  await assert.rejects(
    () => journal.handoff('13-1', 'owner-a', claimed.revision, 'owner-b', githubProof({ runId: 9999 })),
    /wrong run/,
  );
  await assert.rejects(
    () =>
      journal.handoff('13-1', 'owner-a', claimed.revision, 'owner-b', githubProof({ guessed: true, timeout: true })),
    /guessed timeout/,
  );

  const handed = await journal.handoff(
    '13-1',
    'owner-a',
    claimed.revision,
    'owner-b',
    githubProof(),
  );
  assert.equal(handed.owner, 'owner-b');
  assert.equal(handed.events.at(-1).kind, 'handoff');
  assert.equal(handed.revision, 2);

  const verified = await journal.handoff('13-1', 'owner-b', handed.revision, 'owner-c', {
    verified: true,
    acknowledged: true,
    repository: id.repository,
    workflowRunId: id.workflowRunId,
  });
  assert.equal(verified.owner, 'owner-c');
});

test('allowed kinds cover the DEMO journal vocabulary', () => {
  assert.deepEqual(
    [...ALLOWED_KINDS],
    [
      'claimed',
      'intent',
      'confirmed',
      'quarantined',
      'db-committed',
      'readback',
      'cleanup-intent',
      'cleanup-confirmed',
      'cleanup-complete',
      'handoff',
    ],
  );
});

test('createPrismaJournalStore requires a prisma client shape', () => {
  assert.throws(() => createPrismaJournalStore(null), /prisma client required/);
  const store = createPrismaJournalStore({ $transaction: async () => null });
  assert.equal(typeof store.transaction, 'function');
});
