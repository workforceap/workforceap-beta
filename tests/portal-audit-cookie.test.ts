import { describe, expect, it } from 'vitest';
import {
  PORTAL_AUDIT_TOKEN_COOKIE_NAME,
  installReadOnlyAuditCookie,
  stripReadOnlyAuditCookieFromStorageState,
} from '../scripts/lib/portal-audit-cookie.mjs';
import { READ_ONLY_PORTAL_AUDIT_TOKEN_COOKIE } from '../lib/audit/readOnlyPortalAudit';

describe('portal audit cookie transport', () => {
  it('shares the same cookie name between runner and middleware', () => {
    expect(PORTAL_AUDIT_TOKEN_COOKIE_NAME).toBe(READ_ONLY_PORTAL_AUDIT_TOKEN_COOKIE);
  });

  it('removes only the capability cookie from copied role storage state', () => {
    const state = {
      cookies: [
        { name: 'sb-auth-token', value: 'session' },
        { name: PORTAL_AUDIT_TOKEN_COOKIE_NAME, value: 'dummy-secret' },
      ],
      origins: [{ origin: 'https://preview.example', localStorage: [{ name: 'saved', value: '1' }] }],
    };
    const sanitized = stripReadOnlyAuditCookieFromStorageState(state);
    expect(sanitized.cookies).toEqual([{ name: 'sb-auth-token', value: 'session' }]);
    expect(sanitized.origins).toEqual(state.origins);
    expect(state.cookies).toHaveLength(2);
  });

  it('uses a host-only, HttpOnly, Strict cookie and secures HTTPS targets', async () => {
    const cookies: Array<Record<string, unknown>> = [];
    const context = { addCookies: async (batch: Array<Record<string, unknown>>) => { cookies.push(...batch); } };
    await installReadOnlyAuditCookie(context, 'https://preview.example', 'd'.repeat(40));
    expect(cookies).toEqual([{
      name: PORTAL_AUDIT_TOKEN_COOKIE_NAME,
      value: 'd'.repeat(40),
      url: 'https://preview.example/',
      httpOnly: true,
      secure: true,
      sameSite: 'Strict',
    }]);
    expect(cookies[0]).not.toHaveProperty('domain');
    await expect(installReadOnlyAuditCookie(context, 'https://preview.example/path', 'd'.repeat(40)))
      .rejects.toThrow('read_only_audit_cookie_origin_invalid');
    await expect(installReadOnlyAuditCookie(context, 'http://preview.example', 'd'.repeat(40)))
      .rejects.toThrow('read_only_audit_cookie_origin_invalid');
  });
});
