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
  await assert.rejects(main('create', env), /database URL must identify the approved demo project/);
  assert.equal(existsSync(files.marker), false, 'no marker');
  assert.equal(existsSync(files.state), false, 'no state');
  assert.deepEqual(JSON.parse(readFileSync(files.stage, 'utf8')), { stage: 'target-guard' });

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

