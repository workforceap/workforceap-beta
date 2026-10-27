import { execFileSync } from 'node:child_process';
import { phaseActivationFromEnvironment, phaseBlueprintHash } from './demo-acceptance-phase-plan.mjs';
import { assertDispatchContext } from './demo-acceptance-workflow.mjs';

export const phaseApprovalComment = (blueprint, approval) => `portal-phase-approval-v1 sha256:${phaseBlueprintHash(blueprint)} scopes:${[...approval.scopes].sort().join(',')}`;

/** Validate GitHub-owned run, immutable artifact and actual human environment review records. */
export function assertPhaseAuthorizationEvidence(env, blueprint, approval, { run, artifact, reviews }) {
  assertDispatchContext(env);
  const hash = phaseBlueprintHash(blueprint);
  if (env.DEMO_QA_PHASE_BLUEPRINT_HASH !== hash || !/^[1-9]\d*$/.test(env.DEMO_QA_PHASE_ARTIFACT_ID ?? '') || !/^[a-f0-9]{64}$/.test(env.DEMO_QA_PHASE_ARTIFACT_DIGEST ?? '')) throw new Error('Exact preflight artifact outputs are required.');
  if (String(run?.id) !== env.GITHUB_RUN_ID || run.head_sha !== blueprint.controlSha || run.run_attempt !== 1 || run.event !== 'workflow_dispatch' || run.head_branch !== 'master' || run.repository?.full_name !== blueprint.repository) throw new Error('Approval run provenance mismatch.');
  if (String(artifact?.id) !== env.DEMO_QA_PHASE_ARTIFACT_ID || artifact.name !== `portal-phase-blueprint-${env.GITHUB_RUN_ID}` || artifact.expired !== false || artifact.digest !== `sha256:${env.DEMO_QA_PHASE_ARTIFACT_DIGEST}` || String(artifact.workflow_run?.id) !== env.GITHUB_RUN_ID || artifact.workflow_run?.head_sha !== blueprint.controlSha) throw new Error('Preflight artifact provenance mismatch.');
  const relevant = Array.isArray(reviews) ? reviews.filter(review => review.environments?.some(environment => environment.name === 'demo-qa')) : [];
  if (relevant.length !== 1 || relevant[0].state !== 'approved' || relevant[0].user?.login !== 'mabrown040' || relevant[0].user?.id !== 225406758 || relevant[0].comment !== phaseApprovalComment(blueprint, approval)) throw new Error('The actual Mike environment approval must name the exact plan digest and scopes.');
  return { artifactId: artifact.id, artifactDigest: artifact.digest, blueprintHash: hash, reviewComment: relevant[0].comment, reviewer: { login: relevant[0].user.login, id: relevant[0].user.id }, workflowRunId: env.GITHUB_RUN_ID };
}

/** This read-only GitHub proof is mandatory before every hosted creation, phase or login process. */
export function verifyHostedPhaseAuthorization(env, blueprint, phase) {
  const proof = phaseActivationFromEnvironment(env, blueprint, phase);
  const approval = JSON.parse(env.DEMO_QA_PHASE_APPROVAL);
  const api = path => JSON.parse(execFileSync('gh', ['api', '--method', 'GET', path], { env, encoding: 'utf8', windowsHide: true, timeout: 15_000 }));
  assertPhaseAuthorizationEvidence(env, blueprint, approval, {
    run: api(`repos/${blueprint.repository}/actions/runs/${env.GITHUB_RUN_ID}`),
    artifact: api(`repos/${blueprint.repository}/actions/artifacts/${env.DEMO_QA_PHASE_ARTIFACT_ID}`),
    reviews: api(`repos/${blueprint.repository}/actions/runs/${env.GITHUB_RUN_ID}/approvals`),
  });
  return proof;
}
