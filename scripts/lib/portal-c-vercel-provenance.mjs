/**
 * Vercel deployment provenance for the signed-in Preview gate.
 * Health JSON alone is not sufficient — the deployment must match project,
 * team, git SHA, branch, and hostname before any member credential is used.
 */
export const WORKFORCEAP_VERCEL_PROJECT_ID = 'prj_pfOpwxedCID96oF2hlaE5J7kbNid';
export const WORKFORCEAP_VERCEL_TEAM_ID = 'team_zTfMkbIIH6ADgy5Hy43MCM5K';

export function parseHttpsOrigin(origin) {
  const normalized = typeof origin === 'string' ? origin.trim().replace(/\/+$/, '') : '';
  if (!normalized) {
    return { ok: false, reason: 'missing_origin' };
  }
  let url;
  try {
    url = new URL(normalized);
  } catch {
    return { ok: false, reason: 'invalid_origin' };
  }
  if (url.protocol !== 'https:') {
    return { ok: false, reason: 'insecure_origin' };
  }
  return { ok: true, origin: normalized, hostname: url.hostname.toLowerCase() };
}

export function deploymentHostnames(deployment) {
  const hosts = new Set();
  if (typeof deployment?.url === 'string' && deployment.url.length > 0) {
    hosts.add(deployment.url.toLowerCase());
  }
  for (const alias of deployment?.alias ?? []) {
    if (typeof alias === 'string' && alias.length > 0) {
      hosts.add(alias.toLowerCase());
    }
  }
  return hosts;
}

/**
 * @param {{
 *   deployment: Record<string, unknown> | null | undefined;
 *   trustedSha: string;
 *   trustedBranch: string;
 *   expectedProjectId?: string;
 *   originHostname: string;
 * }} input
 */
export function evaluateVercelProvenance(input) {
  const deployment = input.deployment;
  if (!deployment || typeof deployment !== 'object') {
    return { ok: false, reason: 'deployment_missing' };
  }

  const projectId =
    typeof deployment.projectId === 'string'
      ? deployment.projectId
      : typeof deployment.project?.id === 'string'
        ? deployment.project.id
        : '';
  const expectedProjectId = input.expectedProjectId ?? WORKFORCEAP_VERCEL_PROJECT_ID;
  if (projectId !== expectedProjectId) {
    return { ok: false, reason: 'wrong_vercel_project', projectId };
  }

  if (deployment.readyState !== 'READY') {
    return { ok: false, reason: 'deployment_not_ready', readyState: deployment.readyState };
  }

  const meta = deployment.meta && typeof deployment.meta === 'object' ? deployment.meta : {};
  const commitSha =
    typeof meta.githubCommitSha === 'string'
      ? meta.githubCommitSha.toLowerCase()
      : typeof deployment.gitSource?.sha === 'string'
        ? deployment.gitSource.sha.toLowerCase()
        : '';
  if (!commitSha || commitSha !== input.trustedSha.toLowerCase()) {
    return { ok: false, reason: 'commit_sha_mismatch', commitSha };
  }

  const branch =
    typeof meta.githubCommitRef === 'string'
      ? meta.githubCommitRef
      : typeof deployment.gitSource?.ref === 'string'
        ? deployment.gitSource.ref
        : '';
  if (!branch || branch !== input.trustedBranch) {
    return { ok: false, reason: 'branch_mismatch', branch };
  }

  const hosts = deploymentHostnames(deployment);
  if (!hosts.has(input.originHostname.toLowerCase())) {
    return { ok: false, reason: 'hostname_mismatch', hosts: [...hosts] };
  }

  return { ok: true, projectId, commitSha, branch };
}

export async function fetchVercelDeploymentForHost({
  hostname,
  token,
  teamId = WORKFORCEAP_VERCEL_TEAM_ID,
  fetchImpl = globalThis.fetch,
}) {
  if (!token) {
    return { ok: false, reason: 'vercel_token_missing' };
  }
  const url = new URL(`https://api.vercel.com/v13/deployments/${encodeURIComponent(hostname)}`);
  url.searchParams.set('teamId', teamId);
  const response = await fetchImpl(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (response.status === 404) {
    return { ok: false, reason: 'deployment_not_found', status: 404 };
  }
  if (!response.ok) {
    return { ok: false, reason: 'vercel_api_error', status: response.status };
  }
  const deployment = await response.json();
  return { ok: true, deployment };
}

export function describeVercelProvenanceFailure(result) {
  switch (result.reason) {
    case 'missing_origin':
      return 'PLAYWRIGHT_BASE_URL is required.';
    case 'invalid_origin':
      return 'PLAYWRIGHT_BASE_URL is not a valid URL.';
    case 'insecure_origin':
      return 'Only https:// preview origins are allowed before login.';
    case 'vercel_token_missing':
      return 'VERCEL_TOKEN is required to verify deployment provenance through the Vercel API.';
    case 'deployment_not_found':
      return 'Vercel API did not return a deployment for the preview hostname.';
    case 'vercel_api_error':
      return `Vercel API returned HTTP ${result.status ?? 'unknown'}.`;
    case 'deployment_missing':
      return 'Vercel deployment payload was empty.';
    case 'wrong_vercel_project':
      return 'Deployment belongs to a different Vercel project than workforceap-beta.';
    case 'deployment_not_ready':
      return `Deployment is not READY (state=${String(result.readyState)}).`;
    case 'commit_sha_mismatch':
      return 'Deployment git SHA does not match the trusted PR head commit.';
    case 'branch_mismatch':
      return 'Deployment git branch does not match the trusted PR head branch.';
    case 'hostname_mismatch':
      return 'Preview hostname is not served by the deployment Vercel returned.';
    default:
      return `Vercel provenance check failed (${String(result.reason)}).`;
  }
}

export async function runVercelProvenanceGuard({
  origin,
  trustedSha,
  trustedBranch,
  vercelToken,
  expectedProjectId,
  fetchImpl = globalThis.fetch,
}) {
  const parsed = parseHttpsOrigin(origin);
  if (!parsed.ok) {
    return parsed;
  }
  const fetched = await fetchVercelDeploymentForHost({
    hostname: parsed.hostname,
    token: vercelToken,
    fetchImpl,
  });
  if (!fetched.ok) {
    return fetched;
  }
  return evaluateVercelProvenance({
    deployment: fetched.deployment,
    trustedSha,
    trustedBranch,
    expectedProjectId,
    originHostname: parsed.hostname,
  });
}
