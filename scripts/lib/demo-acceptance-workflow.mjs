export function assertDispatchContext(env) {
  if (env.GITHUB_REPOSITORY !== 'workforceap/workforceap-beta' || env.GITHUB_REF !== 'refs/heads/master' || env.GITHUB_EVENT_NAME !== 'workflow_dispatch') throw new Error('Trusted master dispatch is required.');
  if (env.GITHUB_RUN_ATTEMPT !== '1') throw new Error('Reruns are refused; dispatch a new run.');
  if (env.DEMO_QA_ENABLED !== 'true') throw new Error('DEMO acceptance is held until its environment and credentials are reviewed.');
  if (!['acceptance', 'recover-cleanup'].includes(env.DEMO_QA_MODE)) throw new Error('Invalid acceptance mode.');
  if (env.DEMO_QA_MODE === 'recover-cleanup' && !/^[1-9]\d{0,19}-1$/.test(env.DEMO_QA_ORIGINAL_RUN_ID ?? '')) throw new Error('Cleanup-only requires an original first-attempt run ID.');
}

export function assertProtectedDemoEnvironment(environment, branches) {
  if (environment?.name !== 'demo-qa' || !environment.deployment_branch_policy?.custom_branch_policies) throw new Error('The pre-existing demo-qa environment must restrict deployment branches.');
  const reviewers = environment.protection_rules?.find(rule => rule.type === 'required_reviewers');
  if (reviewers?.reviewers?.length !== 1 || reviewers.reviewers[0].type !== 'User' || reviewers.reviewers[0].reviewer?.id !== 225406758 || reviewers.reviewers[0].reviewer?.login !== 'mabrown040' || reviewers.prevent_self_review !== false) throw new Error('The explicit Mike Brown manual review gate is required.');
  if (environment.can_admins_bypass !== false) throw new Error('Administrators must not bypass the manual environment gate.');
  const policies = branches?.branch_policies;
  if (!Array.isArray(policies) || policies.length !== 1 || policies[0].name !== 'master' || policies[0].type !== 'branch') throw new Error('The demo-qa environment must allow only the master branch.');
  return true;
}
