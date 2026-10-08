// @vitest-environment node
/**
 * Admin MFA device-trust cookies are HMAC-bound to user, UA, and IP.
 * Middleware covers the enrolled-device happy path and a changed IP; these
 * cases pin the token itself so a forged, expired, or rebound cookie cannot
 * skip the factor challenge.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getAdminMfaTrustCookieName,
  getAdminMfaTrustDays,
  issueAdminMfaTrustToken,
  verifyAdminMfaTrustToken,
} from '@/lib/auth/mfaTrust';

const USER = 'admin-1';
const UA = 'Mozilla/5.0 synthetic-audit';
const IP = '192.0.2.1';

beforeEach(() => {
  vi.stubEnv('AUTH_TRUST_COOKIE_SECRET', 'unit-test-mfa-trust-secret');
  vi.stubEnv('ADMIN_MFA_TRUST_DAYS', '7');
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('admin MFA trust token', () => {
  it('round-trips the same user, user-agent and IP', async () => {
    const token = await issueAdminMfaTrustToken({ userId: USER, userAgent: UA, ip: IP });
    expect(await verifyAdminMfaTrustToken({ token, userId: USER, userAgent: UA, ip: IP })).toBe(true);
    expect(getAdminMfaTrustCookieName()).toBe('wa_admin_mfa_trust');
  });

  it('rejects a token rebound to another user', async () => {
    const token = await issueAdminMfaTrustToken({ userId: USER, userAgent: UA, ip: IP });
    expect(await verifyAdminMfaTrustToken({ token, userId: 'admin-2', userAgent: UA, ip: IP })).toBe(false);
  });

  it('rejects a changed user-agent or IP', async () => {
    const token = await issueAdminMfaTrustToken({ userId: USER, userAgent: UA, ip: IP });
    expect(await verifyAdminMfaTrustToken({ token, userId: USER, userAgent: 'different-ua', ip: IP })).toBe(false);
    expect(await verifyAdminMfaTrustToken({ token, userId: USER, userAgent: UA, ip: '192.0.2.99' })).toBe(false);
  });

  it('rejects an edited payload that keeps the original signature', async () => {
    const token = await issueAdminMfaTrustToken({ userId: USER, userAgent: UA, ip: IP });
    const [payload, signature] = token.split('.');
    const body = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    const forged = `${Buffer.from(JSON.stringify({ ...body, sub: 'admin-2' })).toString('base64url')}.${signature}`;
    expect(await verifyAdminMfaTrustToken({ token: forged, userId: 'admin-2', userAgent: UA, ip: IP })).toBe(false);
  });

  it('rejects missing, malformed, or damaged tokens', async () => {
    expect(await verifyAdminMfaTrustToken({ token: null, userId: USER })).toBe(false);
    expect(await verifyAdminMfaTrustToken({ token: '', userId: USER })).toBe(false);
    expect(await verifyAdminMfaTrustToken({ token: 'no-dot', userId: USER })).toBe(false);
    const token = await issueAdminMfaTrustToken({ userId: USER, userAgent: UA, ip: IP });
    const [payload, signature] = token.split('.');
    const flipped = signature.slice(0, -1) + (signature.endsWith('A') ? 'B' : 'A');
    expect(await verifyAdminMfaTrustToken({ token: `${payload}.${flipped}`, userId: USER, userAgent: UA, ip: IP })).toBe(false);
  });

  it('expires after the configured trust window', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-08T12:00:00Z'));
    const token = await issueAdminMfaTrustToken({ userId: USER, userAgent: UA, ip: IP });
    expect(await verifyAdminMfaTrustToken({ token, userId: USER, userAgent: UA, ip: IP })).toBe(true);
    vi.setSystemTime(new Date('2026-10-16T12:00:01Z'));
    expect(await verifyAdminMfaTrustToken({ token, userId: USER, userAgent: UA, ip: IP })).toBe(false);
  });

  it('clamps ADMIN_MFA_TRUST_DAYS to 3–7 and defaults invalid values to 7', () => {
    vi.stubEnv('ADMIN_MFA_TRUST_DAYS', '10');
    expect(getAdminMfaTrustDays()).toBe(7);
    vi.stubEnv('ADMIN_MFA_TRUST_DAYS', '1');
    expect(getAdminMfaTrustDays()).toBe(3);
    vi.stubEnv('ADMIN_MFA_TRUST_DAYS', '5');
    expect(getAdminMfaTrustDays()).toBe(5);
    vi.stubEnv('ADMIN_MFA_TRUST_DAYS', 'not-a-number');
    expect(getAdminMfaTrustDays()).toBe(7);
  });

  it('refuses to mint without AUTH_TRUST_COOKIE_SECRET', async () => {
    vi.stubEnv('AUTH_TRUST_COOKIE_SECRET', '');
    await expect(issueAdminMfaTrustToken({ userId: USER })).rejects.toThrow(/AUTH_TRUST_COOKIE_SECRET/);
  });
});
