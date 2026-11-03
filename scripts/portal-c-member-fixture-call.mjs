#!/usr/bin/env node
/**
 * Ask the preview deployment to adjust the DEMO test member.
 * Uses a GitHub Actions OIDC token. Does not read database URLs.
 */
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const FIXTURE_AUDIENCE = 'workforceap-portal-c-fixture';

function snapshotPath(env = process.env) {
  const runId = env.GITHUB_RUN_ID ?? 'local';
  return env.PORTAL_C_E2E_FIXTURE_SNAPSHOT ?? `/tmp/portal-c-e2e-member-fixture-${runId}.json`;
}

function originOf(value) {
  const origin = (value ?? '').trim().replace(/\/$/, '');
  if (!origin.startsWith('https://')) {
    throw new Error('PLAYWRIGHT_BASE_URL must be the https preview origin.');
  }
  return origin;
}

export async function requestOidcToken(env = process.env, fetchImpl = fetch) {
  const requestUrl = env.ACTIONS_ID_TOKEN_REQUEST_URL ?? '';
  const requestToken = env.ACTIONS_ID_TOKEN_REQUEST_TOKEN ?? '';
  if (!requestUrl || !requestToken) {
    throw new Error('GitHub OIDC is unavailable. The job needs id-token: write.');
  }
  const url = new URL(requestUrl);
  url.searchParams.set('audience', FIXTURE_AUDIENCE);
  const response = await fetchImpl(url, {
    headers: { Authorization: `bearer ${requestToken}` },
  });
  if (!response.ok) {
    throw new Error(`OIDC token request failed (${response.status}).`);
  }
  const body = await response.json();
  if (!body || typeof body.value !== 'string' || !body.value) {
    throw new Error('OIDC token response had no value.');
  }
  return body.value.trim();
}

export function fixtureError(status, body) {
  const code = body && typeof body.error === 'string' ? body.error : 'request_failed';
  const detail = body && typeof body.detail === 'string' ? ` ${body.detail}` : '';
  return `fixture ${code} (HTTP ${status}).${detail}`.slice(0, 400);
}

async function callFixture(action, snapshot) {
  const base = originOf(process.env.PLAYWRIGHT_BASE_URL);
  const token = await requestOidcToken();
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
  const bypass = (process.env.VERCEL_AUTOMATION_BYPASS_SECRET ?? '').trim();
  if (bypass) headers['x-vercel-protection-bypass'] = bypass;
  const response = await fetch(`${base}/api/internal/portal-c-member-fixture`, {
    method: 'POST',
    headers,
    body: JSON.stringify(snapshot ? { action, snapshot } : { action }),
    redirect: 'error',
    signal: AbortSignal.timeout(30_000),
  });
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (!response.ok) {
    throw new Error(fixtureError(response.status, body));
  }
  return body;
}

export async function ensureIncomplete() {
  const original = await callFixture('snapshot');
  if (!original?.snapshot?.userId) throw new Error('Fixture baseline returned no original snapshot.');
  writeFileSync(snapshotPath(), `${JSON.stringify(original.snapshot)}\n`, { mode: 0o600, flag: 'wx' });
  const body = await callFixture('ensure-incomplete');
  console.log(
    `[portal-c-fixture] preassessment baseline ${body?.changed ? 'reset to incomplete' : 'already incomplete'}.`,
  );
}

export async function prepare() {
  if (!existsSync(snapshotPath())) {
    const original = await callFixture('snapshot');
    if (!original?.snapshot?.userId) throw new Error('Fixture baseline returned no original snapshot.');
    writeFileSync(snapshotPath(), `${JSON.stringify(original.snapshot)}\n`, { mode: 0o600, flag: 'wx' });
  }
  const body = await callFixture('prepare');
  if (!body?.snapshot?.userId) {
    throw new Error('fixture prepare returned no snapshot.');
  }
  console.log(
    `[portal-c-fixture] prepared (${body.snapshot.applied ? 'temporarily ungated' : 'already complete'}).`,
  );
}

export async function prepareMentor() {
  const original = JSON.parse(readFileSync(snapshotPath(), 'utf8'));
  if (!original?.userId || !Object.hasOwn(original.before ?? {}, 'mentorId')) throw new Error('Original mentor state must be captured before mentor fixture preparation.');
  await callFixture('prepare-mentor');
  console.log('[portal-c-fixture] synthetic mentor workspace prepared; original snapshot retained.');
}

export async function restore() {
  const path = snapshotPath();
  let snapshot;
  try {
    snapshot = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    console.log('[portal-c-fixture] restore skipped — prepare did not write a snapshot.');
    return;
  }
  await callFixture('restore', snapshot);
  try {
    unlinkSync(path);
  } catch {
    /* ignore */
  }
  console.log('[portal-c-fixture] restored original preassessment state.');
}

const isDirectRun =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  const command = process.argv[2];
  if (command === 'ensure-incomplete') {
    await ensureIncomplete().catch((error) => {
      console.error(`[portal-c-fixture] ${error instanceof Error ? error.message : 'ensure-incomplete failed'}`);
      process.exitCode = 1;
    });
  } else if (command === 'prepare') {
    await prepare().catch((error) => {
      console.error(`[portal-c-fixture] ${error instanceof Error ? error.message : 'prepare failed'}`);
      process.exitCode = 1;
    });
  } else if (command === 'prepare-mentor') {
    await prepareMentor().catch((error) => {
      console.error(`[portal-c-fixture] ${error instanceof Error ? error.message : 'mentor preparation failed'}`);
      process.exitCode = 1;
    });
  } else if (command === 'restore') {
    await restore().catch((error) => {
      console.error(`[portal-c-fixture] ${error instanceof Error ? error.message : 'restore failed'}`);
      process.exitCode = 1;
    });
  } else {
    console.error('Usage: node scripts/portal-c-member-fixture-call.mjs ensure-incomplete|prepare|prepare-mentor|restore');
    process.exitCode = 2;
  }
}
