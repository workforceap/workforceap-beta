import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';

test('actual workflows cover every PR base and retain complete release gates', () => {
  const readWorkflow = (name: string) => parse(readFileSync(new URL(`../.github/workflows/${name}.yml`, import.meta.url), 'utf8'));
  for (const name of ['ci-gate', 'coursera-catalog-placeholders', 'locked-product-stakes', 'knowledge-base']) {
    const pr = readWorkflow(name).on.pull_request;
    assert.equal(pr.branches, undefined, name); assert.equal(pr.paths, undefined, name);
    assert.ok(pr.types.includes('edited'), name);
    assert.ok(pr.types.includes('ready_for_review'), name);
  }
  const workflow = readWorkflow('ci-gate');
  for (const event of ['labeled', 'unlabeled']) assert.ok(workflow.on.pull_request.types.includes(event));
  const jobs = workflow.jobs;
  assert.equal(jobs.ci.if, 'always()');
  assert.ok(jobs.ci.needs.includes('database-contract'));
  assert.equal(jobs.ci.name, "${{ needs.plan.outputs.check-name || 'Typecheck & Build' }}");
  assert.equal(jobs.plan.outputs['check-name'], '${{ steps.scope.outputs.check-name }}');
  for (const job of ['vitest', 'build', 'database-contract']) assert.equal(jobs[job].if, "needs.plan.outputs.mode != 'affected'");
  assert.equal(jobs.unit.if, undefined);
  assert.ok(jobs['static-gates'].steps.some((step: { run?: string }) => step.run?.includes('--ci-affected')));
});
