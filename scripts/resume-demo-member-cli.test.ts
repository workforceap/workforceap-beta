/**
 * MOCKED/offline tests of the resume-demo-member CLI: temp marker/state/receipt
 * files only, no network, no database (every case stops before a client is
 * built). The refs are the public project refs from
 * scripts/lib/supabase-project-guard.cjs, written out so this file reads only
 * its own temp files.
 */
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { main } from './resume-demo-member';

const DEMO_REF = 'esbdrgaonplpvzmtrdhw';
const PROD_REF = 'jqddnyuszufndwwezdwp';
const NEW_ID = '22222222-2222-4222-8222-222222222222';

function cliFiles() {
  const dir = mkdtempSync(join(tmpdir(), 'resume-qa-cli-'));
  return {
    marker: join(dir, 'marker.json'),
    state: join(dir, 'state.json'),
    stage: join(dir, 'stage.json'),
    receipt: join(dir, 'out', 'cleanup.json'),
  };
}

/** As in run 36347160066: the DEMO Auth URL passes, the database URL does not. */
function envFor(files: ReturnType<typeof cliFiles>, databaseUrl = `postgresql://postgres:pw@db.${PROD_REF}.supabase.co:5432/postgres`) {
  return {
    NODE_ENV: 'test',
    PORTAL_QA_TARGET: 'demo',
    NEXT_PUBLIC_SUPABASE_URL: `https://${DEMO_REF}.supabase.co`,
    POSTGRES_PRISMA_URL: databaseUrl,
    SUPABASE_SERVICE_ROLE_KEY: 'unused',
    PORTAL_QA_ORGANIZATION_ID: 'qa-org',
    PORTAL_QA_ORGANIZATION_SLUG: 'portal-qa-test',
    GITHUB_ENV: join(files.state, '..', 'github-env'),
    GITHUB_RUN_ID: '1',
    GITHUB_RUN_ATTEMPT: '1',
    RESUME_QA_STATE_FILE: files.state,
    RESUME_QA_MARKER_FILE: files.marker,
    RESUME_QA_STAGE_FILE: files.stage,
    RESUME_QA_CLEANUP_OUTPUT: files.receipt,
  } as NodeJS.ProcessEnv;
}

const receiptOf = (files: ReturnType<typeof cliFiles>) => JSON.parse(readFileSync(files.receipt, 'utf8'));

test('[mock] create stopped at the target guard: cleanup writes an informational receipt without the database', async () => {
  const files = cliFiles();
  const env = envFor(files);
  const { calls, fetchImpl } = fakeFetch(200);
  await assert.rejects(main('create', env, { fetchImpl }), /database URL must identify the approved demo project/);
  assert.equal(existsSync(files.marker), false, 'no marker');
  assert.equal(existsSync(files.state), false, 'no state');
  assert.deepEqual(JSON.parse(readFileSync(files.stage, 'utf8')), { stage: 'target-guard' });

  assert.equal(calls.length, 0, 'no key probe before the target guard passes');
  // Same wrong-scope URL: cleanup decides from the files alone and never reads it.
  await main('cleanup', env);
  assert.deepEqual(receiptOf(files), {
    auditRowsRetained: true,
    success: true,
    memberCreated: false,
    markerFound: false,
    memberCreationAttempted: 'not-observed',
    informationalOnly: true,
    failedStage: 'target-guard',
  });
});

test('[mock] no marker once create was past the target guard: cleanup fails closed with recovery text', async () => {
  const files = cliFiles();
  writeFileSync(files.stage, JSON.stringify({ stage: 'clients', email: 'resume-qa-1-1@example.com' }));
  await assert.rejects(main('cleanup', envFor(files)), /exact email resume-qa-1-1@example\.com.*Never delete by pattern/);
  const receipt = receiptOf(files);
  assert.equal(receipt.success, false);
  assert.equal(receipt.memberCreated, 'unknown');
  assert.match(receipt.error, /Manual recovery/);
});

test('[mock] no marker and no stage file: cleanup fails closed rather than claim nothing was created', async () => {
  const files = cliFiles();
  await assert.rejects(main('cleanup', envFor(files)), /Refusing cleanup/);
  assert.equal(receiptOf(files).memberCreated, 'unknown');
});

test('[mock] a recorded member with a non-DEMO database URL: cleanup touches nothing and records the IDs', async () => {
  const files = cliFiles();
  const state = { userId: NEW_ID, email: 'resume-qa-1-1@example.com', organizationId: 'qa-org', runId: '1-1' };
  writeFileSync(files.marker, JSON.stringify({ runId: state.runId, email: state.email, organizationId: state.organizationId }));
  writeFileSync(files.state, JSON.stringify(state));
  await assert.rejects(main('cleanup', envFor(files)), /database URL must identify the approved demo project/);
  assert.deepEqual(receiptOf(files), {
    auditRowsRetained: true, success: false, memberCreated: true,
    userId: NEW_ID, email: state.email, runId: '1-1',
    error: 'Portal QA database URL must identify the approved demo project.',
  });
});

test('[static] the helper never parses a database URL itself; Prisma gets only the guard-approved URL', () => {
  // Reads this script's own sibling (scripts/**), not application source.
  const helper = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'resume-demo-member.ts'), 'utf8');
  assert.doesNotMatch(helper, /new URL\(|URL\.parse|pg-connection-string|parseConnectionString/);
  assert.doesNotMatch(helper, /env\.(POSTGRES_PRISMA_URL|DATABASE_URL|POSTGRES_URL_NON_POOLING)\b/);
  assert.equal([...helper.matchAll(/new PrismaClient\(/g)].length, 1);
  assert.match(helper, /new PrismaClient\(\{ datasourceUrl: target\.databaseUrl \}\)/);
  assert.match(helper, /import \{ assertPortalQaOrganization, readPortalQaTarget \} from '\.\/lib\/portal-qa-guard\.cjs';/);
});

/** A fetch stand-in that records calls and returns the given status with an unread body. */
function fakeFetch(status: number) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return { status, body: { cancel: async () => {} } } as unknown as Response;
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

const DEMO_DB = `postgres://postgres.${DEMO_REF}:pw@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1`;

test('[mock] create: a rejected DEMO service key stops before any marker or client; cleanup is informational', async () => {
  const files = cliFiles();
  const env = envFor(files, DEMO_DB);
  const { calls, fetchImpl } = fakeFetch(401);
  await assert.rejects(main('create', env, { fetchImpl }), /DEMO service key check did not pass \(urlProject demo, key rejected\); nothing was created/);
  assert.equal(calls.length, 1, 'exactly one probe');
  assert.equal(calls[0].url, `https://${DEMO_REF}.supabase.co/auth/v1/admin/users?page=1&per_page=1`);
  assert.equal(existsSync(files.marker), false, 'no marker');
  assert.equal(existsSync(files.state), false, 'no state');
  assert.deepEqual(JSON.parse(readFileSync(files.stage, 'utf8')), { stage: 'key-probe' });

  await main('cleanup', env, { fetchImpl });
  assert.equal(calls.length, 1, 'cleanup makes no probe');
  assert.deepEqual(receiptOf(files), {
    auditRowsRetained: true, success: true, memberCreated: false, markerFound: false,
    memberCreationAttempted: 'not-observed', informationalOnly: true, failedStage: 'key-probe',
  });
});

test('[mock] create makes zero Auth-create calls when the key probe is rejected or unavailable', async () => {
  // Any Supabase client call (createUser included) would go through the global
  // fetch; only the injected probe fetch may ever be called.
  const realFetch = globalThis.fetch;
  const otherRequests: string[] = [];
  globalThis.fetch = (async (input: unknown) => { otherRequests.push(String(input)); throw new Error('unexpected request'); }) as typeof fetch;
  try {
    const outcomes: Array<[string, () => ReturnType<typeof fakeFetch>]> = [
      ['rejected', () => fakeFetch(401)],
      ['rejected', () => fakeFetch(403)],
      ['unavailable', () => fakeFetch(500)],
      ['unavailable', () => fakeFetch(302)],
      ['unavailable', () => {
        const calls: Array<{ url: string; init: RequestInit }> = [];
        const fetchImpl = (async (url: string, init: RequestInit) => { calls.push({ url, init }); throw new TypeError('fetch failed'); }) as unknown as typeof fetch;
        return { calls, fetchImpl };
      }],
    ];
    for (const [label, make] of outcomes) {
      const files = cliFiles();
      const { calls, fetchImpl } = make();
      await assert.rejects(main('create', envFor(files, DEMO_DB), { fetchImpl }), new RegExp(`key ${label}\\); nothing was created`));
      assert.equal(calls.length, 1, 'exactly one probe, no retry');
      assert.equal(existsSync(files.marker), false, 'no pre-create marker');
      assert.equal(existsSync(files.state), false, 'no state');
      assert.deepEqual(JSON.parse(readFileSync(files.stage, 'utf8')), { stage: 'key-probe' }, 'never reached clients');
    }
    assert.deepEqual(otherRequests, [], 'no Auth (or any other) request');
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('[mock] create: a non-DEMO database URL stops at the target guard with zero network calls', async () => {
  const files = cliFiles();
  const { calls, fetchImpl } = fakeFetch(200);
  await assert.rejects(main('create', envFor(files), { fetchImpl }), /database URL must identify the approved demo project/);
  assert.equal(calls.length, 0);
  assert.deepEqual(JSON.parse(readFileSync(files.stage, 'utf8')), { stage: 'target-guard' });
});

