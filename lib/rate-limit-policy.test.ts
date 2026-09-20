import test from 'node:test';
import assert from 'node:assert/strict';

import {
  APPLY_FAIL_CLOSED_ENV,
  ALLOW_MISSING_UPSTASH_ENV,
  decideMissingLimiter,
  isAllowMissingUpstashEnabled,
  isApplyFailClosedEnvEnabled,
  resolveRateLimiterMode,
} from './rate-limit-policy';

test('spend mode fail-closes in production even when allow-missing Upstash is on', () => {
  const decision = decideMissingLimiter({
    isProduction: true,
    allowMissingUpstash: true,
    mode: 'spend',
    applyFailClosedEnv: false,
  });
  assert.equal(decision.success, false);
  assert.equal(decision.remaining, 0);
  assert.equal(decision.reason, 'spend-fail-closed');
});

test('spend mode fail-closes in production without allow-missing', () => {
  const decision = decideMissingLimiter({
    isProduction: true,
    allowMissingUpstash: false,
    mode: 'spend',
    applyFailClosedEnv: false,
  });
  assert.equal(decision.success, false);
  assert.equal(decision.reason, 'spend-fail-closed');
});

test('spend mode fail-opens in development', () => {
  const decision = decideMissingLimiter({
    isProduction: false,
    allowMissingUpstash: false,
    mode: 'spend',
    applyFailClosedEnv: false,
  });
  assert.equal(decision.success, true);
  assert.equal(decision.reason, 'dev-fail-open');
});

test('apply mode fail-closes in production when allow-missing is unset', () => {
  const decision = decideMissingLimiter({
    isProduction: true,
    allowMissingUpstash: false,
    mode: 'apply',
    applyFailClosedEnv: false,
  });
  assert.equal(decision.success, false);
  assert.equal(decision.reason, 'prod-fail-closed');
});

test('apply mode fail-opens in production when RATE_LIMIT_ALLOW_MISSING_UPSTASH=1', () => {
  const decision = decideMissingLimiter({
    isProduction: true,
    allowMissingUpstash: true,
    mode: 'apply',
    applyFailClosedEnv: false,
  });
  assert.equal(decision.success, true);
  assert.equal(decision.reason, 'allow-missing-upstash');
});

test('apply mode fail-closes when WAP_APPLY_RATE_LIMIT_FAIL_CLOSED=1 even with allow-missing', () => {
  const decision = decideMissingLimiter({
    isProduction: true,
    allowMissingUpstash: true,
    mode: 'apply',
    applyFailClosedEnv: true,
  });
  assert.equal(decision.success, false);
  assert.equal(decision.reason, 'apply-env-fail-closed');
});

test('apply mode fail-opens in development', () => {
  const decision = decideMissingLimiter({
    isProduction: false,
    allowMissingUpstash: false,
    mode: 'apply',
    applyFailClosedEnv: true,
  });
  assert.equal(decision.success, true);
  assert.equal(decision.reason, 'dev-fail-open');
});

test('security mode honors allow-missing in production', () => {
  const open = decideMissingLimiter({
    isProduction: true,
    allowMissingUpstash: true,
    mode: 'security',
    applyFailClosedEnv: false,
  });
  assert.equal(open.success, true);
  const closed = decideMissingLimiter({
    isProduction: true,
    allowMissingUpstash: false,
    mode: 'security',
    applyFailClosedEnv: false,
  });
  assert.equal(closed.success, false);
  assert.equal(closed.reason, 'prod-fail-closed');
});

test('env helpers only treat the string 1 as enabled', () => {
  assert.equal(isAllowMissingUpstashEnabled('1'), true);
  assert.equal(isAllowMissingUpstashEnabled('true'), false);
  assert.equal(isAllowMissingUpstashEnabled(''), false);
  assert.equal(isApplyFailClosedEnvEnabled('1'), true);
  assert.equal(isApplyFailClosedEnvEnabled('0'), false);
  assert.equal(ALLOW_MISSING_UPSTASH_ENV, 'RATE_LIMIT_ALLOW_MISSING_UPSTASH');
  assert.equal(APPLY_FAIL_CLOSED_ENV, 'WAP_APPLY_RATE_LIMIT_FAIL_CLOSED');
});

test('allow-missing helper reads its default from the environment', () => {
  const previous = process.env[ALLOW_MISSING_UPSTASH_ENV];

  try {
    delete process.env[ALLOW_MISSING_UPSTASH_ENV];
    assert.equal(isAllowMissingUpstashEnabled(), false);
    process.env[ALLOW_MISSING_UPSTASH_ENV] = '1';
    assert.equal(isAllowMissingUpstashEnabled(), true);
  } finally {
    if (previous === undefined) {
      delete process.env[ALLOW_MISSING_UPSTASH_ENV];
    } else {
      process.env[ALLOW_MISSING_UPSTASH_ENV] = previous;
    }
  }
});

test('rate limiter mode is redis whenever Upstash is configured', () => {
  assert.equal(
    resolveRateLimiterMode({ upstashConfigured: true, isProduction: true, allowMissingUpstash: false }),
    'redis',
  );
  assert.equal(
    resolveRateLimiterMode({ upstashConfigured: true, isProduction: false, allowMissingUpstash: true }),
    'redis',
  );
});

test('rate limiter mode is fail-open outside production or with the allow-missing opt-out', () => {
  assert.equal(
    resolveRateLimiterMode({ upstashConfigured: false, isProduction: false, allowMissingUpstash: false }),
    'fail-open',
  );
  assert.equal(
    resolveRateLimiterMode({ upstashConfigured: false, isProduction: true, allowMissingUpstash: true }),
    'fail-open',
  );
});

test('rate limiter mode is fail-closed in production without Upstash and without the opt-out', () => {
  assert.equal(
    resolveRateLimiterMode({ upstashConfigured: false, isProduction: true, allowMissingUpstash: false }),
    'fail-closed',
  );
});
