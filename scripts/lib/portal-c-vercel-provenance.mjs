/**
 * Vercel deployment provenance for the signed-in Preview gate.
 * Health JSON alone is not sufficient — the deployment must match project,
 * team, git SHA, branch, and hostname before any member credential is used.
 */
export const WORKFORCEAP_VERCEL_PROJECT_ID = 'prj_pfOpwxedCID96oF2hlaE5J7kbNid';
export const WORKFORCEAP_VERCEL_TEAM_ID = 'team_zTfMkbIIH6ADgy5Hy43MCM5K';
export const WORKFORCEAP_VERCEL_TEAM_SLUG = 'mabrown040-5207s-projects';
export const WORKFORCEAP_VERCEL_PROJECT_NAME = 'workforceap-beta';

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

function normalizeVercelToken(token) {
  let value = typeof token === 'string' ? token.trim() : '';
  if (/^bearer\s+/i.test(value)) value = value.replace(/^bearer\s+/i, '').trim();
  return value;
}

function deploymentListUrl({ projectId, teamId, slug, trustedSha, trustedBranch }) {
  const url = new URL('https://api.vercel.com/v7/deployments');
  url.searchParams.set('projectId', projectId);
  url.searchParams.set('limit', '20');
  if (teamId) url.searchParams.set('teamId', teamId);
  if (slug) url.searchParams.set('slug', slug);
  if (trustedSha) url.searchParams.set('sha', trustedSha);
  if (trustedBranch) url.searchParams.set('branch', trustedBranch);
  return url;
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
  const trimmed = normalizeVercelToken(token);
  if (!trimmed) {
    return { ok: false, reason: 'vercel_token_missing' };
  }
  const headers = { Authorization: `Bearer ${trimmed}` };
  const wanted = hostname.toLowerCase();
  const queries = [
    { label: 'v7-team-sha-branch', ...{ projectId, teamId, trustedSha, trustedBranch } },
    { label: 'v7-team-sha', projectId, teamId, trustedSha, trustedBranch: '' },
    { label: 'v7-team', projectId, teamId, trustedSha: '', trustedBranch: '' },
    {
      label: 'v7-slug-sha',
      projectId,
      slug: 'mabrown040-5207s-projects',
      trustedSha,
      trustedBranch,
    },
    { label: 'v7-sha', projectId, trustedSha, trustedBranch: '' },
  ];
  const attempts = [];
  let lastFailure = { ok: false, reason: 'deployment_not_found', attempts: '' };

  for (const query of queries) {
    const response = await fetchImpl(deploymentListUrl(query).toString(), { headers });
    attempts.push(`${query.label}:${response.status}`);
    const listed = await readVercelResponse(response);
    if (!listed.ok) {
      lastFailure = { ...listed, attempts: attempts.join(' ') };
      if (listed.status === 401) break;
      continue;
    }
    const deployments = listedDeployments(listed.payload).filter((deployment) => {
      if (!trustedSha) return true;
      const sha = String(
        deployment?.meta?.githubCommitSha ?? deployment?.gitSource?.sha ?? '',
      ).toLowerCase();
      return !sha || sha === trustedSha.toLowerCase();
    });
    const match = deployments.find((deployment) => deploymentHostnames(deployment).has(wanted));
    if (match) return { ok: true, deployment: match };
    if (deployments.length > 0) {
      return { ok: false, reason: 'hostname_mismatch', attempts: attempts.join(' ') };
    }
    lastFailure = { ok: false, reason: 'deployment_not_found', attempts: attempts.join(' ') };
  }

  const directUrls = [
    ['v13-team', teamId],
    ['v13', ''],
  ];
  for (const [label, directTeam] of directUrls) {
    const byUrl = new URL(
      `https://api.vercel.com/v13/deployments/${encodeURIComponent(hostname)}`,
    );
    if (directTeam) byUrl.searchParams.set('teamId', directTeam);
    const response = await fetchImpl(byUrl.toString(), { headers });
    attempts.push(`${label}:${response.status}`);
    const direct = await readVercelResponse(response);
    if (direct.ok) return { ok: true, deployment: direct.payload };
    lastFailure = { ...direct, attempts: attempts.join(' ') };
  }

  return { ...lastFailure, attempts: attempts.join(' ') };
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
      return `Vercel API returned HTTP ${result.status ?? 'unknown'}${result.code ? ` (${result.code})` : ''}${result.attempts ? ` [${result.attempts}]` : ''}.`;
    case 'github_token_missing':
      return 'GITHUB_TOKEN is required to read the Vercel GitHub App status when the Vercel API rejects the token.';
    case 'vercel_status_missing':
      return 'No successful Vercel commit status was found for the trusted SHA.';
    case 'vercel_status_untrusted':
      return 'The Vercel commit status does not point at the expected team and project on vercel.com.';
    case 'preview_deployment_missing':
      return 'No successful vercel[bot] Preview deployment was found for the trusted SHA.';
    case 'preview_host_mismatch':
      return 'The vercel[bot] Preview deployment is not served at the expected host.';
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

/**
 * The Vercel GitHub App writes this status. It is not the page's own health JSON.
 * Expected shape: https://vercel.com/<team-slug>/<project-name>/<deployment-id>
 */
export function evaluateVercelStatusUrl(targetUrl) {
  let url;
  try {
    url = new URL(String(targetUrl ?? ''));
  } catch {
    return { ok: false, reason: 'vercel_status_untrusted' };
  }
  if (url.protocol !== 'https:' || url.hostname !== 'vercel.com') {
    return { ok: false, reason: 'vercel_status_untrusted' };
  }
  const [slug, project, deploymentId] = url.pathname.split('/').filter(Boolean);
  if (
    slug !== WORKFORCEAP_VERCEL_TEAM_SLUG ||
    project !== WORKFORCEAP_VERCEL_PROJECT_NAME ||
    !deploymentId
  ) {
    return { ok: false, reason: 'wrong_vercel_project', slug, project };
  }
  return { ok: true, slug, project, deploymentId };
}

async function githubJson(url, token, fetchImpl) {
  const response = await fetchImpl(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!response.ok) {
    return { ok: false, reason: 'vercel_status_missing', status: response.status };
  }
  return { ok: true, payload: await response.json() };
}

export async function verifyGitHubVercelApp({
  repository,
  trustedSha,
  originHostname,
  githubToken,
  fetchImpl = globalThis.fetch,
}) {
  const token = typeof githubToken === 'string' ? githubToken.trim() : '';
  if (!token || !repository) {
    return { ok: false, reason: 'github_token_missing' };
  }
  const status = await githubJson(
    `https://api.github.com/repos/${repository}/commits/${trustedSha}/status`,
    token,
    fetchImpl,
  );
  if (!status.ok) return status;
  const vercelStatus = (status.payload.statuses ?? []).find(
    (entry) => entry?.context === 'Vercel' && entry?.state === 'success' && entry?.target_url,
  );
  if (!vercelStatus) return { ok: false, reason: 'vercel_status_missing' };
  const parsedStatus = evaluateVercelStatusUrl(vercelStatus.target_url);
  if (!parsedStatus.ok) return parsedStatus;

  const deployments = await githubJson(
    `https://api.github.com/repos/${repository}/deployments?sha=${trustedSha}&environment=Preview&per_page=20`,
    token,
    fetchImpl,
  );
  if (!deployments.ok) return { ok: false, reason: 'preview_deployment_missing' };
  const owned = (Array.isArray(deployments.payload) ? deployments.payload : []).filter(
    (deployment) => deployment?.creator?.login === 'vercel[bot]',
  );
  for (const deployment of owned) {
    const statuses = await githubJson(
      `https://api.github.com/repos/${repository}/deployments/${deployment.id}/statuses?per_page=5`,
      token,
      fetchImpl,
    );
    if (!statuses.ok) continue;
    const match = (Array.isArray(statuses.payload) ? statuses.payload : []).find((entry) => {
      if (entry?.state !== 'success' || typeof entry.environment_url !== 'string') return false;
      try {
        return new URL(entry.environment_url).hostname.toLowerCase() === originHostname.toLowerCase();
      } catch {
        return false;
      }
    });
    if (match) {
      return {
        ok: true,
        via: 'github-vercel-app',
        project: parsedStatus.project,
        slug: parsedStatus.slug,
        deploymentId: parsedStatus.deploymentId,
      };
    }
  }
  return { ok: false, reason: owned.length ? 'preview_host_mismatch' : 'preview_deployment_missing' };
}

export async function runVercelProvenanceGuard({
  origin,
  trustedSha,
  trustedBranch,
  vercelToken,
  githubToken = '',
  repository = '',
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
  if (fetched.ok) {
    return evaluateVercelProvenance({
      deployment: fetched.deployment,
      trustedSha,
      trustedBranch,
      expectedProjectId,
      originHostname: parsed.hostname,
    });
  }
  if (fetched.status === 403) {
    const github = await verifyGitHubVercelApp({
      repository,
      trustedSha,
      originHostname: parsed.hostname,
      githubToken,
      fetchImpl,
    });
    if (!github.ok) return { ...github, attempts: fetched.attempts };
    return github;
  }
  return fetched;
}
