/**
 * Static checks of .github/workflows/resume-demo-acceptance.yml (offline; no
 * workflow runs). The repo has no YAML dependency, so this reads the job
 * blocks by indentation, which the workflow's two-space layout keeps simple.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const WORKFLOWS = ['resume-demo-acceptance.yml', 'preview-db-secret-check.yml', 'preview-service-key-check.yml'];
const workflowPath = (file: string) => join(dirname(fileURLToPath(import.meta.url)), '..', '.github', 'workflows', file);

interface Job { name: string; body: string; hasIf: boolean; needs: string[] }

function parseJobs(text: string): Map<string, Job> {
  const lines = text.split('\n');
  const start = lines.findIndex((line) => line === 'jobs:');
  assert.notEqual(start, -1, 'workflow has a top-level jobs: block');
  const jobs = new Map<string, Job>();
  let current: { name: string; lines: string[] } | null = null;
  const flush = () => {
    if (!current) return;
    const body = current.lines.join('\n');
    const needsLine = body.match(/^ {4}needs:\s*(.+)$/m)?.[1]?.trim() ?? '';
    const needs = needsLine.startsWith('[')
      ? needsLine.slice(1, -1).split(',').map((value) => value.trim()).filter(Boolean)
      : needsLine ? [needsLine] : [];
    jobs.set(current.name, { name: current.name, body, hasIf: /^ {4}if:/m.test(body), needs });
  };
  for (const line of lines.slice(start + 1)) {
    if (/^\S/.test(line)) break; // next top-level key
    const job = line.match(/^ {2}([A-Za-z0-9_-]+):\s*$/);
    if (job) {
      flush();
      current = { name: job[1], lines: [] };
    } else if (current) {
      current.lines.push(line);
    }
  }
  flush();
  return jobs;
}

function dependsOn(jobs: Map<string, Job>, name: string, target: string, seen = new Set<string>()): boolean {
  const job = jobs.get(name);
  if (!job || seen.has(name)) return false;
  seen.add(name);
  return job.needs.includes(target) || job.needs.some((need) => dependsOn(jobs, need, target, seen));
}

for (const file of WORKFLOWS) {
const text = readFileSync(workflowPath(file), 'utf8');
const jobs = parseJobs(text);

test(`[static] ${file}: an ungated policy job refuses anything but a master dispatch in the trusted repository`, () => {
  const policy = jobs.get('policy');
  assert.ok(policy, 'a policy job exists');
  assert.equal(policy.hasIf, false, 'the policy job has no if: so it always runs');
  assert.deepEqual(policy.needs, [], 'the policy job depends on nothing');
  assert.doesNotMatch(policy.body, /secrets\./, 'the policy job reads no secrets');
  assert.match(policy.body, /^ {4}permissions: \{\}$/m, 'the policy job has no token permissions');
  assert.match(policy.body, /\$\{\{ github\.repository \}\}/);
  assert.match(policy.body, /\$\{\{ github\.ref \}\}/);
  assert.match(policy.body, /\$\{\{ github\.event_name \}\}/);
  assert.match(policy.body, /"\$RUN_REPOSITORY" != "workforceap\/workforceap-beta"/);
  assert.match(policy.body, /"\$RUN_REF" != "refs\/heads\/master"/);
  assert.match(policy.body, /"\$RUN_EVENT" != "workflow_dispatch"/);
  assert.match(policy.body, /exit 1/);
});

test(`[static] ${file}: mirror needs policy, and every job that references secrets depends on policy`, () => {
  if (jobs.has('mirror')) assert.ok(jobs.get('mirror')?.needs.includes('policy'), 'mirror needs policy');
  const withSecrets = [...jobs.values()].filter((job) => /secrets\./.test(job.body));
  assert.ok(withSecrets.length > 0, 'at least one job uses secrets');
  for (const job of jobs.values()) {
    if (job.name === 'policy') continue;
    assert.ok(dependsOn(jobs, job.name, 'policy'), `${job.name} depends on policy`);
  }
});

test(`[static] ${file}: the workflow has only a workflow_dispatch trigger`, () => {
  const on = text.match(/^on:\n((?: {2}.*\n|\s*\n)+)/m)?.[1] ?? '';
  const triggers = [...on.matchAll(/^ {2}([a-z_]+):/gm)].map((match) => match[1]);
  assert.deepEqual(triggers, ['workflow_dispatch']);
  assert.doesNotMatch(text, /pull_request_target/);
});

const PARSE_ONLY: Record<string, { job: string; command: string; secrets: string[]; banned: RegExp }> = {
  'preview-db-secret-check.yml': {
    job: 'classify',
    command: 'node scripts/classify-preview-db-url.mjs PREVIEW_POSTGRES_PRISMA_URL PREVIEW_DATABASE_URL',
    secrets: ['PREVIEW_POSTGRES_PRISMA_URL', 'PREVIEW_DATABASE_URL'],
    banned: /pnpm install|npm (ci|install)|prisma|psql|curl|wget|GROQ|ANTHROPIC|SERVICE_ROLE|set -x/,
  },
  'preview-service-key-check.yml': {
    job: 'probe',
    command: 'node scripts/check-preview-service-key.mjs PREVIEW_SUPABASE_URL PREVIEW_SUPABASE_SERVICE_ROLE_KEY',
    secrets: ['PREVIEW_SUPABASE_URL', 'PREVIEW_SUPABASE_SERVICE_ROLE_KEY'],
    banned: /pnpm install|npm (ci|install)|prisma|psql|curl|wget|GROQ|ANTHROPIC|POSTGRES|DATABASE_URL|set -x/,
  },
};
const spec = PARSE_ONLY[file];
if (spec) {
  test(`[static] ${file}: one step-scoped call; nothing installs, connects elsewhere or echoes`, () => {
    assert.deepEqual([...jobs.keys()], ['policy', spec.job]);
    const job = jobs.get(spec.job)!.body;
    const script = spec.command.split(' ')[1];
    assert.equal(text.split(`node ${script}`).length - 1, 1, 'the script runs once');
    assert.ok(job.split('\n').includes(`        run: ${spec.command}`), 'exact command');
    // The secrets are step-level env of that one step: no workflow- or job-level env block.
    assert.doesNotMatch(text, /^env:/m, 'no workflow-level env');
    assert.doesNotMatch(job, /^ {4}env:/m, 'no job-level env');
    const steps = job.split(/^ {6}- /m).slice(1);
    const withSecrets = steps.filter((step) => /secrets\./.test(step));
    assert.equal(withSecrets.length, 1, 'only one step sees any secret');
    const [step] = withSecrets;
    assert.ok(step.includes(`run: ${spec.command}`), 'that step is the script call');
    assert.equal([...step.matchAll(/secrets\./g)].length, spec.secrets.length, 'no other secret');
    for (const name of spec.secrets) {
      assert.match(step, new RegExp(`^ {10}${name}: \\$\\{\\{ secrets\\.${name} \\}\\}$`, 'm'), `${name} is step env`);
    }
    // No run script interpolates a secret, echoes or expands either variable.
    const runLines = [...text.matchAll(/^ +run: (.*)$/gm)].map((match) => match[1]);
    const runBlocks = [...text.matchAll(/^( +)run: \|\n((?:\1 {2}.*\n?)+)/gm)].map((match) => match[2]);
    for (const script of [...runLines, ...runBlocks]) {
      assert.doesNotMatch(script, /secrets\./, 'no run script interpolates a secret');
      for (const name of spec.secrets) {
        assert.doesNotMatch(script, new RegExp(`\\$\\{?${name}`), `no run script expands ${name}`);
        assert.doesNotMatch(script, new RegExp(`(echo|printf|cat|printenv|env)\\b[^\\n]*${name}`), `no step echoes ${name}`);
      }
    }
    // Checked on the steps (comments may name things the steps must not do).
    const stepsText = text.split('\n').filter((line) => !/^\s*#/.test(line)).join('\n');
    assert.doesNotMatch(stepsText, spec.banned);
  });
}
}
