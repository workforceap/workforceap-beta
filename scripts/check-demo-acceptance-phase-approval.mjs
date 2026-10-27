import { assertDispatchContext } from './lib/demo-acceptance-workflow.mjs';
import { phaseBlueprintFromEnvironment } from './lib/demo-acceptance-lifecycle.mjs';
import { verifyHostedPhaseAuthorization } from './lib/demo-acceptance-phase-authorization.mjs';
try {
  assertDispatchContext(process.env);
  const blueprint = phaseBlueprintFromEnvironment(process.env);
  const proof = verifyHostedPhaseAuthorization(process.env, blueprint, 'approved-profile');
  console.log(`Exact synthetic phase blueprint approved for this run: ${proof.blueprintHash}.`);
} catch { console.error('Synthetic fixture phases remain disabled or lack exact reviewed approval. No fixture creation is permitted.'); process.exitCode = 1; }
