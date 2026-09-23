// @vitest-environment node
// Real auth boundary handlers; only provider, cookies, and database are synthetic.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  jar: new Map<string, string>(),
  signOut: vi.fn(),
  getProviderUser: vi.fn(),
  getProviderSession: vi.fn(),
  aal: vi.fn(),
  findUser: vi.fn(),
}));
vi.mock('next/headers', () => ({ cookies: async () => ({
  get: (name: string) => mocks.jar.has(name) ? { name, value: mocks.jar.get(name) } : undefined,
  getAll: () => Array.from(mocks.jar, ([name, value]) => ({ name, value })),
  set: (name: string, value: string) => mocks.jar.set(name, value),
}) }));
vi.mock('next/navigation', () => ({ unstable_rethrow: () => {} }));
vi.mock('@supabase/ssr', () => ({ createServerClient: () => ({ auth: {
  getUser: mocks.getProviderUser,
  getSession: mocks.getProviderSession,
  signOut: mocks.signOut,
  mfa: { getAuthenticatorAssuranceLevel: mocks.aal },
} }) }));
vi.mock('@/lib/db/prisma', () => ({ prisma: {
  $transaction: (fn: (tx: unknown) => unknown) => fn({ user: { findUnique: mocks.findUser } }),
} }));
vi.mock('@/lib/auth/roles', () => ({ getProfileRole: async () => 'member' }));
vi.mock('@/lib/observability/logger', () => ({ logger: { error: () => {} } }));
import { NextRequest } from 'next/server';
import { POST as logout } from '@/app/api/auth/logout/route';
import { GET as getProfile } from '@/app/api/member/profile/route';
import { middleware } from '@/middleware';
import { getUser, getSession, resolveAuthGucContext } from '@/lib/auth/server';
import { issueAdminMfaTrustToken } from '@/lib/auth/mfaTrust';
import { getGucContext } from '@/lib/db/gucContext';

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://fixture.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'synthetic-not-a-key');
  vi.stubEnv('VERCEL_ENV', 'production');
  vi.stubEnv('STAFF_MFA_ENFORCEMENT', '1');
  vi.stubEnv('AUTH_TRUST_COOKIE_SECRET', 'synthetic-test-secret-only');
  mocks.jar.clear();
  mocks.jar.set('sb-fixture-auth-token.0', 'synthetic-part-0');
  mocks.jar.set('sb-fixture-auth-token.1', 'synthetic-part-1');
  mocks.getProviderUser.mockResolvedValue({ data: { user: { id: 'synthetic-user' } }, error: null });
  mocks.getProviderSession.mockResolvedValue({ data: { session: { user: { id: 'synthetic-user' } } }, error: null });
  mocks.signOut.mockResolvedValue({ error: null });
  mocks.aal.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal1' }, error: null });
  mocks.findUser.mockResolvedValue({ id: 'synthetic-user', organizationId: 'synthetic-org',
    email: 'fixture@example.invalid', fullName: 'Synthetic fixture', phone: null, profile: null,
    deletedAt: new Date('2026-09-09T00:00:00Z'),
  });
});

it('logout clears local authentication after a returned provider outage', async () => {
  // auth-js 2.101.1 _signOut returns a 503 error before _removeSession.
  mocks.signOut.mockResolvedValue({ error: { status: 503, message: 'Synthetic provider outage' } });
  const response = await logout(new Request('https://www.workforceap.org/api/auth/logout', { method: 'POST' }));
  expect(mocks.signOut).toHaveBeenCalledOnce();
  expect(await response.json()).toEqual({ success: true, globalSignOut: false });
  expect(Array.from(mocks.jar).filter(([name, value]) => /^sb-.*-auth-token/.test(name) && value)).toEqual([]);
});

it('soft-deleted application identity cannot read member profile with a still-valid provider session', async () => {
  // State explicitly retained by admin/members/[id]/delete when Auth disable fails.
  // Real auth-server getUser, resolveAuthGucContext, withApiGuc, and profile GET run.
  const response = await getProfile(new Request('https://www.workforceap.org/api/member/profile'));

  expect(mocks.getProviderUser).toHaveBeenCalled();
  expect([401, 403]).toContain(response.status);
});

it('enforced MFA rejects admin API access before initial factor enrollment', async () => {
  // Password-authenticated user, no factor enrolled: actual Supabase AAL contract.
  const request = new NextRequest('https://www.workforceap.org/api/admin/members', {
    headers: { host: 'www.workforceap.org', cookie: 'sb-fixture-auth-token=synthetic', 'user-agent': 'synthetic-audit' },
  });
  const response = await middleware(request);
  expect(mocks.aal).toHaveBeenCalledOnce();

  expect(response.status).toBe(403);
});

afterEach(() => vi.unstubAllEnvs());

it('permits the active application identity under its own bootstrap GUC', async () => {
  mocks.findUser.mockImplementation(async () => {
    expect(getGucContext()?.userId).toBe('synthetic-user');
    return { deletedAt: null, organizationId: 'synthetic-org' };
  });
  expect(await getUser()).toEqual({ id: 'synthetic-user' });
});

it('preserves Auth-only provisioning when no application row exists', async () => {
  mocks.findUser.mockResolvedValue(null);
  expect(await getUser()).toEqual({ id: 'synthetic-user' });
  expect(await getSession()).not.toBeNull();
});

it('rejects deleted sessions in both full-session and GUC bootstrap access', async () => {
  expect(await getSession()).toBeNull();
  expect((await resolveAuthGucContext()).userId).toBeNull();
});

it('fails closed when the application account status cannot be read', async () => {
  mocks.findUser.mockRejectedValue(new Error('Synthetic account lookup unavailable'));
  const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    expect(await getUser()).toBeNull();
    expect(await getSession()).toBeNull();
  } finally { errorLog.mockRestore(); }
});

it('does not query application identity for an anonymous cookie-free request', async () => {
  mocks.jar.clear();
  expect(await getUser()).toBeNull();
  expect(mocks.findUser).not.toHaveBeenCalled();
});

it('logout expires session and PKCE chunks while preserving unrelated cookies', async () => {
  mocks.jar.set('sb-fixture-auth-token-code-verifier.0', 'synthetic');
  mocks.jar.set('wap_locale', 'es');
  mocks.signOut.mockRejectedValue(new Error('Synthetic transport error'));
  const response = await logout(new Request('https://www.workforceap.org/api/auth/logout', { method: 'POST' }));
  expect(await response.json()).toEqual({ success: true, globalSignOut: false });
  expect(mocks.jar.get('sb-fixture-auth-token-code-verifier.0')).toBe('');
  expect(mocks.jar.get('sb-fixture-auth-token.0')).toBe('');
  expect(mocks.jar.get('wap_locale')).toBe('es');
});

it('does not clear local cookies or call the provider for a cross-origin logout', async () => {
  const response = await logout(new Request('https://www.workforceap.org/api/auth/logout', {
    method: 'POST', headers: { host: 'www.workforceap.org', origin: 'https://different.example.invalid' },
  }));
  expect(response.status).toBe(403);
  expect(mocks.signOut).not.toHaveBeenCalled();
  expect(mocks.jar.get('sb-fixture-auth-token.0')).toBe('synthetic-part-0');
});

function staffRequest(path: string, trust?: string) {
  return new NextRequest('https://www.workforceap.org' + path, {
    headers: {
      host: 'www.workforceap.org', 'user-agent': 'synthetic-audit',
      'x-vercel-forwarded-for': '192.0.2.1',
      cookie: 'sb-fixture-auth-token=synthetic' + (trust ? '; wa_admin_mfa_trust=' + trust : ''),
    },
  });
}

it.each(['/admin/members?tab=active', '/counselor/members?status=active'])('preserves staff destination through initial setup: %s', async (path) => {
  const response = await middleware(staffRequest(path));
  expect(response.status).toBe(307);
  const location = new URL(response.headers.get('location')!);
  expect(location.pathname).toBe('/setup-mfa');
  expect(location.searchParams.get('next')).toBe(path);
});

it('requires counselor API MFA even before enrollment', async () => {
  const response = await middleware(staffRequest('/api/counselor/members'));
  expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({ code: 'MFA_SETUP_REQUIRED' });
});

it('requires the enrolled factor challenge and preserves the destination', async () => {
  mocks.aal.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal2' }, error: null });
  const response = await middleware(staffRequest('/admin/members?tab=active'));
  const location = new URL(response.headers.get('location')!);
  expect(location.pathname).toBe('/verify-mfa');
  expect(location.searchParams.get('next')).toBe('/admin/members?tab=active');
});

it('allows an AAL2 staff session without a trust cookie', async () => {
  mocks.aal.mockResolvedValue({ data: { currentLevel: 'aal2', nextLevel: 'aal2' }, error: null });
  expect((await middleware(staffRequest('/api/admin/members'))).status).toBe(200);
});

it('honors real signed enrolled-device trust with the same IP and user agent', async () => {
  mocks.aal.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal2' }, error: null });
  const token = await issueAdminMfaTrustToken({ userId: 'synthetic-user', userAgent: 'synthetic-audit', ip: '192.0.2.1' });
  expect((await middleware(staffRequest('/api/admin/members', token))).status).toBe(200);
  const changedIp = staffRequest('/api/admin/members', token);
  changedIp.headers.set('x-vercel-forwarded-for', '192.0.2.2');
  expect((await middleware(changedIp)).status).toBe(403);
});

it('does not use an old trust cookie to waive missing factor enrollment', async () => {
  const token = await issueAdminMfaTrustToken({ userId: 'synthetic-user', userAgent: 'synthetic-audit', ip: '192.0.2.1' });
  expect((await middleware(staffRequest('/api/admin/members', token))).status).toBe(403);
});

it('falls back to the factor challenge when device trust cannot be verified', async () => {
  mocks.aal.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal2' }, error: null });
  const token = await issueAdminMfaTrustToken({ userId: 'synthetic-user', userAgent: 'synthetic-audit', ip: '192.0.2.1' });
  vi.stubEnv('AUTH_TRUST_COOKIE_SECRET', '');
  const response = await middleware(staffRequest('/admin/members', token));
  expect(new URL(response.headers.get('location')!).pathname).toBe('/verify-mfa');
});

it.each(['returned error', 'thrown error', 'missing level'])('fails closed on MFA assurance failure: %s', async (failure) => {
  if (failure === 'thrown error') mocks.aal.mockRejectedValue(new Error('Synthetic provider error'));
  else mocks.aal.mockResolvedValue({ data: failure === 'missing level' ? {} : null, error: failure === 'returned error' ? { status: 503 } : null });
  expect((await middleware(staffRequest('/api/admin/members'))).status).toBe(503);
});

it.each(['/setup-mfa', '/verify-mfa', '/en/reset-password', '/api/auth/setup-mfa', '/api/auth/verify-mfa', '/api/auth/logout'])('keeps MFA enrollment and recovery reachable: %s', async (path) => {
  expect((await middleware(staffRequest(path))).status).toBe(200);
  expect(mocks.aal).not.toHaveBeenCalled();
});

it('respects an explicitly disabled MFA rollout without changing the environment', async () => {
  vi.stubEnv('STAFF_MFA_ENFORCEMENT', '0');
  expect((await middleware(staffRequest('/api/admin/members'))).status).toBe(200);
  expect(mocks.aal).not.toHaveBeenCalled();
});

function staffApiRequest(method: string, path: string, trust?: string) {
  const request = staffRequest(path, trust);
  return new NextRequest(request, { method });
}

// Admin-only APIs outside /api/admin: a Stripe Connect transfer and org
// settings (custom domain) must carry the same staff MFA gate.
describe.each([
  ['POST', '/api/partner/payout'],
  ['PUT', '/api/org/acme/settings'],
  ['GET', '/api/org/acme/settings'],
])('staff MFA on admin-only API %s %s', (method, path) => {
  it('rejects an AAL1 session before factor enrollment', async () => {
    const response = await middleware(staffApiRequest(method, path));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: 'MFA_SETUP_REQUIRED' });
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('rejects an enrolled AAL1 session without device trust', async () => {
    mocks.aal.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal2' }, error: null });
    const response = await middleware(staffApiRequest(method, path));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: 'MFA_REQUIRED' });
  });

  it('passes an AAL2 session', async () => {
    mocks.aal.mockResolvedValue({ data: { currentLevel: 'aal2', nextLevel: 'aal2' }, error: null });
    expect((await middleware(staffApiRequest(method, path))).status).toBe(200);
    expect(mocks.aal).toHaveBeenCalledOnce();
    // The gate runs on a provider-validated user, as it does for /api/admin.
    expect(mocks.getProviderUser).toHaveBeenCalled();
    expect(mocks.getProviderSession).not.toHaveBeenCalled();
  });

  it('passes an enrolled session with a valid device-trust cookie', async () => {
    mocks.aal.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal2' }, error: null });
    const token = await issueAdminMfaTrustToken({ userId: 'synthetic-user', userAgent: 'synthetic-audit', ip: '192.0.2.1' });
    expect((await middleware(staffApiRequest(method, path, token))).status).toBe(200);
  });
});

it.each([
  ['GET', '/api/partner/referrals'],
  ['POST', '/api/partner/payouts'],
  ['GET', '/api/partner/payout/history'],
  ['GET', '/api/org/acme/outcomes'],
  ['PUT', '/api/org/acme/settings/extra'],
])('does not challenge non-admin partner and org APIs: %s %s', async (method, path) => {
  const response = await middleware(staffApiRequest(method, path));
  expect(response.status).toBe(200);
  expect(mocks.aal).not.toHaveBeenCalled();
});
