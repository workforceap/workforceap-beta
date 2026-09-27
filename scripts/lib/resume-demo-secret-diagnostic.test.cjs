const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { resolve } = require('node:path');
const { DEMO_REF, PROD_REF } = require('./supabase-project-guard.cjs');
const { inspectResumeDemoSecretUrl, classifyPreviewDbUrl } = require('./resume-demo-secret-diagnostic.cjs');

const sentinel = 'SYNTHETIC_SECRET_DO_NOT_ECHO';
const direct = (ref) => `postgresql://postgres:${sentinel}@db.${ref}.supabase.co:5432/postgres`;
const pooler = (username, query = '') =>
  `postgresql://${username}:${sentinel}@aws-0-us-east-1.pooler.supabase.com:6543/postgres${query}`;

test('classifies synthetic DEMO and production direct URLs without disclosing components', () => {
  for (const [ref, expected] of [[DEMO_REF, 'demo'], [PROD_REF, 'prod']]) {
    const result = inspectResumeDemoSecretUrl(direct(ref));
    assert.deepEqual(result, {
      present: true, parseOk: true, scheme: 'postgres', hostClass: 'approved-direct',
      userClass: 'postgres', referenceCount: 0, projectForUrl: expected,
    });
    assert.equal(JSON.stringify(result).includes(sentinel), false);
  }
});

test('classifies dotted and options-reference pooler forms using the existing strict guard', () => {
  const dotted = inspectResumeDemoSecretUrl(pooler(`postgres.${DEMO_REF}`));
  assert.deepEqual(dotted, {
    present: true, parseOk: true, scheme: 'postgres', hostClass: 'shared-pooler',
    userClass: 'dotted-demo', referenceCount: 0, projectForUrl: 'demo',
  });
  const referenced = inspectResumeDemoSecretUrl(
    pooler('postgres', `?options=reference%3D${DEMO_REF}&pgbouncer=true&connection_limit=1`),
  );
  assert.equal(referenced.projectForUrl, 'demo');
  assert.equal(referenced.referenceCount, 1);
  assert.deepEqual(
    classifyPreviewDbUrl('PREVIEW_POSTGRES_PRISMA_URL',
      pooler('postgres', `?options=reference%3D${DEMO_REF}&pgbouncer=true&connection_limit=1`)),
    { name: 'PREVIEW_POSTGRES_PRISMA_URL', classification: 'demo', hostClass: 'pooler',
      refPresent: true, pgbouncer: true, connectionLimit1: true },
  );
});

test('marks other dotted usernames, custom roles, and ambiguous references without approving them', () => {
  const other = inspectResumeDemoSecretUrl(pooler(`postgres.${PROD_REF}`));
  assert.equal(other.userClass, 'dotted-other');
  assert.equal(other.projectForUrl, 'prod');
  const role = inspectResumeDemoSecretUrl(pooler(`reporter.${DEMO_REF}`));
  assert.equal(role.userClass, 'custom-role');
  assert.equal(role.projectForUrl, 'unknown');
  const ambiguous = inspectResumeDemoSecretUrl(
    pooler(`postgres.${DEMO_REF}`, `?options=reference%3D${PROD_REF}`),
  );
  assert.equal(ambiguous.referenceCount, 1);
  assert.equal(ambiguous.projectForUrl, 'unknown');
  const duplicate = inspectResumeDemoSecretUrl(
    pooler('postgres', `?options=reference%3D${DEMO_REF}&options=reference%3D${DEMO_REF}`),
  );
  assert.equal(duplicate.referenceCount, 2);
  assert.equal(duplicate.projectForUrl, 'unknown');
});

test('treats missing, malformed, and wrong-scheme URLs as failures', () => {
  assert.deepEqual(inspectResumeDemoSecretUrl(undefined), {
    present: false, parseOk: false, scheme: 'other', hostClass: 'other',
    userClass: 'other', referenceCount: 0, projectForUrl: 'unset',
  });
  const malformed = inspectResumeDemoSecretUrl(`not-a-url-${sentinel}`);
  assert.equal(malformed.present, true);
  assert.equal(malformed.parseOk, false);
  assert.equal(malformed.projectForUrl, 'unknown');
  const http = classifyPreviewDbUrl('PREVIEW_POSTGRES_PRISMA_URL',
    `https://postgres:${sentinel}@db.${DEMO_REF}.supabase.co/postgres`);
  assert.equal(http.classification, 'unknown');
  assert.equal(JSON.stringify(http).includes(sentinel), false);
});

test('CLI prints one fixed redacted JSON line per name and fails if any URL is not DEMO', () => {
  const script = resolve(__dirname, '../classify-preview-db-url.mjs');
  const run = spawnSync(process.execPath,
    [script, 'PREVIEW_POSTGRES_PRISMA_URL', 'PREVIEW_DATABASE_URL'], {
      env: { PREVIEW_POSTGRES_PRISMA_URL: direct(DEMO_REF), PREVIEW_DATABASE_URL: direct(PROD_REF) },
      encoding: 'utf8',
    });
  assert.equal(run.status, 1);
  const lines = run.stdout.trim().split('\n').map((line) => JSON.parse(line));
  assert.equal(lines.length, 2);
  assert.equal(lines[0].classification, 'demo');
  assert.equal(lines[1].classification, 'prod');
  for (const line of lines) {
    assert.deepEqual(Object.keys(line),
      ['name', 'classification', 'hostClass', 'refPresent', 'pgbouncer', 'connectionLimit1']);
  }
  assert.equal((run.stdout + run.stderr).includes(sentinel), false);
  assert.equal((run.stdout + run.stderr).includes(DEMO_REF), false);
  assert.equal((run.stdout + run.stderr).includes(PROD_REF), false);
});

test('CLI passes only when every named URL is strictly DEMO', () => {
  const script = resolve(__dirname, '../classify-preview-db-url.mjs');
  const run = spawnSync(process.execPath,
    [script, 'PREVIEW_POSTGRES_PRISMA_URL', 'PREVIEW_DATABASE_URL'], {
      env: { PREVIEW_POSTGRES_PRISMA_URL: direct(DEMO_REF), PREVIEW_DATABASE_URL: pooler(`postgres.${DEMO_REF}`) },
      encoding: 'utf8',
    });
  assert.equal(run.status, 0);
  assert.equal(run.stdout.trim().split('\n').length, 2);
  assert.equal(run.stderr, '');
});

test('CLI fails closed on missing, malformed, non-Postgres, and invalid names', () => {
  const script = resolve(__dirname, '../classify-preview-db-url.mjs');
  for (const [args, env] of [
    [['PREVIEW_DATABASE_URL'], {}],
    [['PREVIEW_DATABASE_URL'], { PREVIEW_DATABASE_URL: `invalid-${sentinel}` }],
    [['PREVIEW_DATABASE_URL'], { PREVIEW_DATABASE_URL: `https://postgres:${sentinel}@db.${DEMO_REF}.supabase.co/postgres` }],
    [[`PREVIEW_DATABASE_URL=${sentinel}`], {}],
  ]) {
    const run = spawnSync(process.execPath, [script, ...args], { env, encoding: 'utf8' });
    assert.equal(run.status, 1);
    const lines = run.stdout.trim().split('\n').map((line) => JSON.parse(line));
    assert.equal(lines.length, 1);
    assert.equal(lines[0].classification, 'unknown');
    assert.equal((run.stdout + run.stderr).includes(sentinel), false);
  }
});

test('CLI requires exactly both allowlisted names and cannot probe another environment variable', () => {
  const script = resolve(__dirname, '../classify-preview-db-url.mjs');
  const env = {
    PREVIEW_POSTGRES_PRISMA_URL: direct(DEMO_REF),
    PREVIEW_DATABASE_URL: direct(DEMO_REF),
    OTHER_SECRET_URL: direct(DEMO_REF),
  };
  for (const args of [
    ['PREVIEW_POSTGRES_PRISMA_URL'],
    ['PREVIEW_POSTGRES_PRISMA_URL', 'PREVIEW_POSTGRES_PRISMA_URL'],
    ['PREVIEW_POSTGRES_PRISMA_URL', 'OTHER_SECRET_URL'],
  ]) {
    const run = spawnSync(process.execPath, [script, ...args], { env, encoding: 'utf8' });
    assert.equal(run.status, 1);
    assert.equal((run.stdout + run.stderr).includes(sentinel), false);
    assert.equal(run.stdout.includes('OTHER_SECRET_URL'), false);
  }
});
