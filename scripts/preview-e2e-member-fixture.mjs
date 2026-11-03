#!/usr/bin/env node
/**
 * CLI for signed-in Preview fixture prepare/restore. Never logs credentials.
 */
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { validateDemoFixtureDatabase } from './lib/demo-fixture-database.mjs';
import {
  snapshotMember,
  ensureIncompleteBaseline,
  prepareMemberForSignedInRoutes,
  restoreMemberSnapshot,
  verifyRestored,
} from './lib/preview-e2e-member-fixture.cjs';

function publicError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/postgres(?:ql)?:\/\/\S+/gi, 'postgresql://***').slice(0, 500);
}

function snapshotPath(env = process.env) {
  const runId = env.GITHUB_RUN_ID ?? 'local';
  return env.PORTAL_C_E2E_FIXTURE_SNAPSHOT ?? `/tmp/portal-c-e2e-member-fixture-${runId}.json`;
}

function loadSnapshot(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

async function withPrisma(fn) {
  const { directDatabaseUrl } = validateDemoFixtureDatabase(process.env);
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient({ datasources: { db: { url: directDatabaseUrl } } });
  try {
    return await fn(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

async function prepare() {
  const path = snapshotPath();
  if (!existsSync(path)) {
    const original = await withPrisma(snapshotMember);
    writeFileSync(path, `${JSON.stringify(original)}\n`, { mode: 0o600, flag: 'wx' });
  }
  const snapshot = await withPrisma(prepareMemberForSignedInRoutes);
  console.log(
    `[preview-e2e-member-fixture] prepared (${snapshot.applied ? 'temporarily ungated' : 'already complete'}).`,
  );
}

async function restore() {
  const path = snapshotPath();
  let snapshot;
  try {
    snapshot = loadSnapshot(path);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    console.log(
      '[preview-e2e-member-fixture] restore skipped — prepare did not write a snapshot.',
    );
    return;
  }
  await withPrisma(async (prisma) => {
    await restoreMemberSnapshot(prisma, snapshot);
    await verifyRestored(prisma, snapshot);
  });
  try {
    unlinkSync(path);
  } catch {
    /* ignore */
  }
  console.log('[preview-e2e-member-fixture] restored original preassessment state.');
}

async function ensureIncomplete() {
  const original = await withPrisma(snapshotMember);
  writeFileSync(snapshotPath(), `${JSON.stringify(original)}\n`, { mode: 0o600, flag: 'wx' });
  const result = await withPrisma(async (prisma) => ensureIncompleteBaseline(prisma));
  console.log(
    `[preview-e2e-member-fixture] preassessment baseline ${result.changed ? 'reset to incomplete' : 'already incomplete'}.`,
  );
}

const command = process.argv[2];
if (command === 'ensure-incomplete') {
  await ensureIncomplete().catch((error) => {
    console.error(`[preview-e2e-member-fixture] ensure-incomplete failed: ${publicError(error)}`);
    process.exitCode = 1;
  });
} else if (command === 'prepare') {
  await prepare().catch((error) => {
    console.error(`[preview-e2e-member-fixture] prepare failed: ${publicError(error)}`);
    process.exitCode = 1;
  });
} else if (command === 'restore') {
  await restore().catch((error) => {
    console.error(`[preview-e2e-member-fixture] restore failed: ${publicError(error)}`);
    process.exitCode = 1;
  });
} else {
  console.error(
    'Usage: node scripts/preview-e2e-member-fixture.mjs ensure-incomplete|prepare|restore',
  );
  process.exitCode = 2;
}
