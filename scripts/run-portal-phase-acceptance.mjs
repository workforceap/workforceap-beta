/** Sequential trusted phase coordinator. No browser phase may create its own fixture state. */
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { PHASE_NAMES, phaseActivationFromEnvironment } from './lib/demo-acceptance-phase-plan.mjs';
import { assertDispatchContext } from './lib/demo-acceptance-workflow.mjs';
import { phaseBlueprintFromEnvironment } from './lib/demo-acceptance-lifecycle.mjs';
const require = createRequire(import.meta.url);
try {
  assertDispatchContext(process.env);
  if (process.env.DEMO_QA_MODE !== 'acceptance' || !process.env.PORTAL_BROWSER_OUTPUT || !process.env.PORTAL_BROWSER_INPUT) throw new Error('Explicit acceptance phase outputs are required.');
  const blueprint = phaseBlueprintFromEnvironment(process.env);
  phaseActivationFromEnvironment(process.env, blueprint, 'approved-profile');
  for (const phase of PHASE_NAMES) {
    const transition = spawnSync(process.execPath, [require.resolve('tsx/cli'), 'scripts/five-role-demo-fixture.ts', `phase-${phase}`], { env: process.env, stdio: 'inherit', windowsHide: true });
    if (transition.status !== 0) throw new Error('Phase transition did not complete.');
    const input = JSON.parse(readFileSync(process.env.PORTAL_BROWSER_INPUT, 'utf8'));
    if (input.phase?.name !== phase) throw new Error('Phase export differs from the requested transition.');
    const result = spawnSync(process.execPath, ['scripts/portal-browser-acceptance.mjs', '--input', process.env.PORTAL_BROWSER_INPUT, '--output', `${process.env.PORTAL_BROWSER_OUTPUT}.${phase}.json`], { env: process.env, stdio: 'inherit', windowsHide: true });
    if (result.status !== 0) throw new Error('A required phase failed; further fixture expansion is held.');
  }
} catch { console.error('Portal phase acceptance failed or remains disabled; later phases were not activated.'); process.exitCode = 1; }
