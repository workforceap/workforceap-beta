import { assertDispatchContext } from './lib/demo-acceptance-workflow.mjs';
import { phaseBlueprintFromEnvironment } from './lib/demo-acceptance-lifecycle.mjs';
import { verifyHostedPhaseAuthorization } from './lib/demo-acceptance-phase-authorization.mjs';
import { appendFileSync } from 'node:fs';
import { canonical } from './lib/demo-acceptance-journal.mjs';
try {
  assertDispatchContext(process.env);
  const blueprint = phaseBlueprintFromEnvironment(process.env);
  const proof = verifyHostedPhaseAuthorization(process.env, blueprint, 'approved-profile');
  if (!process.env.GITHUB_ENV) throw new Error('Protected runner handoff is required.');
  appendFileSync(process.env.GITHUB_ENV, `DEMO_QA_PHASES_ENABLED=true\nDEMO_QA_PHASE_APPROVAL=${canonical(JSON.parse(process.env.DEMO_QA_PHASE_APPROVAL))}\n`);
  console.log(`Exact synthetic phase blueprint approved for this run: ${proof.blueprintHash}.`);
} catch { console.error('Synthetic fixture phases remain disabled or lack exact reviewed approval. No fixture creation is permitted.'); process.exitCode = 1; }
