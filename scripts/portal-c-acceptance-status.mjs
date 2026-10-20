#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { latestPortalCAcceptanceRun, portalCAcceptanceStatus } from './lib/portal-c-acceptance-status.mjs';

export function readPortalCAcceptance({ repository, sha, ownRunId = '', ownStaffResult = '' }, api) {
  if (repository !== 'workforceap/workforceap-beta' || !/^[a-f0-9]{40}$/.test(sha)) throw new Error('An exact WorkforceAP commit is required.');
  const lanes = {};
  for (const [kind, workflow] of Object.entries({ safety: 'dev-member-safety-net.yml', staff: 'portal-c-staff-protection.yml' })) {
    const runs = api(`repos/${repository}/actions/workflows/${workflow}/runs?head_sha=${sha}&per_page=100`).workflow_runs ?? [];
    const run = latestPortalCAcceptanceRun(runs, sha, kind);
    lanes[kind] = run ? api(`repos/${repository}/actions/runs/${run.id}/jobs?filter=latest&per_page=100`).jobs ?? [] : [];
    // The staff status is posted as its last step, so GitHub still calls that
    // job in_progress. Only its own current run may supply the completed result.
    if (kind === 'staff' && String(run?.id) === ownRunId && ['success', 'failure', 'cancelled'].includes(ownStaffResult)) {
      lanes.staff = [{ name: 'Staff pixels against master', status: 'completed', conclusion: ownStaffResult }];
    }
  }
  return portalCAcceptanceStatus(lanes);
}

/**
 * @param {Record<string, string | undefined>} [env]
 * @param {(command: string, args: string[], options: { encoding: 'utf8', input?: string }) => string} [exec]
 */
export function main(env = process.env, exec = execFileSync) {
  const repository = env.GITHUB_REPOSITORY ?? '';
  const sha = env.PORTAL_C_STATUS_SHA ?? '';
  if (repository !== 'workforceap/workforceap-beta' || !/^[a-f0-9]{40}$/.test(sha)) throw new Error('An exact WorkforceAP commit is required.');
  const api = endpoint => JSON.parse(exec('gh', ['api', endpoint], { encoding: 'utf8' }));
  let result;
  try {
    result = readPortalCAcceptance({ repository, sha, ownRunId: env.GITHUB_RUN_ID, ownStaffResult: env.PORTAL_C_STAFF_RESULT }, api);
  } catch {
    result = { state: 'error', description: 'Could not verify every required Portal C acceptance job for this exact head' };
  }
  const payload = { ...result, context: 'Portal C safety net', target_url: `${env.GITHUB_SERVER_URL ?? 'https://github.com'}/${repository}/actions/runs/${env.GITHUB_RUN_ID}` };
  exec('gh', ['api', '--method', 'POST', `repos/${repository}/statuses/${sha}`, '--input', '-'], { input: JSON.stringify(payload), encoding: 'utf8' });
  console.log(`[portal-c-acceptance] ${result.state}: ${result.description}`);
  if (result.state === 'error') throw new Error('Portal C acceptance could not be verified.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
