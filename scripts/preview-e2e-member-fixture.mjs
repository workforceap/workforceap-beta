#!/usr/bin/env node
/**
 * CLI for signed-in Preview fixture prepare/restore. Never logs credentials.
 */
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { validateDemoFixtureDatabase } from './lib/demo-fixture-database.mjs';
import {
  ensureIncompleteBaseline,
  prepareMemberForSignedInRoutes,
  restoreMemberSnapshot,
  verifyRestored,
} from './lib/preview-e2e-member-fixture.cjs';

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
  const snapshot = await withPrisma(async (prisma) => prepareMemberForSignedInRoutes(prisma));
  writeFileSync(path, `${JSON.stringify(snapshot)}\n`, { mode: 0o600 });
  console.log(
    `[preview-e2e-member-fixture] prepared (${snapshot.applied ? 'temporarily ungated' : 'already complete'}).`,
  );
}

async function restore() {
  const path = snapshotPath();
  let snapshot;
  try {
    snapshot = loadSnapshot(path);
  } catch {
    console.error('[preview-e2e-member-fixture] restore skipped — no snapshot file.');
    process.exitCode = 1;
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
  const result = await withPrisma(async (prisma) => ensureIncompleteBaseline(prisma));
  console.log(
    `[preview-e2e-member-fixture] preassessment baseline ${result.changed ? 'reset to incomplete' : 'already incomplete'}.`,
  );
}

const command = process.argv[2];
if (command === 'ensure-incomplete') {
  await ensureIncomplete().catch(() => {
    console.error('[preview-e2e-member-fixture] ensure-incomplete failed.');
    process.exitCode = 1;
  });
} else if (command === 'prepare') {
  await prepare().catch(() => {
    console.error('[preview-e2e-member-fixture] prepare failed.');
    process.exitCode = 1;
  });
} else if (command === 'restore') {
  await restore().catch(() => {
    console.error('[preview-e2e-member-fixture] restore failed.');
    process.exitCode = 1;
  });
} else {
  console.error(
    'Usage: node scripts/preview-e2e-member-fixture.mjs ensure-incomplete|prepare|restore',
  );
  process.exitCode = 2;
}
