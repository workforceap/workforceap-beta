import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { classifyChanges, hasBuildBoundaryChange, parseChanges, planCi, PLAN_VERSION } from './ci-plan.mjs';
import { evaluateGate } from './ci-gate-result.mjs';

const a = 'a'.repeat(40);
const b = 'b'.repeat(40);
const c = 'c'.repeat(40);
const leaf = 'components/employer/EmployerJobsBoard.tsx';
const change = (file = leaf, status = 'M', oldMode = '100644', newMode = '100644') => ({ path: file, status, oldMode, newMode });
const event = (ref = 'feature/portal-delivery') => ({ pull_request: { base: { ref, sha: a }, head: { sha: b } } });
const raw = (file = leaf) => `:100644 100644 ${a} ${b} M\0${file}\0`;
const fakeGit = (...args: string[]) => args[0] === 'merge-base' ? c : args.includes('--raw') ? raw() : '+  return <div>New copy</div>;';

test('only explicit feature child PRs can use the affected plan', () => {
  const child = planCi({ eventName: 'pull_request', event: event(), git: fakeGit });
  assert.equal(child.mode, 'affected');
  assert.equal(child.checkName, 'Feature child checks');
  for (const eventName of ['push', 'merge_group', 'workflow_dispatch', undefined]) {
    assert.equal(planCi({ eventName, event: event(), git: fakeGit }).mode, 'full');
  }
  for (const ref of ['master', 'main', 'release/next', 'preview', 'codex/topic', 'Feature/topic', 'feature/', 'feature/evil\nname']) {
    const plan = planCi({ eventName: 'pull_request', event: event(ref), git: fakeGit });
    assert.equal(plan.mode, 'full');
    assert.equal(plan.checkName, 'Typecheck & Build');
  }
});

test('ci-full label escalates a valid child to all release gates', () => {
  const pr = { pull_request: { ...event().pull_request, labels: [{ name: 'ci-full' }] } };
  const plan = planCi({ eventName: 'pull_request', event: pr, git: () => assert.fail('override needs no partial discovery') });
  assert.equal(plan.mode, 'full');
  assert.equal(plan.checkName, 'Feature child checks');
  const skippedFullGates = receipt('affected');
  skippedFullGates.plan.outputs!.mode = plan.mode;
  assert.equal(evaluateGate(skippedFullGates, { eventName: 'pull_request', baseRef: pr.pull_request.base.ref }).ok, false);
  assert.equal(evaluateGate(receipt(plan.mode)).ok, true);
});

test('missing revisions, malformed Git output and inaccessible parents require full validation', () => {
  assert.equal(planCi({ eventName: 'pull_request', event: {}, git: fakeGit }).mode, 'full');
  const missing = event(); missing.pull_request.head.sha = 'missing';
  assert.equal(planCi({ eventName: 'pull_request', event: missing, git: fakeGit }).mode, 'full');
  assert.equal(planCi({ eventName: 'pull_request', event: event(), git: () => { throw new Error('missing object'); } }).mode, 'full');
  assert.equal(planCi({ eventName: 'pull_request', event: event(), git: (...args: string[]) => args[0] === 'diff' ? 'truncated' : c }).mode, 'full');
});

test('NUL-safe parser preserves spaces and Unicode; unusual control paths fail closed', () => {
  assert.equal(parseChanges(raw('components/employer/Employee résumé.tsx'))[0].path, 'components/employer/Employee résumé.tsx');
  assert.equal(classifyChanges(parseChanges(raw('components/employer/line\nname.tsx'))).mode, 'full');
  assert.throws(() => parseChanges(raw().slice(0, raw().indexOf('\0'))));
});

test('deletions, renames, symlinks, submodules, type and executable-mode changes require full suites', () => {
  for (const status of ['D', 'R', 'C', 'T', 'U']) assert.equal(classifyChanges([change(leaf, status)]).mode, 'full');
  for (const mode of ['100755', '120000', '160000']) assert.equal(classifyChanges([change(leaf, 'M', '100644', mode)]).mode, 'full');
  assert.equal(classifyChanges([]).mode, 'full');
});

test('shared, sensitive, configuration and unknown files never qualify for fast CI', () => {
  for (const file of ['app/layout.tsx', 'lib/member/foo.ts', 'prisma/schema.prisma', '.github/workflows/a.yml', 'scripts/run.mjs', 'package.json', 'pnpm-lock.yaml', 'messages/en.json', 'css/portal.css', 'marketing/src/a.astro', 'tests/setup.ts', 'content/career-brief/example.md', 'AGENTS.md', 'docs/PRODUCT_STAKES.md', 'components/employer/AuthPanel.tsx', 'components/portal/kit/KitButton.tsx']) {
    assert.equal(classifyChanges([change(file)]).mode, 'full', file);
  }
  assert.equal(classifyChanges([change('docs/knowledge-base/features.md')]).mode, 'affected');
  for (const file of ['docs/AGENT-DELIVERY.md', 'docs/two-lanes.md', 'docs/knowledge-base/operations.md', 'docs/CI.md', 'docs/new-operating-contract.md']) {
    assert.equal(classifyChanges([change(file)]).mode, 'full', file);
  }
  assert.equal(classifyChanges([change('tests/components/jobs.spec.tsx', 'A', '000000')]).mode, 'full');
  assert.equal(classifyChanges([change('tests/components/jobs.spec.tsx')]).mode, 'affected');
});

test('build-boundary edits escalate even a leaf component', () => {
  for (const diff of ["+'use client';", '-import helper from "./helper";', '+export { default } from "./other";', '+const mod = import("./module");', '+require("server-only");', '+import "./style.css";']) {
    assert.equal(hasBuildBoundaryChange(diff), true, diff);
    assert.equal(planCi({ eventName: 'pull_request', event: event(), git: (...args: string[]) => args.includes('--unified=0') ? diff : fakeGit(...args) }).mode, 'full');
  }
  assert.equal(hasBuildBoundaryChange('+++ b/components/employer/ImportHelper.tsx\n+ return <div>Jobs</div>;'), false);
});

test('real Git evidence includes divergent base changes and retargeting', (t) => {
  const root = mkdtempSync(path.join(tmpdir(), 'wap-ci-plan-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const write = (file: string, text: string) => { mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); writeFileSync(path.join(root, file), text); };
  const commit = () => { git('add', '.'); git('-c', 'user.name=CI test', '-c', 'user.email=ci@example.invalid', 'commit', '-qm', 'fixture'); return git('rev-parse', 'HEAD').trim(); };
  git('init', '-q'); git('config', 'core.hooksPath', path.join(root, 'empty-hooks'));
  write(leaf, 'export default function Jobs() { return "old"; }');
  const base = commit();
  git('checkout', '-qb', 'child');
  write(leaf, 'export default function Jobs() { return "new"; }');
  const head = commit();
  const pr = { pull_request: { base: { ref: 'feature/portal-test', sha: base }, head: { sha: head } } };
  // The export line itself changed, so this intentionally forces full.
  assert.equal(planCi({ eventName: 'pull_request', event: pr, git }).mode, 'full');
  write(leaf, 'export default function Jobs() {\n  return "old";\n}'); commit();
  const stableBase = git('rev-parse', 'HEAD').trim();
  write(leaf, 'export default function Jobs() {\n  return "new";\n}');
  pr.pull_request.base.sha = stableBase; pr.pull_request.head.sha = commit();
  assert.equal(planCi({ eventName: 'pull_request', event: pr, git }).mode, 'affected');
  pr.pull_request.base.ref = 'master';
  assert.equal(planCi({ eventName: 'pull_request', event: pr, git }).mode, 'full');
  pr.pull_request.base.ref = 'feature/portal-test';
  git('checkout', '-qb', 'integration', stableBase);
  write('lib/shared.ts', 'export const shared = 1;');
  pr.pull_request.base.sha = commit();
  git('-c', 'user.name=CI test', '-c', 'user.email=ci@example.invalid', 'merge', '--no-ff', 'child', '-m', 'tested merge');
  assert.equal(planCi({ eventName: 'pull_request', event: pr, git }).mode, 'full');
});

function receipt(mode = 'full') {
  const result: Record<string, { result: string; outputs?: { mode: string; version: string } }> = {
    plan: { result: 'success', outputs: { mode, version: PLAN_VERSION } }, 'static-gates': { result: 'success' }, unit: { result: 'success' },
  };
  for (const job of ['vitest', 'build', 'database-contract']) result[job] = { result: mode === 'full' ? 'success' : 'skipped' };
  result['vitest-affected'] = { result: mode === 'affected' ? 'success' : 'skipped' };
  return result;
}

test('gate only accepts intentional skips on verified feature children', () => {
  const child = { eventName: 'pull_request', baseRef: 'feature/portal-test' };
  assert.equal(evaluateGate(receipt('affected'), child).ok, true);
  const unknownOwnership = receipt('affected'); unknownOwnership['vitest-affected'].result = 'failure';
  assert.equal(evaluateGate(unknownOwnership, child).ok, false);
  assert.equal(evaluateGate(receipt()).ok, true);
  for (const context of [{}, { eventName: 'merge_group', baseRef: 'feature/test' }, { eventName: 'pull_request', baseRef: 'master' }]) {
    assert.equal(evaluateGate(receipt('affected'), context).ok, false);
  }
  for (const job of Object.keys(receipt())) {
    for (const state of ['failure', 'cancelled', 'missing']) {
      const needs = receipt(); needs[job].result = state;
      assert.equal(evaluateGate(needs).ok, false, `${job} ${state}`);
    }
  }
  const noDb = receipt(); delete noDb['database-contract']; assert.equal(evaluateGate(noDb).ok, false);
  const badVersion = receipt(); badVersion.plan.outputs!.version = 'future'; assert.equal(evaluateGate(badVersion).ok, false);
});

test('affected prepush rejects mutable or omitted base refs', () => {
  for (const args of [[], ['--base', 'origin/master']]) {
    const result = spawnSync(process.execPath, [path.resolve('scripts/prepush.mjs'), '--ci-affected', '--list', ...args], { encoding: 'utf8' });
    assert.equal(result.status, 1); assert.match(result.stderr, /immutable --base SHA/);
  }
});
