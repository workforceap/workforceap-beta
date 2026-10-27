const test = require('node:test');
const assert = require('node:assert/strict');
const { assertDispatchContext, assertProtectedDemoEnvironment } = require('./lib/demo-acceptance-workflow.mjs');
const env = { GITHUB_REPOSITORY: 'workforceap/workforceap-beta', GITHUB_REF: 'refs/heads/master', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_RUN_ATTEMPT: '1', DEMO_QA_ENABLED: 'true', DEMO_QA_MODE: 'acceptance' };
const environment = { name: 'demo-qa', can_admins_bypass: false, deployment_branch_policy: { custom_branch_policies: true }, protection_rules: [{ type: 'required_reviewers', reviewers: [{ type: 'User', reviewer: { id: 225406758, login: 'mabrown040' } }], prevent_self_review: false }] };
const branches = { branch_policies: [{ name: 'master', type: 'branch' }] };
test('dispatch refuses forks, feature refs, schedules, reruns and unreviewed enablement', () => {
  assertDispatchContext(env);
  for (const patch of [{ GITHUB_REPOSITORY: 'fork/repo' }, { GITHUB_REF: 'refs/heads/feature/x' }, { GITHUB_EVENT_NAME: 'schedule' }, { GITHUB_RUN_ATTEMPT: '2' }, { DEMO_QA_ENABLED: '' }, { DEMO_QA_MODE: 'recover-cleanup' }]) assert.throws(() => assertDispatchContext({ ...env, ...patch }));
});
test('environment requires explicit Mike review, no administrator bypass and master-only branch restrictions', () => {
  assertProtectedDemoEnvironment(environment, branches);
  for (const invalid of [null, {}, { ...environment, can_admins_bypass: true }, { ...environment, can_admins_bypass: undefined }, { ...environment, protection_rules: [] }, { ...environment, deployment_branch_policy: null }, { ...environment, protection_rules: [{ type: 'required_reviewers', reviewers: [{ type: 'User', reviewer: { id: 1, login: 'other' } }], prevent_self_review: false }] }]) assert.throws(() => assertProtectedDemoEnvironment(invalid, branches));
  assert.throws(() => assertProtectedDemoEnvironment(environment, { branch_policies: [{ name: '*', type: 'branch' }] }));
  assert.throws(() => assertProtectedDemoEnvironment(environment, { branch_policies: [...branches.branch_policies, { name: '*', type: 'tag' }] }));
});
