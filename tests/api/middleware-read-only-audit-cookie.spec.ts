// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const authState = vi.hoisted(() => ({ user: { id: 'audit-fixture-user' } as { id: string } | null }));

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: authState.user }, error: null }),
      getSession: async () => ({ data: { session: authState.user ? { user: authState.user } : null }, error: null }),
      mfa: { getAuthenticatorAssuranceLevel: async () => ({ data: null, error: null }) },
    },
  }),
}));
vi.mock('@/lib/db/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/observability/logger', () => ({ logger: { error: () => {}, warn: () => {}, info: () => {}, debug: () => {} } }));

import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';
import {
  READ_ONLY_PORTAL_AUDIT_HEADER,
  READ_ONLY_PORTAL_AUDIT_TOKEN_COOKIE,
  READ_ONLY_PORTAL_AUDIT_TOKEN_HEADER,
} from '@/lib/audit/readOnlyPortalAudit';

const dummyToken = 'dummy-audit-token-'.repeat(3);
const forwarded = (response: Response, name: string) => response.headers.get(`x-middleware-request-${name}`);

function protectedRequest(headers: Record<string, string> = {}) {
  return new NextRequest('https://www.workforceap.org/dashboard', {
    headers: { host: 'www.workforceap.org', ...headers },
  });
}

beforeEach(() => {
  authState.user = { id: 'audit-fixture-user' };
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://fixture.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'synthetic-not-a-key');
  vi.stubEnv('PORTAL_AUDIT_READ_ONLY_TOKEN', dummyToken);
  vi.stubEnv('STAFF_MFA_ENFORCEMENT', '0');
});
afterEach(() => vi.unstubAllEnvs());

describe('middleware read-only audit cookie', () => {
  it('mints the internal marker only for an authenticated exact cookie and strips the secret downstream', async () => {
    const response = await middleware(protectedRequest({
      cookie: `ordinary=keep; ${READ_ONLY_PORTAL_AUDIT_TOKEN_COOKIE}=${dummyToken}`,
    }));

    expect(forwarded(response, READ_ONLY_PORTAL_AUDIT_HEADER)).toBe('1');
    expect(forwarded(response, 'cookie')).toBe('ordinary=keep');
    expect(forwarded(response, READ_ONLY_PORTAL_AUDIT_TOKEN_HEADER)).toBeNull();
    expect(response.headers.get('set-cookie') ?? '').not.toContain(READ_ONLY_PORTAL_AUDIT_TOKEN_COOKIE);
  });

  it('rejects a wrong or missing cookie, even with spoofed audit headers', async () => {
    for (const cookie of ['', `${READ_ONLY_PORTAL_AUDIT_TOKEN_COOKIE}=wrong`]) {
      const response = await middleware(protectedRequest({
        ...(cookie ? { cookie } : {}),
        [READ_ONLY_PORTAL_AUDIT_HEADER]: '1',
        [READ_ONLY_PORTAL_AUDIT_TOKEN_HEADER]: dummyToken,
      }));
      expect(forwarded(response, READ_ONLY_PORTAL_AUDIT_HEADER)).toBeNull();
      expect(forwarded(response, READ_ONLY_PORTAL_AUDIT_TOKEN_HEADER)).toBeNull();
    }
  });

  it('does not grant read-only mode without an authenticated user', async () => {
    authState.user = null;
    const response = await middleware(protectedRequest({
      cookie: `${READ_ONLY_PORTAL_AUDIT_TOKEN_COOKIE}=${dummyToken}`,
      [READ_ONLY_PORTAL_AUDIT_HEADER]: '1',
    }));
    expect(response.status).toBe(307);
    expect(forwarded(response, READ_ONLY_PORTAL_AUDIT_HEADER)).toBeNull();
  });
});
