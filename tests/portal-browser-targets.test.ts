import { describe, expect, it, vi } from 'vitest';
import { acceptanceCredentials, verifiedPreviewOrigin, verifyBrowserTargets, validateLocalFixtureOrigin, verifyLocalFixtureHealth } from '../scripts/lib/portal-browser-targets.mjs';

const sha = 'a'.repeat(40);
const deployment = { sha, environment: 'Preview', production_environment: false, creator: { login: 'vercel[bot]' } };
const statuses = [{ state: 'success', creator: { login: 'vercel[bot]' }, environment_url: 'https://workforceap-beta-abcd12345-mabrown040-5207s-projects.vercel.app' }];

describe('immutable deployment destination before credentials', () => {
  it('accepts current successful independently registered exact-SHA Preview', () => {
    expect(verifiedPreviewOrigin(deployment, statuses, sha)).toBe(statuses[0].environment_url);
  });
  it.each(['https://workforceap.org', 'https://workforceap-beta-git-preview-mabrown040-5207s-projects.vercel.app', 'https://user:secret@workforceap-beta-abcd12345-mabrown040-5207s-projects.vercel.app', statuses[0].environment_url + '?secret=value'])('rejects production, aliases and credential-bearing targets: %s', url => {
    expect(() => verifiedPreviewOrigin(deployment, [{ ...statuses[0], environment_url: url }], sha)).toThrow();
  });
  it('rejects stale commits, non-Vercel creators and failure after earlier success', () => {
    expect(() => verifiedPreviewOrigin({ ...deployment, sha: 'b'.repeat(40) }, statuses, sha)).toThrow();
    expect(() => verifiedPreviewOrigin(deployment, [{ ...statuses[0], creator: { login: 'some-user' } }], sha)).toThrow();
    expect(() => verifiedPreviewOrigin(deployment, [{ ...statuses[0], state: 'failure' }, ...statuses], sha)).toThrow();
  });
  it('fails before health when API evidence cannot be read', async () => {
    const health = vi.fn();
    const identity = { runId: 'run-42', projectRef: 'esbdrgaonplpvzmtrdhw', organizationId: 'org-42', controlSha: sha, deployedSha: sha, baselineSha: 'b'.repeat(40), planHash: 'd'.repeat(64) };
    await expect(verifyBrowserTargets({ identity, baselineDeploymentId: 1, candidateDeploymentId: 2 }, async () => { throw new Error('API unavailable'); }, health)).rejects.toThrow();
    expect(health).not.toHaveBeenCalled();
  });
  it('rejects identical commits before deployment or health requests', async () => {
    const identity = { runId: '42-1', projectRef: 'esbdrgaonplpvzmtrdhw', organizationId: 'org-42', controlSha: sha, deployedSha: sha, baselineSha: sha, planHash: 'd'.repeat(64) };
    const readApi = vi.fn();
    const health = vi.fn();
    await expect(verifyBrowserTargets({ identity, baselineDeploymentId: 1, candidateDeploymentId: 2 }, readApi, health)).rejects.toThrow('distinct strict ancestor');
    expect(readApi).not.toHaveBeenCalled();
    expect(health).not.toHaveBeenCalled();
  });
  it.each([
    ['diverged', { status: 'diverged' }],
    ['reversed', { status: 'behind' }],
    ['identical', { status: 'identical' }],
    ['wrong base', { base_commit: { sha } }],
    ['unrelated merge base', { merge_base_commit: { sha: 'c'.repeat(40) } }],
    ['zero ahead', { ahead_by: 0 }],
    ['negative ahead', { ahead_by: -1 }],
    ['untyped ahead', { ahead_by: '1' }],
    ['missing merge base', { merge_base_commit: undefined }],
  ])('rejects %s comparison evidence before deployment or health requests', async (_name, invalid) => {
    const identity = { runId: '42-1', projectRef: 'esbdrgaonplpvzmtrdhw', organizationId: 'org-42', controlSha: sha, deployedSha: sha, baselineSha: 'b'.repeat(40), planHash: 'd'.repeat(64) };
    const readApi = vi.fn(async () => ({ status: 'ahead', ahead_by: 2, base_commit: { sha: identity.baselineSha }, merge_base_commit: { sha: identity.baselineSha }, ...invalid }));
    const health = vi.fn();
    await expect(verifyBrowserTargets({ identity, baselineDeploymentId: 1, candidateDeploymentId: 2 }, readApi, health)).rejects.toThrow('strict candidate ancestor');
    expect(readApi).toHaveBeenCalledExactlyOnceWith(`repos/workforceap/workforceap-beta/compare/${identity.baselineSha}...${sha}?per_page=1`);
    expect(health).not.toHaveBeenCalled();
  });
  it('does not fall back to generic shared E2E credentials or mix prefixes', () => {
    expect(() => acceptanceCredentials('member', { E2E_MEMBER_EMAIL: 'member-test@workforceap.org', E2E_MEMBER_PASSWORD: 'test-only', E2E_MEMBER_ID: 'id' }, '42-1')).toThrow();
    expect(() => acceptanceCredentials('member', { FIVE_ROLE_QA_MEMBER_EMAIL: 'qa@example.invalid', DEMO_QA_MEMBER_PASSWORD: 'test-only', DEMO_QA_MEMBER_ID: 'id' }, '42-1')).toThrow();
    expect(acceptanceCredentials('member', { FIVE_ROLE_QA_RUN_ID: '42-1', FIVE_ROLE_QA_MEMBER_EMAIL: 'wap6-qa-42-1-member@example.com', FIVE_ROLE_QA_MEMBER_PASSWORD: 'test-only', FIVE_ROLE_QA_MEMBER_ID: 'id' }, '42-1').userId).toBe('id');
    expect(() => acceptanceCredentials('member', { DEMO_QA_MEMBER_EMAIL: 'real-person@workforceap.org', DEMO_QA_MEMBER_PASSWORD: 'test-only', DEMO_QA_MEMBER_ID: 'id' }, '42-1')).toThrow();
  });

  it('refreshes both independent origins and rejects a matching SHA wired to production', async () => {
    const identity = { runId: '42-1', projectRef: 'esbdrgaonplpvzmtrdhw', organizationId: 'org-42', controlSha: sha, deployedSha: sha, baselineSha: 'b'.repeat(40), planHash: 'd'.repeat(64) };
    const readApi = vi.fn(async (path: string) => {
      if (path.includes('/compare/')) return { status: 'ahead', ahead_by: 2, base_commit: { sha: identity.baselineSha }, merge_base_commit: { sha: identity.baselineSha } };
      const baseline = path.includes('/deployments/1');
      return path.includes('/statuses')
        ? [{ ...statuses[0], environment_url: statuses[0].environment_url.replace('abcd12345', baseline ? 'base12345' : 'cand12345') }]
        : { ...deployment, sha: baseline ? identity.baselineSha : identity.deployedSha };
    });
    const healthy = vi.fn(async (origin: string) => ({ status: 200, body: JSON.stringify({ version: origin.includes('base12345') ? identity.baselineSha : sha, supabaseRef: identity.projectRef, prismaProject: 'demo' }) }));
    const targets = await verifyBrowserTargets({ identity, baselineDeploymentId: 1, candidateDeploymentId: 2 }, readApi, healthy);
    expect(readApi).toHaveBeenNthCalledWith(1, `repos/workforceap/workforceap-beta/compare/${identity.baselineSha}...${sha}?per_page=1`);
    expect(healthy).toHaveBeenCalledTimes(2);
    expect(targets.baseline.origin).not.toBe(targets.candidate.origin);
    await expect(verifyBrowserTargets({ identity, baselineDeploymentId: 1, candidateDeploymentId: 2 }, readApi, async () => ({ status: 200, body: JSON.stringify({ version: identity.baselineSha, supabaseRef: 'jqddnyuszufndwwezdwp', prismaProject: 'prod' }) }))).rejects.toThrow('health refused');
  });
  it('allows local-only fixtures only on exact loopback candidate code without production wiring', () => {
    const identity = { runId: '42-1', projectRef: 'esbdrgaonplpvzmtrdhw', organizationId: 'org-42', controlSha: sha, deployedSha: sha, baselineSha: 'b'.repeat(40), planHash: 'd'.repeat(64) };
    const health = { status: 200, body: JSON.stringify({ version: sha, supabaseRef: identity.projectRef, prismaProject: 'demo' }) };
    expect(verifyLocalFixtureHealth(identity, 'http://127.0.0.1:3107', health).sha).toBe(sha);
    expect(() => validateLocalFixtureOrigin('https://workforceap.org')).toThrow('loopback');
    expect(() => verifyLocalFixtureHealth({ ...identity, controlSha: 'f'.repeat(40) }, 'http://127.0.0.1:3107', health)).toThrow('same trusted');
    expect(() => verifyLocalFixtureHealth(identity, 'http://127.0.0.1:3107', { ...health, body: JSON.stringify({ version: sha, prismaProject: 'prod' }) })).toThrow('DEMO');
    const disconnected = { status: 200, body: JSON.stringify({ version: sha, supabaseRef: null, prismaProject: 'unknown' }) };
    expect(() => verifyLocalFixtureHealth(identity, 'http://127.0.0.1:3107', disconnected)).toThrow('DEMO');
    expect(verifyLocalFixtureHealth(identity, 'http://127.0.0.1:3107', disconnected, { ownedDisconnectedServer: true }).sha).toBe(sha);
    for (const patch of [{ supabaseRef: identity.projectRef }, { prismaProject: 'prod' }, { supabaseRef: 'jqddnyuszufndwwezdwp' }]) expect(() => verifyLocalFixtureHealth(identity, 'http://127.0.0.1:3107', { status: 200, body: JSON.stringify({ version: sha, supabaseRef: null, prismaProject: 'unknown', ...patch }) }, { ownedDisconnectedServer: true })).toThrow('DEMO');
  });
});
