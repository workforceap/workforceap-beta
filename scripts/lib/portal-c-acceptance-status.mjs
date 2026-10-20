export const PORTAL_C_ACCEPTANCE_JOBS = Object.freeze({
  safety: ['Registry and alias lock', 'Dev member harness on Preview', 'Signed-in member C routes'],
  staff: ['Staff pixels against master'],
});

export function latestPortalCAcceptanceRun(runs, sha, kind) {
  const events = kind === 'safety' ? ['deployment_status', 'workflow_dispatch'] : ['pull_request'];
  return runs.filter(run => run.head_sha === sha && events.includes(run.event) &&
    run.head_repository?.full_name === 'workforceap/workforceap-beta')
    .sort((left, right) => right.id - left.id)[0] ?? null;
}

/** A skipped, missing or still-running acceptance lane can never publish success. */
export function portalCAcceptanceStatus(lanes) {
  const missing = [];
  const failed = [];
  for (const [kind, names] of Object.entries(PORTAL_C_ACCEPTANCE_JOBS)) {
    for (const name of names) {
      const job = lanes[kind]?.find(candidate => candidate.name === name);
      if (job?.status === 'completed' && job.conclusion === 'success') continue;
      if (job?.status === 'completed' && ['failure', 'cancelled', 'timed_out', 'action_required', 'startup_failure'].includes(job.conclusion)) failed.push(name);
      else missing.push(name);
    }
  }
  if (failed.length) return { state: 'failure', description: `Required acceptance failed: ${failed.join(', ')}`.slice(0, 140) };
  if (missing.length) return { state: 'pending', description: `Acceptance incomplete: ${missing.join(', ')}`.slice(0, 140) };
  return { state: 'success', description: 'Registry, harness, signed-in member/mentor, and master staff comparison all passed' };
}
