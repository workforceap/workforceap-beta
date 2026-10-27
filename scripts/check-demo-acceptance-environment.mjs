import { execFileSync } from 'node:child_process';
import { assertDispatchContext, assertProtectedDemoEnvironment } from './lib/demo-acceptance-workflow.mjs';
try {
  assertDispatchContext(process.env);
  const get = path => JSON.parse(execFileSync('gh', ['api', '--method', 'GET', path], { encoding: 'utf8', timeout: 15_000, windowsHide: true }));
  const path = 'repos/workforceap/workforceap-beta/environments/demo-qa';
  assertProtectedDemoEnvironment(get(path), get(`${path}/deployment-branch-policies`));
  console.log('Existing demo-qa protection and master-only dispatch were verified.');
} catch {
  console.error('DEMO acceptance is held: trusted dispatch or existing protected demo-qa environment could not be verified.');
  process.exitCode = 1;
}
