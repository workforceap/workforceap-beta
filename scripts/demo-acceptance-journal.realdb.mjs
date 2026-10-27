/**
 * Local-only PostgreSQL contract test for createPrismaJournalStore.
 *
 * Gate: TEST_REAL_DB=1
 * Never targets a remote database URL. Uses @prisma/client against the
 * existing audit_logs schema with an isolated random runId, then deletes
 * only those rows. Not a live acceptance claim.
 *
 * Usage:
 *   TEST_REAL_DB=1 node scripts/demo-acceptance-journal.realdb.mjs
 */
import { createHash, randomInt } from 'node:crypto';
import process from 'node:process';
import { PrismaClient } from '@prisma/client';
import {
  PROJECT_REF,
  createJournal,
  createPrismaJournalStore,
  digest,
  normalizeIdentity,
} from './lib/demo-acceptance-journal.mjs';

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

function databaseUrl() {
  return (
    process.env.POSTGRES_PRISMA_URL ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    ''
  ).trim();
}

function assertLocalUrl(url) {
  if (!url) {
    throw new Error('TEST_REAL_DB=1 requires a local DATABASE_URL / POSTGRES_PRISMA_URL');
  }
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('database URL is not a valid URL');
  }
  if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') {
    throw new Error(`refusing non-postgres URL protocol ${parsed.protocol}`);
  }
  const host = parsed.hostname.toLowerCase();
  if (parsed.search) throw new Error('Local test URLs may not override connection settings.');
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(`refusing non-local database host: ${host}`);
  }
  // Never allow sslmode that implies a hosted provider tunnel as the target.
  if (/\.supabase\.co$/i.test(host) || /\.neon\.tech$/i.test(host) || /\.amazonaws\.com$/i.test(host)) {
    throw new Error(`refusing hosted database host: ${host}`);
  }
}

function sha(n, ch) {
  return ch.repeat(n);
}

function makeIdentity(runId) {
  return normalizeIdentity({
    repository: 'workforceap/workforceap-beta',
    workflowRunId: runId.slice(0, -2),
    workflowAttempt: 1,
    projectRef: PROJECT_REF,
    organizationId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    controlSha: sha(40, '1'),
    deployedSha: sha(40, '2'),
    baselineSha: sha(40, '3'),
    planHash: sha(64, '4'),
    runId,
  });
}

async function cleanup(prisma, runId) {
  const targetId = String(runId);
  await prisma.$executeRaw`
    DELETE FROM audit_logs
    WHERE target_type = ${'PortalQaRun'}
      AND target_id = ${targetId}
  `;
}

async function remaining(prisma, runId) {
  const targetId = String(runId);
  const rows = await prisma.$queryRaw`
    SELECT COUNT(*)::int AS count
    FROM audit_logs
    WHERE target_type = ${'PortalQaRun'}
      AND target_id = ${targetId}
  `;
  return rows[0]?.count ?? 0;
}

async function main() {
  if (process.env.TEST_REAL_DB !== '1') {
    console.log('skip demo-acceptance-journal.realdb (set TEST_REAL_DB=1 for local Postgres)');
    return;
  }

  const url = databaseUrl();
  assertLocalUrl(url);

  const prisma = new PrismaClient({ datasourceUrl: url });
  const runId = String(800_000_000 + randomInt(1, 99_999_999)) + '-1';
  const store = createPrismaJournalStore(prisma);
  const journal = createJournal(store);
  const id = makeIdentity(runId);

  let failed = null;
  try {
    // Competing claims under advisory lock + SERIALIZABLE.
    const claims = await Promise.allSettled([
      journal.claim(id, 'real-a'),
      journal.claim(id, 'real-b'),
    ]);
    const ok = claims.filter((c) => c.status === 'fulfilled');
    const bad = claims.filter((c) => c.status === 'rejected');
    if (ok.length !== 1 || bad.length !== 1) {
      throw new Error(`expected 1 claim win / 1 reject, got ${ok.length}/${bad.length}`);
    }
    const claimed = ok[0].value;
    if (claimed.revision !== 1 || claimed.events[0].id !== digest(`${runId}/1`)) {
      throw new Error('claim state malformed');
    }

    // CAS: stale revision must fail without inserting.
    const before = await remaining(prisma, runId);
    let casRejected = false;
    try {
      await journal.append(runId, claimed.owner, claimed.revision + 5, 'intent', { n: 1 });
    } catch (err) {
      casRejected = /stale revision/.test(String(err.message));
      if (!casRejected) throw err;
    }
    if (!casRejected) throw new Error('expected stale revision rejection');
    const afterCas = await remaining(prisma, runId);
    if (afterCas !== before) throw new Error('stale revision mutated rows');

    // Happy-path append + readback.
    const appended = await journal.append(runId, claimed.owner, claimed.revision, 'intent', {
      n: 1,
    });
    if (appended.revision !== 2) throw new Error('append revision mismatch');
    const read = await journal.read(runId);
    if (read.digest !== appended.digest) throw new Error('read digest mismatch');

    // Rollback path: force readback failure via a one-shot sabotaged store wrapper.
    const sabotaged = createPrismaJournalStore(prisma);
    const originalTx = sabotaged.transaction.bind(sabotaged);
    sabotaged.transaction = async (cb) =>
      originalTx(async (tx) => {
        const find = tx.find.bind(tx);
        let insertedId = null;
        const insert = tx.insert.bind(tx);
        tx.insert = async (event) => {
          await insert(event);
          insertedId = event.id;
        };
        tx.find = async (eventId) => {
          if (insertedId && eventId === insertedId) return null;
          return find(eventId);
        };
        return cb(tx);
      });
    const sabJournal = createJournal(sabotaged);
    const beforeSab = await remaining(prisma, runId);
    let readbackFailed = false;
    try {
      await sabJournal.append(runId, claimed.owner, appended.revision, 'confirmed', { ok: true });
    } catch (err) {
      readbackFailed = /readback failure/.test(String(err.message));
      if (!readbackFailed) throw err;
    }
    if (!readbackFailed) throw new Error('expected readback failure');
    const afterSab = await remaining(prisma, runId);
    // SERIALIZABLE transaction should roll back the insert when callback throws.
    if (afterSab !== beforeSab) {
      throw new Error('readback failure left committed rows (rollback broken)');
    }

    console.log(
      JSON.stringify({
        ok: true,
        runId,
        claimOwner: claimed.owner,
        revision: (await journal.read(runId)).revision,
        digestAlgo: createHash('sha256').update('x').digest('hex').length,
      }),
    );
  } catch (err) {
    failed = err;
  } finally {
    try {
      await cleanup(prisma, runId);
      const left = await remaining(prisma, runId);
      if (left !== 0) {
        failed = failed || new Error(`cleanup left ${left} audit_logs rows for runId=${runId}`);
      }
    } finally {
      await prisma.$disconnect();
    }
  }

  if (failed) {
    console.error(failed);
    process.exitCode = 1;
  }
}

main();
