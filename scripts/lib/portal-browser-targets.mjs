import { evaluateHealthPayload } from './portal-audit-health-gate.mjs';
import { validateAcceptanceIdentity } from './portal-acceptance-lanes.mjs';

const REPOSITORY = 'workforceap/workforceap-beta';
// Deployment-specific host only. Branch/project aliases must never become a baseline.
const IMMUTABLE_HOST = /^workforceap-beta-[a-z0-9]{9}-mabrown040-5207s-projects\.vercel\.app$/;

export function verifiedPreviewOrigin(deployment, statuses, expectedSha) {
  if (deployment?.sha !== expectedSha || deployment.environment !== 'Preview' || deployment.production_environment !== false || deployment.creator?.login !== 'vercel[bot]') throw new Error('Preview deployment metadata does not match the trusted SHA');
  if (!Array.isArray(statuses) || statuses[0]?.state !== 'success' || statuses[0]?.creator?.login !== 'vercel[bot]') throw new Error('Preview deployment has no current successful Vercel status');
  const url = new URL(statuses[0].environment_url);
  if (url.protocol !== 'https:' || !IMMUTABLE_HOST.test(url.hostname) || url.port || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('A deployment-specific immutable Preview origin is required');
  return url.origin;
}

export async function verifyBrowserTargets(input, readApi, fetchHealth) {
  validateAcceptanceIdentity(input.identity);
  const { baselineSha, deployedSha } = input.identity;
  if (baselineSha === deployedSha) throw new Error('Baseline must be a distinct strict ancestor of the candidate');
  const comparison = await readApi(`repos/${REPOSITORY}/compare/${baselineSha}...${deployedSha}?per_page=1`);
  if (comparison?.status !== 'ahead' || comparison.base_commit?.sha !== baselineSha || comparison.merge_base_commit?.sha !== baselineSha || !Number.isSafeInteger(comparison.ahead_by) || comparison.ahead_by <= 0) {
    throw new Error('GitHub comparison does not prove the baseline is a strict candidate ancestor');
  }
  /** @type {Record<string, {origin: string, sha: string, githubDeploymentId: number, observedAt: string}>} */
  const targets = {};
  for (const kind of ['baseline', 'candidate']) {
    const id = input[`${kind}DeploymentId`];
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error('A positive GitHub deployment ID is required');
    const sha = input.identity[kind === 'baseline' ? 'baselineSha' : 'deployedSha'];
    const deployment = await readApi(`repos/${REPOSITORY}/deployments/${id}`);
    const statuses = await readApi(`repos/${REPOSITORY}/deployments/${id}/statuses?per_page=100`);
    const origin = verifiedPreviewOrigin(deployment, statuses, sha);
    const health = await fetchHealth(origin);
    const outcome = evaluateHealthPayload({ ...health, trustedSha: sha, mode: 'isolated_preview' });
    if (!outcome.ok) throw new Error(`Preview health refused: ${outcome.reason}`);
    targets[kind] = { origin, sha, githubDeploymentId: id, observedAt: new Date().toISOString() };
  }
  if (targets.baseline.origin === targets.candidate.origin) throw new Error('Baseline and candidate must be independent deployments');
  return targets;
}

/** Local-only registry companion: no baseline, account login or hosted credentials. */
export function validateLocalFixtureOrigin(origin) {
  const url = new URL(origin);
  if (url.origin !== origin || url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || !url.port || url.username || url.password) throw new Error('Local fixture companion requires an explicit loopback HTTP origin and port');
  return url.origin;
}

export function verifyLocalFixtureHealth(identity, origin, health, { ownedDisconnectedServer = false } = {}) {
  validateAcceptanceIdentity(identity);
  validateLocalFixtureOrigin(origin);
  if (identity.controlSha !== identity.deployedSha) throw new Error('Local fixture code must be the same trusted candidate commit');
  const result = evaluateHealthPayload({ ...health, trustedSha: identity.deployedSha, mode: 'local' });
  if (!result.ok) throw new Error('Local fixture application SHA is not verified');
  const body = JSON.parse(health.body);
  // Current health labels an absent datasource "unknown". Accept that only for
  // the companion's owned subprocess with an explicit credential-free environment.
  const ownedDisconnected = ownedDisconnectedServer === true && body.supabaseRef === null && body.prismaProject === 'unknown';
  if (!ownedDisconnected && ((body.supabaseRef && body.supabaseRef !== identity.projectRef) || (body.prismaProject && !['demo', 'unset'].includes(body.prismaProject)))) throw new Error('Local fixture server must be disconnected or wired only to DEMO');
  return { origin, sha: identity.deployedSha, observedAt: new Date().toISOString() };
}

/** Credentials are read only after target proof; no E2E/PREVIEW fallback. */
export function acceptanceCredentials(role, env, runId) {
  if (!['member', 'admin', 'counselor', 'employer', 'partner'].includes(role)) throw new Error('Unsupported acceptance role');
  const upper = role.toUpperCase();
  const prefix = env[`FIVE_ROLE_QA_${upper}_EMAIL`] ? 'FIVE_ROLE_QA' : 'DEMO_QA';
  const email = env[`${prefix}_${upper}_EMAIL`]?.trim().toLowerCase();
  const password = env[`${prefix}_${upper}_PASSWORD`]?.replace(/\r$/, '');
  const userId = env[`${prefix}_${upper}_ID`]?.trim();
  if (!email || !password || !userId) throw new Error(`Explicit synthetic ${role} email, password and ID are required`);
  const expected = prefix === 'FIVE_ROLE_QA' ? `wap6-qa-${runId}-${role}@example.com` : `${role}-test@workforceap.org`;
  if (email !== expected || (prefix === 'FIVE_ROLE_QA' && (!/^\d+-1$/.test(runId ?? '') || env.FIVE_ROLE_QA_RUN_ID !== runId))) throw new Error('Exact run-owned or dedicated synthetic identity required');
  return { email, password, userId };
}
