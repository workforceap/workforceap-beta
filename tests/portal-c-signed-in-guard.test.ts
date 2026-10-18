import { describe, expect, it } from 'vitest';
import { evaluateHealthPayload } from '../scripts/lib/portal-audit-health-gate.mjs';
import {
  DEMO_SUPABASE_REF,
  createHealthGateFetch,
  describeGuardConfigError,
  healthGateHeaders,
  resolveTargetOrigin,
  resolveTrustedSha,
  runSignedInDestinationGuard,
} from '../scripts/lib/portal-c-signed-in-guard.mjs';
import {
  WORKFORCEAP_VERCEL_PROJECT_ID,
  evaluateVercelProvenance,
  parseHttpsOrigin,
  runVercelProvenanceGuard,
} from '../scripts/lib/portal-c-vercel-provenance.mjs';

const TRUSTED_SHA = 'f630cf6505775ea943acd9c560d1eedc3dd6a918';
const TRUSTED_BRANCH = 'feature/portal-c-b0-safety-net';

function demoHealthBody(sha: string) {
  return JSON.stringify({
    version: sha.slice(0, 7),
    supabaseRef: DEMO_SUPABASE_REF,
    prismaProject: 'demo',
  });
}

function readyDeployment(overrides: Record<string, unknown> = {}) {
  return {
    readyState: 'READY',
    projectId: WORKFORCEAP_VERCEL_PROJECT_ID,
    url: 'workforceap-beta-git-feature.vercel.app',
    alias: ['workforceap-beta-git-feature.vercel.app'],
    meta: {
      githubCommitSha: TRUSTED_SHA,
      githubCommitRef: TRUSTED_BRANCH,
    },
    ...overrides,
  };
}

describe('portal-c signed-in guard', () => {
  it('requires a full 40-hex trusted SHA', () => {
    expect(
      resolveTrustedSha({ PORTAL_C_TRUSTED_SHA: TRUSTED_SHA } as unknown as NodeJS.ProcessEnv),
    ).toBe(TRUSTED_SHA);
    expect(resolveTrustedSha({ DEPLOY_SHA: TRUSTED_SHA } as unknown as NodeJS.ProcessEnv)).toBe(
      TRUSTED_SHA,
    );
    expect(
      resolveTrustedSha({ PORTAL_C_TRUSTED_SHA: 'f630cf6' } as unknown as NodeJS.ProcessEnv),
    ).toBeNull();
    expect(describeGuardConfigError('missing_sha')).toMatch(/40-hex/);
  });

  it('normalizes the preview origin and never requires logging it', () => {
    expect(
      resolveTargetOrigin({
        PLAYWRIGHT_BASE_URL: 'https://example.vercel.app/\n',
      } as unknown as NodeJS.ProcessEnv),
    ).toBe('https://example.vercel.app');
    expect(resolveTargetOrigin({} as unknown as NodeJS.ProcessEnv)).toBe('');
    expect(describeGuardConfigError('missing_origin')).toMatch(/PLAYWRIGHT_BASE_URL/);
  });

  it('refuses an http URL before any network call or credential use', async () => {
    let calls = 0;
    const outcome = await runSignedInDestinationGuard({
      origin: 'http://workforceap-beta.vercel.app',
      trustedSha: TRUSTED_SHA,
      trustedBranch: TRUSTED_BRANCH,
      vercelToken: 'token',
      fetchImpl: (async () => {
        calls += 1;
        throw new Error('fetch must not run');
      }) as unknown as typeof fetch,
      log: () => {},
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.stage).toBe('origin');
    expect(calls).toBe(0);
  });

  it('sends the Vercel bypass secret only to vercel.app health probes', () => {
    const vercel = healthGateHeaders({
      origin: 'https://workforceap-beta-git-feature.vercel.app',
      bypassSecret: 's3cret',
    });
    expect(vercel['x-vercel-protection-bypass' as keyof typeof vercel]).toBe('s3cret');

    const local = healthGateHeaders({
      origin: 'http://localhost:3000',
      bypassSecret: 's3cret',
    });
    expect(local['x-vercel-protection-bypass' as keyof typeof local]).toBeUndefined();
  });

  it('wraps fetch with those headers and still targets DEMO', async () => {
    expect(DEMO_SUPABASE_REF).toBe('esbdrgaonplpvzmtrdhw');
    const calls: Array<{ url: string; headers: Record<string, string> }> = [];
    const fetchImpl = async (url: string, init: { headers?: Record<string, string> }) => {
      calls.push({ url, headers: init.headers ?? {} });
      return {
        status: 200,
        headers: { get: () => null },
        text: async () => '',
      };
    };
    const wrapped = createHealthGateFetch({
      origin: 'https://example.vercel.app',
      bypassSecret: 's3cret',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await wrapped('https://example.vercel.app/api/health', { method: 'GET', headers: { accept: 'application/json' } });
    expect(calls[0]?.headers['x-vercel-protection-bypass']).toBe('s3cret');
  });

  it('rejects the wrong Vercel project via API provenance', () => {
    const outcome = evaluateVercelProvenance({
      deployment: readyDeployment({ projectId: 'prj_foreign' }),
      trustedSha: TRUSTED_SHA,
      trustedBranch: TRUSTED_BRANCH,
      originHostname: 'workforceap-beta-git-feature.vercel.app',
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.reason).toBe('wrong_vercel_project');
  });

  it('rejects a foreign hostname even when metadata claims the trusted SHA', () => {
    const outcome = evaluateVercelProvenance({
      deployment: readyDeployment(),
      trustedSha: TRUSTED_SHA,
      trustedBranch: TRUSTED_BRANCH,
      originHostname: 'evil-host.example.com',
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.reason).toBe('hostname_mismatch');
  });

  it('refuses login when health reports the wrong Supabase ref', async () => {
    const origin = 'https://workforceap-beta-git-feature.vercel.app';
    const fetchImpl = async (url: string) => {
      if (url.includes('api.vercel.com')) {
        return {
          ok: true,
          status: 200,
          json: async () => readyDeployment(),
        };
      }
      if (url.endsWith('/api/health')) {
        return {
          status: 200,
          headers: { get: () => null },
          text: async () =>
            JSON.stringify({
              version: TRUSTED_SHA.slice(0, 7),
              supabaseRef: 'jqddnyuszufndwwezdwp',
              prismaProject: 'prod',
            }),
        };
      }
      throw new Error(`unexpected fetch ${url}`);
    };

    const outcome = await runSignedInDestinationGuard({
      origin,
      trustedSha: TRUSTED_SHA,
      trustedBranch: TRUSTED_BRANCH,
      vercelToken: 'token',
      bypassSecret: '',
      timeoutMs: 500,
      intervalMs: 10,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      log: () => {},
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.stage).toBe('health');
    const judged = evaluateHealthPayload({
      status: 200,
      body: JSON.stringify({
        version: TRUSTED_SHA.slice(0, 7),
        supabaseRef: 'jqddnyuszufndwwezdwp',
        prismaProject: 'prod',
      }),
      trustedSha: TRUSTED_SHA,
      mode: 'isolated_preview',
    });
    expect(judged).toMatchObject({ ok: false, reason: 'supabase_ref_mismatch' });
  });

  it('refuses a listed deployment that claims the SHA on a different host', async () => {
    const calls: string[] = [];
    const outcome = await runVercelProvenanceGuard({
      origin: 'https://evil-host.example.com',
      trustedSha: TRUSTED_SHA,
      trustedBranch: TRUSTED_BRANCH,
      vercelToken: 'token',
      expectedProjectId: WORKFORCEAP_VERCEL_PROJECT_ID,
      fetchImpl: (async (url: string) => {
        calls.push(url);
        return {
          ok: true,
          status: 200,
          json: async () => ({ deployments: [readyDeployment()] }),
        };
      }) as unknown as typeof fetch,
    });
    expect(outcome.ok).toBe(false);
    expect((outcome as { reason?: string }).reason).toBe('hostname_mismatch');
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('/v7/deployments');
    expect(calls[0]).toContain(`projectId=${WORKFORCEAP_VERCEL_PROJECT_ID}`);
    expect(calls[0]).toContain(`sha=${TRUSTED_SHA}`);
    expect(calls[0]).toContain('teamId=team_zTfMkbIIH6ADgy5Hy43MCM5K');
  });

  it('uses the Vercel GitHub App status when the API token is forbidden', async () => {
    const origin = 'https://workforceap-beta-git-feature.vercel.app';
    const calls: string[] = [];
    const outcome = await runVercelProvenanceGuard({
      origin,
      trustedSha: TRUSTED_SHA,
      trustedBranch: TRUSTED_BRANCH,
      vercelToken: 'token',
      githubToken: 'gh',
      repository: 'workforceap/workforceap-beta',
      expectedProjectId: WORKFORCEAP_VERCEL_PROJECT_ID,
      fetchImpl: (async (url: string) => {
        calls.push(url);
        if (url.includes('api.vercel.com')) {
          return { ok: false, status: 403, json: async () => ({ error: { code: 'forbidden' } }) };
        }
        if (url.includes('/commits/') && url.endsWith('/status')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              statuses: [
                {
                  context: 'Vercel',
                  state: 'success',
                  target_url:
                    'https://vercel.com/mabrown040-5207s-projects/workforceap-beta/dpl_example',
                },
              ],
            }),
          };
        }
        if (url.includes('/deployments?')) {
          return {
            ok: true,
            status: 200,
            json: async () => [{ id: 42, creator: { login: 'vercel[bot]' } }],
          };
        }
        if (url.includes('/deployments/42/statuses')) {
          return {
            ok: true,
            status: 200,
            json: async () => [
              { state: 'success', environment_url: origin },
            ],
          };
        }
        throw new Error(`unexpected ${url}`);
      }) as unknown as typeof fetch,
    });
    expect(outcome.ok).toBe(true);
    expect((outcome as { via?: string }).via).toBe('github-vercel-app');
    expect(calls.some((url) => url.includes('/login'))).toBe(false);
  });

  it('refuses a forbidden token when the Vercel status names another project', async () => {
    const outcome = await runVercelProvenanceGuard({
      origin: 'https://workforceap-beta-git-feature.vercel.app',
      trustedSha: TRUSTED_SHA,
      trustedBranch: TRUSTED_BRANCH,
      vercelToken: 'token',
      githubToken: 'gh',
      repository: 'workforceap/workforceap-beta',
      expectedProjectId: WORKFORCEAP_VERCEL_PROJECT_ID,
      fetchImpl: (async (url: string) => {
        if (url.includes('api.vercel.com')) {
          return { ok: false, status: 403, json: async () => ({ error: { code: 'forbidden' } }) };
        }
        if (url.endsWith('/status')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              statuses: [
                {
                  context: 'Vercel',
                  state: 'success',
                  target_url: 'https://vercel.com/other-team/other-project/dpl_example',
                },
              ],
            }),
          };
        }
        throw new Error(`unexpected ${url}`);
      }) as unknown as typeof fetch,
    });
    expect(outcome.ok).toBe(false);
    expect((outcome as { reason?: string }).reason).toBe('wrong_vercel_project');
  });

  it('refuses a forbidden token when the Preview host belongs to a different deployment', async () => {
    const outcome = await runVercelProvenanceGuard({
      origin: 'https://evil-host.example.com',
      trustedSha: TRUSTED_SHA,
      trustedBranch: TRUSTED_BRANCH,
      vercelToken: 'token',
      githubToken: 'gh',
      repository: 'workforceap/workforceap-beta',
      expectedProjectId: WORKFORCEAP_VERCEL_PROJECT_ID,
      fetchImpl: (async (url: string) => {
        if (url.includes('api.vercel.com')) {
          return { ok: false, status: 403, json: async () => ({ error: { code: 'forbidden' } }) };
        }
        if (url.endsWith('/status')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              statuses: [
                {
                  context: 'Vercel',
                  state: 'success',
                  target_url:
                    'https://vercel.com/mabrown040-5207s-projects/workforceap-beta/dpl_example',
                },
              ],
            }),
          };
        }
        if (url.includes('/deployments?')) {
          return {
            ok: true,
            status: 200,
            json: async () => [{ id: 7, creator: { login: 'vercel[bot]' } }],
          };
        }
        if (url.includes('/deployments/7/statuses')) {
          return {
            ok: true,
            status: 200,
            json: async () => [
              {
                state: 'success',
                environment_url: 'https://workforceap-beta-real.vercel.app',
              },
            ],
          };
        }
        throw new Error(`unexpected ${url}`);
      }) as unknown as typeof fetch,
    });
    expect(outcome.ok).toBe(false);
    expect((outcome as { reason?: string }).reason).toBe('preview_host_mismatch');
  });

  it('refuses login when Vercel provenance fails before health', async () => {
    const origin = 'https://workforceap-beta-git-feature.vercel.app';
    const vercel = await runVercelProvenanceGuard({
      origin,
      trustedSha: TRUSTED_SHA,
      trustedBranch: TRUSTED_BRANCH,
      vercelToken: 'token',
      expectedProjectId: WORKFORCEAP_VERCEL_PROJECT_ID,
      fetchImpl: (async () => ({
        ok: true,
        status: 200,
        json: async () => readyDeployment({ projectId: 'prj_foreign' }),
      })) as unknown as typeof fetch,
    });
    expect(vercel.ok).toBe(false);
    expect((vercel as { reason?: string }).reason).toBe('wrong_vercel_project');
  });
});
