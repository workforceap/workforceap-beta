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
    expect(vercel.reason).toBe('wrong_vercel_project');
  });
});
