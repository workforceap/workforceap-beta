import { describe, expect, it } from 'vitest';
import {
  DEMO_SUPABASE_REF,
  createHealthGateFetch,
  describeGuardConfigError,
  healthGateHeaders,
  resolveTargetOrigin,
  resolveTrustedSha,
} from '../scripts/lib/portal-c-signed-in-guard.mjs';

const TRUSTED_SHA = 'f630cf6505775ea943acd9c560d1eedc3dd6a918';

describe('portal-c signed-in guard', () => {
  it('requires a full 40-hex trusted SHA', () => {
    expect(resolveTrustedSha({ PORTAL_C_TRUSTED_SHA: TRUSTED_SHA })).toBe(TRUSTED_SHA);
    expect(resolveTrustedSha({ DEPLOY_SHA: TRUSTED_SHA })).toBe(TRUSTED_SHA);
    expect(resolveTrustedSha({ PORTAL_C_TRUSTED_SHA: 'f630cf6' })).toBeNull();
    expect(describeGuardConfigError('missing_sha')).toMatch(/40-hex/);
  });

  it('normalizes the preview origin and never requires logging it', () => {
    expect(resolveTargetOrigin({ PLAYWRIGHT_BASE_URL: 'https://example.vercel.app/\n' })).toBe(
      'https://example.vercel.app',
    );
    expect(resolveTargetOrigin({})).toBe('');
    expect(describeGuardConfigError('missing_origin')).toMatch(/PLAYWRIGHT_BASE_URL/);
  });

  it('sends the Vercel bypass secret only to vercel.app health probes', () => {
    const vercel = healthGateHeaders({
      origin: 'https://workforceap-beta-git-feature.vercel.app',
      bypassSecret: 's3cret',
    });
    expect(vercel['x-vercel-protection-bypass']).toBe('s3cret');

    const local = healthGateHeaders({
      origin: 'http://localhost:3000',
      bypassSecret: 's3cret',
    });
    expect(local['x-vercel-protection-bypass']).toBeUndefined();
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
});
