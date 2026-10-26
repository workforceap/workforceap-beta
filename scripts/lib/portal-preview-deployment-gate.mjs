/** Read-only deployment gate. Never substitutes another commit or creates a build. */
export function selectPreviewDeployment(deployments, sha) {
  if (!Array.isArray(deployments)) throw new Error('Invalid deployments response');
  return deployments.filter((deployment) =>
    deployment.sha === sha && deployment.environment === 'Preview' &&
    deployment.production_environment === false &&
    [sha, 'preview', 'refs/heads/preview'].includes(deployment.ref) &&
    deployment.creator?.login === 'vercel[bot]' &&
    Number.isSafeInteger(deployment.id) && deployment.id > 0
  ).sort((a, b) => b.id - a.id)[0] ?? null;
}

export async function waitForPreviewDeployment({
  sha, listDeployments, listStatuses, now = Date.now,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  signal, timeoutMs = 25 * 60_000, registrationTimeoutMs = 2 * 60_000,
  intervalMs = 20_000, log = () => {},
}) {
  if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error('Expected a full trusted commit SHA');
  for (const value of [timeoutMs, registrationTimeoutMs, intervalMs]) {
    if (!Number.isFinite(value) || value <= 0) throw new Error('Invalid polling window');
  }
  const deadline = now() + timeoutMs;
  const registrationDeadline = now() + Math.min(registrationTimeoutMs, timeoutMs);
  let observed = false;
  let lastState = 'missing';
  for (;;) {
    if (signal?.aborted) return { ok: false, reason: 'cancelled' };
    // API errors fail closed; do not reinterpret permission/network failures as absence.
    const deployment = selectPreviewDeployment(await listDeployments(), sha);
    if (now() > deadline) return { ok: false, reason: observed ? 'build_timeout' : 'deployment_missing' };
    if (signal?.aborted) return { ok: false, reason: 'cancelled' };
    if (deployment) {
      observed = true;
      const statuses = await listStatuses(deployment.id);
      if (!Array.isArray(statuses)) throw new Error('Invalid deployment statuses response');
      if (signal?.aborted) return { ok: false, reason: 'cancelled' };
      if (now() > deadline) return { ok: false, reason: 'build_timeout' };
      lastState = statuses[0]?.state ?? 'pending';
      const knownState = ['success', 'failure', 'error', 'inactive', 'cancelled', 'canceled', 'queued', 'pending', 'in_progress'].includes(lastState);
      log(`Preview ${sha.slice(0, 9)} deployment ${deployment.id}: ${knownState ? lastState : 'unknown'}`);
      if (lastState === 'success') return { ok: true, deploymentId: deployment.id };
      if (['failure', 'error', 'inactive', 'cancelled', 'canceled'].includes(lastState)) {
        return { ok: false, reason: 'deployment_failed', state: lastState, deploymentId: deployment.id };
      }
      if (!['queued', 'pending', 'in_progress'].includes(lastState)) {
        return { ok: false, reason: 'unexpected_state', deploymentId: deployment.id };
      }
    } else {
      lastState = 'missing';
      log(`Preview ${sha.slice(0, 9)}: no matching Preview deployment`);
    }
    const remaining = Math.min(deadline, observed ? deadline : registrationDeadline) - now();
    if (remaining <= 0) return { ok: false, reason: observed ? 'build_timeout' : 'deployment_missing', state: lastState };
    await sleep(Math.min(intervalMs, remaining));
  }
}

export function describePreviewFailure(outcome) {
  switch (outcome.reason) {
    case 'deployment_missing':
      return 'No Vercel Preview deployment was registered for the exact trusted SHA (GitHub metadata does not attest the branch). A mirrored Git ref is not proof that a build was created; an unchanged ref does not retry a missing build. Check the Vercel Git integration, ignored-build decision and preview branch deployment for this SHA. An authorized operator must restore the Preview build trigger; rerunning the audit alone cannot create it. No login attempted.';
    case 'deployment_failed':
      return `Preview deployment ${outcome.deploymentId} ended in ${outcome.state}. Inspect that deployment before retrying. No login attempted.`;
    case 'build_timeout': return 'The exact Preview deployment did not become successful within the build window. No login attempted.';
    case 'cancelled': return 'Preview wait cancelled. No login attempted.';
    default: return 'Preview deployment returned an unsupported state. No login attempted.';
  }
}
