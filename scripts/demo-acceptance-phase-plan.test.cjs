const test = require('node:test');
const assert = require('node:assert/strict');
const { PHASE_CONTENT_PATHS, PHASE_SCOPES, createPhaseBlueprint, validatePhaseBlueprint, phaseBlueprintHash, assertPhaseApproval, phaseActivationFromEnvironment } = require('./lib/demo-acceptance-phase-plan.mjs');
const { assertPhaseAuthorizationEvidence, phaseApprovalComment } = require('./lib/demo-acceptance-phase-authorization.mjs');
const context = { runId: '42-1', organizationId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', controlSha: 'a'.repeat(40), baselineSha: 'b'.repeat(40), fixtureAsOf: '2026-10-27T04:00:00.000Z', contentProof: PHASE_CONTENT_PATHS.map(path => ({ path, baselineBlob: 'c'.repeat(40), candidateBlob: 'c'.repeat(40) })) };
const blueprint = createPhaseBlueprint(context);
const now = Date.parse('2026-10-27T04:30:00Z');
const approval = { schemaVersion: 1, contract: 'portal-phase-approval-v1', approved: true, blueprintHash: phaseBlueprintHash(blueprint), repository: blueprint.repository, projectRef: blueprint.projectRef, runId: blueprint.runId, organizationId: blueprint.organizationId, controlSha: blueprint.controlSha, baselineSha: blueprint.baselineSha, reviewer: { login: 'mabrown040', id: 225406758 }, scopes: [...PHASE_SCOPES], approvedAt: '2026-10-27T04:01:00Z', expiresAt: '2026-10-27T07:00:00Z', reference: 'https://github.com/workforceap/workforceap-beta/actions/runs/42' };
test('phase blueprint reserves deterministic source-bound identities and refuses edited contract', () => {
  assert.deepEqual(createPhaseBlueprint(context), blueprint);
  assert.notDeepEqual(createPhaseBlueprint({ ...context, runId: '43-1' }).ids, blueprint.ids);
  validatePhaseBlueprint(blueprint, context);
  for (const edited of [{ ...blueprint, providerActions: true }, { ...blueprint, ids: { ...blueprint.ids, job: blueprint.ids.mentor } }, { ...blueprint, extra: 'arbitrary' }]) assert.throws(() => validatePhaseBlueprint(edited, context));
  assert.throws(() => validatePhaseBlueprint(blueprint, { ...context, organizationId: 'ffffffff-bbbb-4ccc-8ddd-eeeeeeeeeeee' }));
  assert.throws(() => createPhaseBlueprint({ ...context, contentProof: context.contentProof.map((item, index) => index ? item : { ...item, candidateBlob: 'd'.repeat(40) }) }));
});
test('hosted activation requires actual GitHub human approval and immutable preflight artifact provenance', () => {
  const env = { GITHUB_REPOSITORY: blueprint.repository, GITHUB_REF: 'refs/heads/master', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_RUN_ID: '42', GITHUB_RUN_ATTEMPT: '1', DEMO_QA_ENABLED: 'true', DEMO_QA_MODE: 'acceptance', DEMO_QA_PHASE_BLUEPRINT_HASH: phaseBlueprintHash(blueprint), DEMO_QA_PHASE_ARTIFACT_ID: '123', DEMO_QA_PHASE_ARTIFACT_DIGEST: 'd'.repeat(64) };
  const evidence = { run: { id: 42, head_sha: blueprint.controlSha, run_attempt: 1, event: 'workflow_dispatch', head_branch: 'master', repository: { full_name: blueprint.repository } }, artifact: { id: 123, name: 'portal-phase-blueprint-42', expired: false, digest: `sha256:${env.DEMO_QA_PHASE_ARTIFACT_DIGEST}`, workflow_run: { id: 42, head_sha: blueprint.controlSha } }, reviews: [{ state: 'approved', comment: phaseApprovalComment(blueprint, approval), environments: [{ name: 'demo-qa' }], user: approval.reviewer }] };
  assertPhaseAuthorizationEvidence(env, blueprint, approval, evidence);
  for (const altered of [
    { ...evidence, reviews: [] }, { ...evidence, reviews: [evidence.reviews[0], evidence.reviews[0]] },
    ...[{ state: 'rejected' }, { comment: 'approved' }, { user: { login: 'mabrown040', id: 1 } }, { environments: [{ name: 'production' }] }].map(patch => ({ ...evidence, reviews: [{ ...evidence.reviews[0], ...patch }] })),
    ...[{ id: 124 }, { digest: 'sha256:wrong' }, { expired: true }, { workflow_run: { id: 43, head_sha: blueprint.controlSha } }].map(patch => ({ ...evidence, artifact: { ...evidence.artifact, ...patch } })),
    { ...evidence, run: { ...evidence.run, run_attempt: 2 } },
  ]) assert.throws(() => assertPhaseAuthorizationEvidence(env, blueprint, approval, altered));
  assert.throws(() => assertPhaseAuthorizationEvidence({ ...env, DEMO_QA_PHASE_BLUEPRINT_HASH: 'e'.repeat(64) }, blueprint, approval, evidence));
  assert.throws(() => assertPhaseAuthorizationEvidence(env, blueprint, { ...approval, scopes: PHASE_SCOPES.slice(0, 3) }, evidence));
  assert.throws(() => assertPhaseApproval({ ...approval, reference: 'https://github.com/workforceap/workforceap-beta/actions/runs/43' }, blueprint, 'approved-profile', { now }));
  assert.throws(() => assertPhaseApproval({ ...approval, reference: 'https://github.com/workforceap/workforceap-beta/pull/42' }, blueprint, 'approved-profile', { now }));
});
test('phase activation has no enabled or approval default and binds explicit reviewed scopes', () => {
  assert.throws(() => phaseActivationFromEnvironment({}, blueprint, 'assigned-owner', { now }));
  assert.throws(() => phaseActivationFromEnvironment({ DEMO_QA_PHASES_ENABLED: 'true' }, blueprint, 'assigned-owner', { now }));
  assertPhaseApproval(approval, blueprint, 'approved-profile', { now });
  const partial = { ...approval, scopes: PHASE_SCOPES.slice(0, 3) };
  assertPhaseApproval(partial, blueprint, 'assigned-owner', { now });
  assert.throws(() => assertPhaseApproval(partial, blueprint, 'approved-profile', { now }));
  for (const patch of [{ approved: false }, { blueprintHash: '0'.repeat(64) }, { runId: '43-1' }, { controlSha: 'd'.repeat(40) }, { reviewer: { login: 'other', id: 1 } }, { scopes: [...PHASE_SCOPES, 'provider-enrollment'] }, { expiresAt: '2026-10-27T04:10:00Z' }, { reference: '' }, { unexplained: true }]) assert.throws(() => assertPhaseApproval({ ...approval, ...patch }, blueprint, 'approved-profile', { now }));
});
