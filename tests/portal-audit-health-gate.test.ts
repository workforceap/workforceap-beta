import { describe, expect, it } from 'vitest';
import {
  DEFAULT_HEALTH_GATE_INTERVAL_MS,
  DEFAULT_HEALTH_GATE_TIMEOUT_MS,
  describeHealthGateFailure,
  evaluateHealthPayload,
  expectedSupabaseRefForMode,
  formatHealthGateAttempt,
  normalizeOriginInput,
  normalizeTrustedSha,
  resolveHealthGateTarget,
  waitForTrustedHealth,
} from '../scripts/lib/portal-audit-health-gate.mjs';

const DEMO_REF = 'esbdrgaonplpvzmtrdhw';
const PROD_REF = 'jqddnyuszufndwwezdwp';
const TRUSTED_SHA = 'f630cf6505775ea943acd9c560d1eedc3dd6a918';
const PREVIEW_ORIGIN = 'https://workforceap-beta-git-preview-example.vercel.app';
const PRODUCTION_ORIGIN = 'https://www.workforceap.org';

function healthBody(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    status: 'ok',
    probe: 'live',
    version: 'f630cf6',
    supabaseRef: DEMO_REF,
    prismaProject: 'demo',
    timestamp: '2026-09-17T00:00:00.000Z',
    ...overrides,
  });
}

type FakeResponse = {
  status: number;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
};

function response(status: number, body: string, headers: Record<string, string> = {}): FakeResponse {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    status,
    headers: { get: (name: string) => lower[name.toLowerCase()] ?? null },
    text: async () => body,
  };
}

type Scripted = FakeResponse | (() => never);

function scriptedFetch(responses: Scripted[]) {
  const calls: Array<{ url: string; init: Record<string, unknown> }> = [];
  const fetchImpl = async (url: string, init: Record<string, unknown>) => {
    calls.push({ url, init });
    const next = responses.shift();
    if (!next) throw new Error('fetch called more often than scripted');
    if (typeof next === 'function') return next();
    return next;
  };
  // The gate types its injected fetch as the global `fetch`; the fake only needs the
  // (url, init) shape the gate actually uses.
  return { fetchImpl: fetchImpl as unknown as typeof fetch, calls };
}

function fakeClock() {
  let t = 0;
  const sleeps: number[] = [];
  return {
    now: () => t,
    sleep: async (ms: number) => {
      sleeps.push(ms);
      t += ms;
    },
    sleeps,
  };
}

describe('normalizeOriginInput', () => {
  it('strips pasted whitespace, CR/LF, and trailing slashes', () => {
    expect(normalizeOriginInput(`  ${PREVIEW_ORIGIN}/\r\n`)).toBe(PREVIEW_ORIGIN);
    expect(normalizeOriginInput(`${PREVIEW_ORIGIN}///`)).toBe(PREVIEW_ORIGIN);
    expect(normalizeOriginInput(`\n${PREVIEW_ORIGIN}\n`)).toBe(PREVIEW_ORIGIN);
  });

  it('turns non-strings into an empty origin', () => {
    expect(normalizeOriginInput(undefined)).toBe('');
    expect(normalizeOriginInput(null)).toBe('');
    expect(normalizeOriginInput(42)).toBe('');
  });
});

describe('expectedSupabaseRefForMode', () => {
  it('binds each trusted policy to exactly one Supabase project', () => {
    expect(expectedSupabaseRefForMode('isolated_preview')).toBe(DEMO_REF);
    expect(expectedSupabaseRefForMode(' Production_Canary ')).toBe(PROD_REF);
  });

  it('places no project constraint on local runs or unknown policies', () => {
    expect(expectedSupabaseRefForMode('local')).toBeNull();
    expect(expectedSupabaseRefForMode('anything-else')).toBeNull();
    expect(expectedSupabaseRefForMode(undefined)).toBeNull();
  });
});

describe('resolveHealthGateTarget', () => {
  it('accepts a pasted preview secret with a newline and trailing slash once it matches the trusted origin', () => {
    const target = resolveHealthGateTarget({
      mode: 'isolated_preview',
      baseURL: `${PREVIEW_ORIGIN}/\n`,
      trustedPreviewOrigin: `${PREVIEW_ORIGIN}\r\n`,
    });
    expect(target.ok).toBe(true);
    expect(target.origin).toBe(PREVIEW_ORIGIN);
    expect(target.targetClass).toBe('isolated_preview');
  });

  it('refuses a production alias under the isolated preview policy', () => {
    const target = resolveHealthGateTarget({
      mode: 'isolated_preview',
      baseURL: PRODUCTION_ORIGIN,
      trustedPreviewOrigin: PRODUCTION_ORIGIN,
    });
    expect(target.ok).toBe(false);
    expect(target.errors).toContain('preview_target_must_not_be_production');
  });

  it('refuses a target that differs from the trusted preview origin', () => {
    const target = resolveHealthGateTarget({
      mode: 'isolated_preview',
      baseURL: PREVIEW_ORIGIN,
      trustedPreviewOrigin: 'https://some-other-preview.vercel.app',
    });
    expect(target.ok).toBe(false);
    expect(target.errors).toContain('target_does_not_match_trusted_preview');
  });

  it('refuses plain-http previews', () => {
    const insecure = PREVIEW_ORIGIN.replace('https://', 'http://');
    const target = resolveHealthGateTarget({
      mode: 'isolated_preview',
      baseURL: insecure,
      trustedPreviewOrigin: insecure,
    });
    expect(target.ok).toBe(false);
    expect(target.errors).toContain('preview_target_must_use_https');
  });

  it('pins the production canary to the allow-listed production origins', () => {
    expect(resolveHealthGateTarget({ mode: 'production_canary', baseURL: `${PRODUCTION_ORIGIN}/` }).ok).toBe(true);
    const preview = resolveHealthGateTarget({ mode: 'production_canary', baseURL: PREVIEW_ORIGIN });
    expect(preview.ok).toBe(false);
    expect(preview.errors).toContain('production_target_not_allowlisted');
  });
});

describe('normalizeTrustedSha', () => {
  it('accepts only a full 40-hex commit and lowercases it', () => {
    expect(normalizeTrustedSha(` ${TRUSTED_SHA.toUpperCase()} `)).toBe(TRUSTED_SHA);
    expect(normalizeTrustedSha('f630cf6')).toBeNull();
    expect(normalizeTrustedSha('')).toBeNull();
    expect(normalizeTrustedSha('g'.repeat(40))).toBeNull();
    expect(normalizeTrustedSha(undefined)).toBeNull();
  });
});

describe('evaluateHealthPayload', () => {
  const base = { status: 200, trustedSha: TRUSTED_SHA, mode: 'isolated_preview' };

  it('passes when the version and both public Auth and server Prisma projects match the policy', () => {
    expect(evaluateHealthPayload({ ...base, body: healthBody() })).toEqual({
      ok: true,
      status: 200,
      version: 'f630cf6',
      supabaseRef: DEMO_REF,
      prismaProject: 'demo',
    });
  });

  it('treats non-200 answers as retryable and redirects as terminal', () => {
    expect(evaluateHealthPayload({ ...base, status: 404, body: 'not found' })).toMatchObject({
      ok: false,
      reason: 'http_404',
      retryable: true,
    });
    expect(evaluateHealthPayload({ ...base, status: 503, body: '' })).toMatchObject({
      reason: 'http_503',
      retryable: true,
    });
    expect(evaluateHealthPayload({ ...base, status: 308, body: '' })).toMatchObject({
      reason: 'redirected',
      retryable: false,
    });
  });

  it('rejects bodies that are not a JSON object', () => {
    for (const body of ['<html>maintenance</html>', JSON.stringify('ok'), 'null', '']) {
      expect(evaluateHealthPayload({ ...base, body })).toMatchObject({
        reason: 'invalid_json',
        retryable: true,
      });
    }
  });

  it('retries while the target still serves another commit', () => {
    expect(evaluateHealthPayload({ ...base, body: healthBody({ version: 'abc1234' }) })).toMatchObject({
      reason: 'version_mismatch',
      version: 'abc1234',
      trustedVersion: 'f630cf6',
      retryable: true,
    });
  });

  it('never lets a missing, short, or local version satisfy the gate', () => {
    expect(evaluateHealthPayload({ ...base, body: healthBody({ version: undefined }) })).toMatchObject({
      reason: 'version_missing',
    });
    // 'f63' is a genuine prefix of the trusted SHA; a bare startsWith would pass it.
    expect(evaluateHealthPayload({ ...base, body: healthBody({ version: 'f63' }) })).toMatchObject({
      reason: 'version_too_short',
    });
    expect(evaluateHealthPayload({ ...base, body: healthBody({ version: 'local' }) })).toMatchObject({
      reason: 'version_too_short',
    });
  });

  it('compares versions case-insensitively', () => {
    expect(evaluateHealthPayload({ ...base, body: healthBody({ version: 'F630CF6' }) }).ok).toBe(true);
  });

  it('fails closed, without retry, when the target runs on the wrong Supabase project', () => {
    expect(evaluateHealthPayload({ ...base, body: healthBody({ supabaseRef: PROD_REF }) })).toMatchObject({
      reason: 'supabase_ref_mismatch',
      supabaseRef: PROD_REF,
      expectedRef: DEMO_REF,
      retryable: false,
    });
    expect(
      evaluateHealthPayload({ ...base, mode: 'production_canary', body: healthBody({ supabaseRef: DEMO_REF }) }),
    ).toMatchObject({ reason: 'supabase_ref_mismatch', expectedRef: PROD_REF, retryable: false });
  });

  it('fails closed when the matching deployment predates the supabaseRef field', () => {
    expect(evaluateHealthPayload({ ...base, body: healthBody({ supabaseRef: undefined }) })).toMatchObject({
      reason: 'supabase_ref_missing',
      retryable: false,
    });
  });

  it('fails closed when the public URL is DEMO but the server Prisma URL is PROD', () => {
    const outcome = evaluateHealthPayload({ ...base, body: healthBody({ prismaProject: 'prod' }) });
    expect(outcome).toMatchObject({
      ok: false,
      reason: 'prisma_project_mismatch',
      prismaProject: 'prod',
      expectedPrismaProject: 'demo',
      retryable: false,
    });
    expect(describeHealthGateFailure(outcome)).toContain('Prisma datasource is prod');
  });

  it('fails closed on missing or unclassified server Prisma attestation', () => {
    expect(evaluateHealthPayload({ ...base, body: healthBody({ prismaProject: undefined }) })).toMatchObject({
      reason: 'prisma_project_missing',
      retryable: false,
    });
    for (const prismaProject of ['unset', 'unknown']) {
      expect(evaluateHealthPayload({ ...base, body: healthBody({ prismaProject }) })).toMatchObject({
        reason: 'prisma_project_mismatch',
        expectedPrismaProject: 'demo',
        retryable: false,
      });
    }
  });

  it('requires PROD Prisma for the production canary', () => {
    expect(evaluateHealthPayload({
      ...base,
      mode: 'production_canary',
      body: healthBody({ supabaseRef: PROD_REF, prismaProject: 'demo' }),
    })).toMatchObject({ reason: 'prisma_project_mismatch', expectedPrismaProject: 'prod' });
    expect(evaluateHealthPayload({
      ...base,
      mode: 'production_canary',
      body: healthBody({ supabaseRef: PROD_REF, prismaProject: 'prod' }),
    })).toMatchObject({ ok: true, prismaProject: 'prod' });
  });

  it('skips the commit and project checks only for the local policy', () => {
    expect(
      evaluateHealthPayload({ status: 200, mode: 'local', trustedSha: null, body: JSON.stringify({ status: 'ok' }) }),
    ).toEqual({ ok: true, status: 200, version: null, supabaseRef: null, prismaProject: null });
    expect(
      evaluateHealthPayload({ status: 200, mode: 'local', trustedSha: TRUSTED_SHA, body: healthBody({ version: 'abc1234' }) }),
    ).toMatchObject({ reason: 'version_mismatch' });
  });
});

describe('waitForTrustedHealth', () => {
  it('polls until the preview serves the trusted commit and never logs the origin', async () => {
    const { fetchImpl, calls } = scriptedFetch([
      response(404, '<html>NOT_FOUND</html>', { 'x-vercel-error': 'DEPLOYMENT_NOT_FOUND', 'x-vercel-id': 'iad1::abc' }),
      response(200, healthBody({ version: 'abc1234' })),
      response(200, healthBody(), { 'x-vercel-id': 'iad1::def' }),
    ]);
    const clock = fakeClock();
    const lines: string[] = [];

    const outcome = await waitForTrustedHealth({
      origin: PREVIEW_ORIGIN,
      trustedSha: TRUSTED_SHA,
      mode: 'isolated_preview',
      fetchImpl,
      now: clock.now,
      sleep: clock.sleep,
      log: (line: string) => lines.push(line),
    });

    expect(outcome).toMatchObject({ ok: true, version: 'f630cf6', supabaseRef: DEMO_REF, attempts: 3, timedOut: false });
    expect(clock.sleeps).toEqual([DEFAULT_HEALTH_GATE_INTERVAL_MS, DEFAULT_HEALTH_GATE_INTERVAL_MS]);
    expect(calls).toHaveLength(3);
    expect(calls[0].url).toBe(`${PREVIEW_ORIGIN}/api/health`);
    expect(calls[0].init.redirect).toBe('manual');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain('http_404');
    expect(lines[0]).toContain('x-vercel-error=DEPLOYMENT_NOT_FOUND');
    expect(lines[1]).toContain('version_mismatch (target abc1234, trusted f630cf6)');
    expect(lines[2]).toContain('ok (version f630cf6');
    for (const line of lines) {
      expect(line).not.toContain(PREVIEW_ORIGIN);
      expect(line).not.toContain('vercel.app');
    }
  });

  it('stops at once on the wrong Supabase project instead of waiting for the window', async () => {
    const { fetchImpl } = scriptedFetch([response(200, healthBody({ supabaseRef: PROD_REF }))]);
    const clock = fakeClock();

    const outcome = await waitForTrustedHealth({
      origin: PREVIEW_ORIGIN,
      trustedSha: TRUSTED_SHA,
      mode: 'isolated_preview',
      fetchImpl,
      now: clock.now,
      sleep: clock.sleep,
      log: () => {},
    });

    expect(outcome).toMatchObject({ ok: false, reason: 'supabase_ref_mismatch', attempts: 1, timedOut: false });
    expect(clock.sleeps).toEqual([]);
    const verdict = describeHealthGateFailure(outcome);
    expect(verdict).toContain(PROD_REF);
    expect(verdict).toContain(DEMO_REF);
    expect(verdict).toContain('docs/STAGING_ENV.md');
  });

  it('gives up after the polling window and reports the last answer', async () => {
    const dead = () => response(404, '', { 'x-vercel-error': 'DEPLOYMENT_NOT_FOUND' });
    const { fetchImpl } = scriptedFetch([dead(), dead(), dead(), dead()]);
    const clock = fakeClock();

    const outcome = await waitForTrustedHealth({
      origin: PREVIEW_ORIGIN,
      trustedSha: TRUSTED_SHA,
      mode: 'isolated_preview',
      fetchImpl,
      timeoutMs: 10_000,
      intervalMs: 4_000,
      now: clock.now,
      sleep: clock.sleep,
      log: () => {},
    });

    expect(outcome).toMatchObject({ ok: false, reason: 'http_404', attempts: 4, timedOut: true });
    expect(clock.sleeps).toEqual([4_000, 4_000, 2_000]);
    const verdict = describeHealthGateFailure(outcome);
    expect(verdict).toContain('HTTP 404');
    expect(verdict).toContain('DEPLOYMENT_NOT_FOUND');
    expect(verdict).toContain('gave up');
  });

  it('retries a network failure and reports its name, then passes', async () => {
    const { fetchImpl } = scriptedFetch([
      () => {
        throw new TypeError('fetch failed');
      },
      response(200, healthBody()),
    ]);
    const clock = fakeClock();
    const lines: string[] = [];

    const outcome = await waitForTrustedHealth({
      origin: PREVIEW_ORIGIN,
      trustedSha: TRUSTED_SHA,
      mode: 'isolated_preview',
      fetchImpl,
      now: clock.now,
      sleep: clock.sleep,
      log: (line: string) => lines.push(line),
    });

    expect(outcome).toMatchObject({ ok: true, attempts: 2 });
    expect(lines[0]).toContain('fetch_failed (TypeError)');
  });

  it('treats a redirect as terminal: the audit origin must answer directly', async () => {
    const { fetchImpl } = scriptedFetch([response(308, '', { location: 'https://elsewhere.example' })]);
    const clock = fakeClock();

    const outcome = await waitForTrustedHealth({
      origin: PREVIEW_ORIGIN,
      trustedSha: TRUSTED_SHA,
      mode: 'isolated_preview',
      fetchImpl,
      now: clock.now,
      sleep: clock.sleep,
      log: () => {},
    });

    expect(outcome).toMatchObject({ ok: false, reason: 'redirected', attempts: 1 });
    expect(describeHealthGateFailure(outcome)).toContain('HTTP 308');
  });

  it('uses a ten-minute window by default', () => {
    expect(DEFAULT_HEALTH_GATE_TIMEOUT_MS).toBe(10 * 60 * 1000);
  });
});

describe('formatHealthGateAttempt', () => {
  it('names the verdict and both versions on a mismatch', () => {
    const line = formatHealthGateAttempt(2, {
      ok: false,
      reason: 'version_mismatch',
      version: 'abc1234',
      trustedVersion: 'f630cf6',
      vercelId: 'iad1::xyz',
    });
    expect(line).toBe('[health-gate] attempt 2: version_mismatch (target abc1234, trusted f630cf6) x-vercel-id=iad1::xyz');
  });
});
