import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { PHASE_CONTENT_PATHS, PHASE_SCOPES, createPhaseBlueprint, phaseBlueprintHash } from './lib/demo-acceptance-phase-plan.mjs';
import { fixturePlan } from './lib/demo-acceptance-lifecycle.mjs';
import { phaseApprovalComment } from './lib/demo-acceptance-phase-authorization.mjs';
import { assertDispatchContext } from './lib/demo-acceptance-workflow.mjs';
try {
  assertDispatchContext(process.env);
  if (process.env.DEMO_QA_MODE !== 'acceptance') throw new Error('Phase preparation is acceptance-only.');
  const env = process.env;
  const run = JSON.parse(execFileSync('gh', ['api', '--method', 'GET', `repos/workforceap/workforceap-beta/actions/runs/${env.GITHUB_RUN_ID}`], { encoding: 'utf8', windowsHide: true, timeout: 15_000 }));
  if (String(run.id) !== env.GITHUB_RUN_ID || run.head_sha !== env.GITHUB_SHA || run.run_attempt !== 1 || run.event !== 'workflow_dispatch' || run.head_branch !== 'master' || run.repository?.full_name !== env.GITHUB_REPOSITORY) throw new Error('Trusted preparation run does not match.');
  const contentProof = PHASE_CONTENT_PATHS.map(path => ({ path,
    baselineBlob: execFileSync('git', ['rev-parse', `${env.DEMO_QA_BASELINE_SHA}:${path}`], { encoding: 'utf8', windowsHide: true }).trim(),
    candidateBlob: execFileSync('git', ['rev-parse', `${env.GITHUB_SHA}:${path}`], { encoding: 'utf8', windowsHide: true }).trim(),
  }));
  const blueprint = createPhaseBlueprint({ runId: `${env.GITHUB_RUN_ID}-1`, organizationId: env.PORTAL_QA_ORGANIZATION_ID, controlSha: env.GITHUB_SHA, baselineSha: env.DEMO_QA_BASELINE_SHA, fixtureAsOf: new Date(run.created_at).toISOString(), contentProof });
  const path = env.DEMO_QA_PHASE_PLAN_FILE;
  if (!path) throw new Error('Explicit phase plan output is required.');
  mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, `${JSON.stringify(blueprint, null, 2)}\n`);
  writeFileSync(`${dirname(path)}/creation-plan.json`, `${JSON.stringify(fixturePlan(blueprint.runId, blueprint.organizationId, blueprint), null, 2)}\n`);
  const review = `Synthetic fixture plan for ${blueprint.runId}\n\nBlueprint SHA-256: ${phaseBlueprintHash(blueprint)}\n\nReview both JSON files, all exact record values, the assignment and shared DEMO mentor/job exposure scopes before approval. This preparation grants no approval. If approving all phases, the manual demo-qa approval comment must be exactly:\n\n${phaseApprovalComment(blueprint, { scopes: PHASE_SCOPES })}\n`;
  writeFileSync(`${dirname(path)}/review.txt`, review);
  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, review);
  if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, `blueprint_hash=${phaseBlueprintHash(blueprint)}\n`);
  console.log(`Synthetic blueprint prepared for review: ${phaseBlueprintHash(blueprint)}. This grants no activation approval.`);
} catch { console.error('Synthetic blueprint preparation failed; no fixture activation is permitted.'); process.exitCode = 1; }
