#!/usr/bin/env node
import { readFileSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { verifyBrowserTargets, validateLocalFixtureOrigin, verifyLocalFixtureHealth } from './lib/portal-browser-targets.mjs';
import { validateAcceptanceIdentity } from './lib/portal-acceptance-lanes.mjs';
import { validateBrowserPhaseInput } from './lib/portal-browser-plan.mjs';

const require = createRequire(import.meta.url);
const args = process.argv.slice(2);
function option(name) { const index = args.indexOf(name); if (index < 0 || !args[index + 1]) throw new Error(`Missing ${name}`); return args[index + 1]; }
let output;
try {
  const inputPath = resolve(option('--input'));
  output = resolve(option('--output'));
  const input = JSON.parse(readFileSync(inputPath, 'utf8'));
  const allowedInputKeys = new Set(['identity', 'baselineDeploymentId', 'candidateDeploymentId', 'memberId', 'dynamicRoutes', 'mentorApproved', 'phase']);
  if (Object.keys(input).some(key => !allowedInputKeys.has(key))) throw new Error('Unexpected browser input field');
  validateAcceptanceIdentity(input.identity);
  const localFixturesOnly = args.includes('--local-fixtures-only');
  const phase = validateBrowserPhaseInput(input, { localFixturesOnly, phasesEnabled: process.env.DEMO_QA_PHASES_ENABLED === 'true' });
  if (phase) input.phase = phase;
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', windowsHide: true }).trim();
  if (head !== input.identity.controlSha) throw new Error('Runner checkout is not the trusted control SHA');
  const dirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=normal'], { encoding: 'utf8', windowsHide: true }).trim();
  if (dirty) throw new Error('Trusted runner must have a clean committed source tree');
  const readApi = async path => JSON.parse(execFileSync('gh', ['api', '--method', 'GET', path], { encoding: 'utf8', timeout: 30_000, maxBuffer: 2 * 1024 * 1024, windowsHide: true }));
  const fetchHealth = async origin => {
    const response = await fetch(`${origin}/api/health`, { redirect: 'error', signal: AbortSignal.timeout(15_000), headers: {
      ...(!localFixturesOnly && process.env.DEMO_QA_VERCEL_BYPASS_SECRET ? { 'x-vercel-protection-bypass': process.env.DEMO_QA_VERCEL_BYPASS_SECRET } : {}),
    } });
    return { status: response.status, body: await response.text() };
  };
  let targets;
  if (localFixturesOnly) {
    const origin = validateLocalFixtureOrigin(option('--local-origin'));
    targets = { candidate: verifyLocalFixtureHealth(input.identity, origin, await fetchHealth(origin), { ownedDisconnectedServer: process.env.PORTAL_ACCEPTANCE_OWNED_DISCONNECTED_SERVER === 'true' }) };
  } else targets = await verifyBrowserTargets(input, readApi, fetchHealth);
  mkdirSync(dirname(output), { recursive: true });
  const verifiedPath = `${output}.targets.json`;
  writeFileSync(`${verifiedPath}.tmp`, JSON.stringify({ ...input, targets, localFixturesOnly }, null, 2));
  renameSync(`${verifiedPath}.tmp`, verifiedPath);
  if (args.includes('--preflight-only')) {
    writeFileSync(output, JSON.stringify({ status: 'passed', kind: 'browser-target-preflight', identity: input.identity, ...(phase ? { phase } : {}), targets, observedAt: new Date().toISOString() }, null, 2));
    console.log('Requested exact targets passed health preflight. No account credentials were read.');
  } else {
    const child = spawnSync(process.execPath, [require.resolve('@playwright/test/cli'), 'test', '--config=playwright.portal-acceptance.config.ts'], {
      stdio: 'inherit', windowsHide: true,
      env: { ...process.env, PORTAL_ACCEPTANCE_INPUT: verifiedPath, PORTAL_ACCEPTANCE_OUTPUT: output },
    });
    process.exitCode = child.status ?? 1;
  }
} catch {
  // Do not print API errors or environment values; the failure is before login.
  console.error('Portal browser acceptance failed its configuration, exact-checkout, deployment or health gate. No acceptance pass is recorded.');
  if (output) { mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, JSON.stringify({ status: 'error', failure: 'browser_preflight_failed', observedAt: new Date().toISOString() }, null, 2)); }
  process.exitCode = 1;
}
