/**
 * MOCKED — NOT ACCEPTANCE. Offline checks of
 * .github/workflows/five-role-demo-acceptance.yml; no workflow runs. The
 * policy step's own shell script is executed locally with fake GitHub context
 * values, so a non-master, non-dispatch or re-run attempt is proven to fail.
 * The repo has no YAML dependency, so jobs and steps are read by indentation.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const text = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '.github', 'workflows', 'five-role-demo-acceptance.yml'), 'utf8');

function blocks(body: string, indent: number, marker: RegExp) {
  const lines = body.split('\n');
  const out: Array<{ head: string; body: string }> = [];
  let current: { head: string; lines: string[] } | null = null;
  for (const line of lines) {
    const match = line.match(marker);
    if (match && line.startsWith(' '.repeat(indent)) && !line.startsWith(' '.repeat(indent + 1))) {
      if (current) out.push({ head: current.head, body: current.lines.join('\n') });
      current = { head: match[1], lines: [line] };
    } else if (current) {
      if (/^\S/.test(line)) break;
      current.lines.push(line);
    }
  }
  if (current) out.push({ head: current.head, body: current.lines.join('\n') });
  return out;
}

const jobsText = text.slice(text.indexOf('\njobs:\n'));
const jobs = new Map(blocks(jobsText, 2, /^ {2}([A-Za-z0-9_-]+):\s*$/).map((job) => [job.head, job.body]));
const needs = (job: string) => {
  const line = jobs.get(job)?.match(/^ {4}needs:\s*(.+)$/m)?.[1]?.trim() ?? '';
  return line.startsWith('[') ? line.slice(1, -1).split(',').map((v) => v.trim()) : line ? [line] : [];
};
const steps = blocks(jobs.get('acceptance') ?? '', 6, /^ {6}- name:\s*(.+)$/);
const step = (name: RegExp) => {
  const found = steps.find((s) => name.test(s.head));
  assert.ok(found, `step ${name} exists`);
  return found;
};
const index = (name: RegExp) => steps.findIndex((s) => name.test(s.head));

function policyScript() {
  const body = jobs.get('policy')!;
  const start = body.indexOf('        run: |\n');
  assert.notEqual(start, -1, 'the policy step has a run block');
  return body.slice(start + '        run: |\n'.length).split('\n')
    .filter((line) => line.startsWith('          ') || line.trim() === '')
    .map((line) => line.slice(10)).join('\n');
}

test('[mocked — NOT acceptance] triggers: manual dispatch only, no schedule, push or pull_request', () => {
  const on = text.slice(text.indexOf('\non:\n'), text.indexOf('\npermissions:'));
  assert.match(on, /workflow_dispatch:/);
  assert.doesNotMatch(on, /schedule|pull_request|push:|workflow_run/);
});

test('[mocked — NOT acceptance] the ungated policy job refuses non-master, non-dispatch, foreign-repository and re-run attempts', () => {
  const policy = jobs.get('policy')!;
  assert.doesNotMatch(policy, /^ {4}if:/m, 'the policy job always runs');
  assert.deepEqual(needs('policy'), []);
  assert.doesNotMatch(policy, /secrets\./);
  assert.match(policy, /^ {4}permissions: \{\}$/m);
  const script = policyScript();
  const run = (ctx: Record<string, string>) => spawnSync('bash', ['-c', script], { env: { NODE_ENV: 'test', PATH: process.env.PATH ?? '', ...ctx }, encoding: 'utf8' });
  const ok = { RUN_REPOSITORY: 'workforceap/workforceap-beta', RUN_REF: 'refs/heads/master', RUN_EVENT: 'workflow_dispatch', RUN_ATTEMPT: '1' };
  assert.equal(run(ok).status, 0);
  for (const bad of [
    { RUN_REF: 'refs/heads/hold/wap6-five-role-action-harness' },
    { RUN_REF: 'refs/pull/1/merge' },
    { RUN_EVENT: 'push' },
    { RUN_EVENT: 'schedule' },
    { RUN_REPOSITORY: 'someone/fork' },
    { RUN_ATTEMPT: '2' },
  ]) {
    const result = run({ ...ok, ...bad });
    assert.equal(result.status, 1, JSON.stringify(bad));
    assert.match(result.stdout, /::error::/);
  }
});

test('[mocked — NOT acceptance] every other job depends on policy, and the writing job uses the protected demo-qa environment', () => {
  for (const job of jobs.keys()) if (job !== 'policy') assert.ok(needs(job).includes('policy'), `${job} needs policy`);
  assert.match(jobs.get('acceptance')!, /^ {4}environment: demo-qa$/m);
  assert.match(text, /^ {2}group: five-role-demo-acceptance\n {2}cancel-in-progress: false$/m);
});

test('[mocked — NOT acceptance] no PREVIEW_* database URL, service key or shared E2E account is read; the target is behind gates 0 and 1', () => {
  assert.doesNotMatch(text, /PREVIEW_(POSTGRES|DATABASE|SUPABASE|E2E|PORTAL)/);
  assert.doesNotMatch(text, /secrets\.(?!DEMO_QA_|PREVIEW_SITE_URL\b)/, 'only DEMO_QA_* and PREVIEW_SITE_URL secrets');
  for (const use of text.match(/secrets\.PREVIEW_SITE_URL[^\n]*/g) ?? []) {
    assert.match(use, /^secrets\.PREVIEW_SITE_URL \}\}$/, 'PREVIEW_SITE_URL only as the fallback of DEMO_QA_SITE_URL');
  }
  assert.equal((text.match(/secrets\.DEMO_QA_SITE_URL \|\| secrets\.PREVIEW_SITE_URL/g) ?? []).length, (text.match(/PREVIEW_SITE_URL/g) ?? []).length - 1 /* header comment */);
  const gate0 = index(/Refuse a production target/);
  const gate1 = index(/Verify target SHA and DEMO Supabase scope/);
  const create = index(/Create the five disposable synthetic users/);
  assert.ok(gate0 >= 0 && gate0 < gate1 && gate1 < create, 'gates 0 and 1 run before create');
  for (const s of steps.slice(0, create)) assert.doesNotMatch(s.body, /DEMO_QA_(SUPABASE|POSTGRES)/, `${s.head} reads no DEMO credential`);
  assert.match(step(/Verify target SHA/).body, /PORTAL_AUDIT_TRUSTED_SHA: \$\{\{ github\.sha \}\}/);
  assert.match(step(/Verify target SHA/).body, /PORTAL_AUDIT_MODE: isolated_preview/);
});

test('[mocked — NOT acceptance] writing steps read only DEMO_QA_* credentials and the portal-qa guard target', () => {
  for (const name of [/Create the five/, /Read the written rows back/, /Clean up the five/]) {
    const body = step(name).body;
    assert.match(body, /PORTAL_QA_TARGET: demo/);
    assert.match(body, /NEXT_PUBLIC_SUPABASE_URL: \$\{\{ secrets\.DEMO_QA_SUPABASE_URL \}\}/);
    assert.match(body, /SUPABASE_SERVICE_ROLE_KEY: \$\{\{ secrets\.DEMO_QA_SUPABASE_SERVICE_ROLE_KEY \}\}/);
    assert.match(body, /POSTGRES_PRISMA_URL: \$\{\{ secrets\.DEMO_QA_POSTGRES_PRISMA_URL \}\}/);
    assert.doesNotMatch(body, /DATABASE_URL|POSTGRES_URL_NON_POOLING/);
  }
});

test('[mocked — NOT acceptance] one attempt: no retries, cleanup and the combined verifier always run, every receipt is required', () => {
  const spec = step(/Run the five-role acceptance spec/).body;
  assert.match(spec, /--retries=0/);
  assert.match(spec, /FIVE_ROLE_ACCEPTANCE_MODE: workflow/);
  assert.doesNotMatch(text, /continue-on-error|retry|max-attempts/i);
  assert.match(step(/Clean up the five/).body, /if: always\(\) && steps\.create\.outcome != 'skipped'/);
  assert.match(step(/Read the written rows back/).body, /if: always\(\) && steps\.create\.outcome == 'success'/);
  assert.match(step(/Verify the acceptance, readback and cleanup receipts/).body, /if: always\(\)\n\s+run: node scripts\/verify-five-role-acceptance\.mjs/);
  assert.ok(index(/Clean up the five/) > index(/Run the five-role acceptance spec/));
  assert.ok(index(/Verify the acceptance/) > index(/Clean up the five/));
  for (const receipt of ['acceptance', 'readback', 'cleanup']) {
    const upload = step(new RegExp(`Upload the ${receipt} receipt`)).body;
    assert.match(upload, /if: always\(\)/);
    assert.match(upload, new RegExp(`path: test-results/five-role-demo-${receipt}\\.json`));
    assert.match(upload, /if-no-files-found: error/);
  }
});

test('[mocked — NOT acceptance] the SHA/DEMO gate is re-run right before the writes, create has a step timeout, and fixture IDs are uploaded', () => {
  const recheck = index(/Re-verify target SHA and DEMO Supabase scope before the writes/);
  assert.ok(index(/Create the five/) < recheck && recheck === index(/Run the five-role acceptance spec/) - 1,
    'the re-check is the step immediately before the spec');
  const body = steps[recheck].body;
  assert.match(body, /run: node scripts\/portal-audit-health-gate\.mjs/);
  assert.match(body, /PORTAL_AUDIT_TRUSTED_SHA: \$\{\{ github\.sha \}\}/);
  assert.match(body, /PORTAL_AUDIT_MODE: isolated_preview/);
  assert.match(step(/Create the five/).body, /^ {8}timeout-minutes: 10$/m);
  const upload = step(/Upload the fixture state, marker and stage files/).body;
  assert.match(upload, /if: always\(\)/);
  for (const file of ['five-role-qa-fixture.json', 'five-role-qa-fixture.marker.json', 'five-role-qa-fixture.stage.json']) {
    assert.match(upload, new RegExp(`/tmp/${file.replace(/\./g, '\\.')}`));
  }
});
