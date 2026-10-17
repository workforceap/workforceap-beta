import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'rate-limit.ts'), 'utf8');

test('apply/signup checkers use the apply fail-closed wrapper', () => {
  assert.match(src, /checkApplySignupRateLimit[\s\S]*failClosedApplyLimit\(applySignupRateLimiter/);
  assert.match(src, /checkSignupRateLimit[\s\S]*failClosedApplyLimit\(signupRateLimiter/);
  assert.match(src, /checkSignupEmailRateLimit[\s\S]*failClosedApplyLimit\(signupEmailRateLimiter/);
});

test('abuse-sensitive leftover checkers use the security fail-closed wrapper', () => {
  assert.match(src, /checkPartnerSignupRateLimit[\s\S]*failClosedLimit\(partnerSignupRateLimiter/);
  assert.match(src, /checkBulkEmailRateLimit[\s\S]*failClosedLimit\(bulkEmailRateLimiter/);
  assert.match(src, /checkVerifyMfaRateLimit[\s\S]*failClosedLimit\(verifyMfaRateLimiter/);
});

test('apply signup limit window stays at the launch bump of 50 / 30 m', () => {
  assert.match(src, /prefix:\s*'ratelimit:apply-signup'/);
  assert.match(src, /Ratelimit\.slidingWindow\(50,\s*'30 m'\)/);
});

test('authenticated voice-session minting is 10 starts per user per hour', () => {
  assert.match(src, /export const VOICE_SESSION_STARTS_PER_HOUR = 10/);
  assert.match(src, /limiter:\s*Ratelimit\.slidingWindow\(VOICE_SESSION_STARTS_PER_HOUR,\s*'1 h'\)/);
  assert.match(src, /prefix:\s*'ratelimit:voice-session'/);
  assert.match(src, /checkVoiceSessionRateLimit[\s\S]*limit\(`voice-session:\$\{userId\}`\)/);
});
