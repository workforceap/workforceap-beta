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

function hostOnly(value) {
  return String(value)
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '')
    .toLowerCase();
}

export function deploymentHostnames(deployment) {
  const hosts = new Set();
  if (typeof deployment?.url === 'string' && deployment.url.length > 0) {
    hosts.add(hostOnly(deployment.url));
  }
  const branchAlias = deployment?.meta?.branchAlias;
  if (typeof branchAlias === 'string' && branchAlias.length > 0) {
    hosts.add(hostOnly(branchAlias));
  }
  for (const alias of deployment?.alias ?? []) {
    if (typeof alias === 'string' && alias.length > 0) {
      hosts.add(hostOnly(alias));
    }
  }
  return hosts;
}

function listedDeployments(payload) {
  if (Array.isArray(payload?.deployments)) return payload.deployments;
  if (payload && typeof payload === 'object' && (payload.url || payload.uid || payload.projectId)) {
    return [payload];
  }
  return [];
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
  const namedProject = deployment.name === 'workforceap-beta';
  if (projectId) {
    if (projectId !== expectedProjectId) {
      return { ok: false, reason: 'wrong_vercel_project', projectId };
    }
  } else if (!namedProject) {
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

async function readVercelResponse(response) {
  if (response.status === 404) {
    return { ok: false, reason: 'deployment_not_found', status: 404 };
  }
  if (!response.ok) {
    let code = '';
    try {
      const body = await response.json();
      code = typeof body?.error?.code === 'string' ? body.error.code : '';
    } catch {
      code = '';
    }
    return { ok: false, reason: 'vercel_api_error', status: response.status, code };
  }
  return { ok: true, payload: await response.json() };
}

export async function fetchVercelDeploymentForHost({
  hostname,
  token,
  teamId = WORKFORCEAP_VERCEL_TEAM_ID,
  projectId = WORKFORCEAP_VERCEL_PROJECT_ID,
  trustedSha = '',
  trustedBranch = '',
  fetchImpl = globalThis.fetch,
}) {
  const trimmed = typeof token === 'string' ? token.trim() : '';
  if (!trimmed) {
    return { ok: false, reason: 'vercel_token_missing' };
  }
  const headers = { Authorization: `Bearer ${trimmed}` };
  const listUrl = new URL('https://api.vercel.com/v7/deployments');
  listUrl.searchParams.set('projectId', projectId);
  listUrl.searchParams.set('teamId', teamId);
  listUrl.searchParams.set('limit', '20');
  if (trustedSha) listUrl.searchParams.set('sha', trustedSha);
  if (trustedBranch) listUrl.searchParams.set('branch', trustedBranch);

  const listed = await readVercelResponse(
    await fetchImpl(listUrl.toString(), { headers }),
  );
  if (listed.ok) {
    const deployments = listedDeployments(listed.payload);
    const match = deployments.find((deployment) =>
      deploymentHostnames(deployment).has(hostname.toLowerCase()),
    );
    if (!match) {
      return {
        ok: false,
        reason: deployments.length > 0 ? 'hostname_mismatch' : 'deployment_not_found',
      };
    }
    return { ok: true, deployment: match };
  }

  // Some tokens can read a deployment by id/url but not the list, or the reverse.
  if (listed.status !== 403 && listed.status !== 404) {
    return listed;
  }
  const byUrl = new URL(
    `https://api.vercel.com/v13/deployments/${encodeURIComponent(hostname)}`,
  );
  byUrl.searchParams.set('teamId', teamId);
  const direct = await readVercelResponse(await fetchImpl(byUrl.toString(), { headers }));
  if (!direct.ok) {
    return listed.status === 403 ? listed : direct;
  }
  return { ok: true, deployment: direct.payload };
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
      return `Vercel API returned HTTP ${result.status ?? 'unknown'}${result.code ? ` (${result.code})` : ''}.`;
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
    projectId: expectedProjectId ?? WORKFORCEAP_VERCEL_PROJECT_ID,
    trustedSha,
    trustedBranch,
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
