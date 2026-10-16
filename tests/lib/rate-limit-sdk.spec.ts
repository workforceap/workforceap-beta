// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

const redisState = vi.hoisted(() => ({
  mode: 'allow' as 'allow' | 'last-token' | 'deny' | 'timeout' | 'reject',
  calls: 0,
}));

// Exercise the installed limiter SDK, substituting only the Redis transport.
vi.mock('@upstash/redis', () => ({
  Redis: class {
    evalsha() { return this.eval(); }
    eval() {
      redisState.calls += 1;
      if (redisState.mode === 'timeout') return new Promise(() => {});
      if (redisState.mode === 'reject') return Promise.reject(new Error('Synthetic Redis rejection'));
      return Promise.resolve(redisState.mode === 'allow' ? [24, 25] : redisState.mode === 'last-token' ? [0, 25] : [-1, 25]);
    }
  },
}));
vi.mock('@/lib/observability/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

type Limiters = typeof import('@/lib/rate-limit');
const paidChecks = [
  'checkAIToolRateLimit',
  'checkVoiceSessionRateLimit',
  'checkPublicVoiceSessionRateLimit',
  'checkHelpAssistantRateLimit',
  'checkEmployerJobImportRateLimit',
] as const;
const protectedChecks = [
  ...paidChecks,
  'checkAuthRateLimit',
  'checkAuthIpRateLimit',
  'checkSignupRateLimit',
  'checkApplySignupRateLimit',
  'checkSignupEmailRateLimit',
  'checkPartnerSignupRateLimit',
  'checkContactRateLimit',
  'checkForgotPasswordRateLimit',
  'checkForgotPasswordEmailRateLimit',
  'checkConfirmationEmailRateLimit',
  'checkConfirmationEmailEmailRateLimit',
  'checkApplyStatusLookupRateLimit',
  'checkApplyStatusLookupEmailRateLimit',
  'checkVerifyMfaRateLimit',
  'checkBulkEmailRateLimit',
] as const;

async function loadLimiters(options: { configured?: boolean; production?: boolean } = {}) {
  vi.resetModules();
  vi.stubEnv('NODE_ENV', options.production === false ? 'development' : 'production');
  vi.stubEnv('UPSTASH_REDIS_REST_URL', options.configured === false ? '' : 'https://redis.example.invalid');
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', options.configured === false ? '' : 'synthetic-not-a-credential');
  vi.stubEnv('RATE_LIMIT_ALLOW_MISSING_UPSTASH', '1');
  vi.stubEnv('WAP_APPLY_RATE_LIMIT_FAIL_CLOSED', '0');
  vi.stubEnv('WAP_RATE_LIMIT_QA_BYPASS', '0');
  redisState.calls = 0;
  return import('@/lib/rate-limit');
}

function checkAll(app: Limiters) {
  return Promise.all(protectedChecks.map((name) => app[name]('synthetic+limiter@example.invalid')));
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('configured rate limits through the installed SDK', () => {
  it('allows ordinary requests across protected callers and keeps remaining quota', async () => {
    redisState.mode = 'allow';
    const app = await loadLimiters();
    expect((await checkAll(app)).every((result) => result.success)).toBe(true);
    expect(await app.checkAIToolRateLimit('another-user')).toEqual({ success: true, remaining: 24 });
  });

  it('denies exhausted quotas across protected callers', async () => {
    redisState.mode = 'deny';
    const app = await loadLimiters();
    expect((await checkAll(app)).every((result) => !result.success)).toBe(true);
  });

  it('allows the last available token rather than treating zero remaining as an outage', async () => {
    redisState.mode = 'last-token';
    const app = await loadLimiters();
    expect(await app.checkAIToolRateLimit('last-token-user')).toEqual({ success: true, remaining: 0 });
  });

  it('denies SDK timeout results even with the missing-configuration opt-out enabled', async () => {
    redisState.mode = 'timeout';
    vi.useFakeTimers();
    const app = await loadLimiters();
    const pending = checkAll(app);
    await vi.advanceTimersByTimeAsync(5_001);
    expect((await pending).every((result) => !result.success)).toBe(true);
    expect(redisState.calls).toBeGreaterThan(0);
  });

  it('denies Redis exceptions without throwing or leaking request identifiers to logs', async () => {
    redisState.mode = 'reject';
    const app = await loadLimiters();
    expect((await checkAll(app)).every((result) => !result.success)).toBe(true);
    const { logger } = await import('@/lib/observability/logger');
    expect(logger.error).toHaveBeenCalled();
    expect(JSON.stringify(vi.mocked(logger.error).mock.calls)).not.toContain('synthetic+limiter@example.invalid');
    expect(JSON.stringify(vi.mocked(logger.error).mock.calls)).not.toContain('Synthetic Redis rejection');
  });

  it('allows a fresh request after the provider recovers', async () => {
    redisState.mode = 'timeout';
    vi.useFakeTimers();
    const app = await loadLimiters();
    const pending = app.checkAIToolRateLimit('recovering-user');
    await vi.advanceTimersByTimeAsync(5_001);
    expect((await pending).success).toBe(false);
    redisState.mode = 'allow';
    expect(await app.checkAIToolRateLimit('recovering-user')).toEqual({ success: true, remaining: 24 });
  });

  it('does not add a QA-header bypass to paid wrappers that have no Request argument', async () => {
    redisState.mode = 'deny';
    const app = await loadLimiters();
    vi.stubEnv('WAP_RATE_LIMIT_QA_BYPASS', '1');
    vi.stubEnv('WAP_RATE_LIMIT_QA_SECRET', 'synthetic-qa-header');
    const request = new Request('https://example.invalid', { headers: { 'x-wap-qa-bypass': 'synthetic-qa-header' } });
    expect((await app.checkAuthRateLimit('qa-login', request)).success).toBe(true);
    for (const name of paidChecks.filter((name) => name !== 'checkHelpAssistantRateLimit')) {
      expect((await app[name]('ordinary-paid-user')).success).toBe(false);
    }
  });
});

describe('missing limiter configuration remains distinct from a provider outage', () => {
  it.each(paidChecks)('denies %s in production despite the opt-out', async (name) => {
    const app = await loadLimiters({ configured: false });
    expect((await app[name]('synthetic-user')).success).toBe(false);
    expect(redisState.calls).toBe(0);
  });

  it('keeps credential-free development available for paid tools', async () => {
    const app = await loadLimiters({ configured: false, production: false });
    for (const name of paidChecks) expect((await app[name]('local-user')).success).toBe(true);
  });

  it('preserves the explicit auth/apply opt-out and public read behavior', async () => {
    const app = await loadLimiters({ configured: false });
    expect((await app.checkAuthRateLimit('synthetic-user')).success).toBe(true);
    expect((await app.checkApplySignupRateLimit('192.0.2.10')).success).toBe(true);
    expect((await app.checkPublicCareersGetRateLimit('192.0.2.10')).success).toBe(true);
    vi.stubEnv('WAP_APPLY_RATE_LIMIT_FAIL_CLOSED', '1');
    expect((await app.checkApplySignupRateLimit('192.0.2.10')).success).toBe(false);
  });
});
