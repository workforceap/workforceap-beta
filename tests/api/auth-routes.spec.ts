import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Shared cookie-store mock builder ───
function createMockCookieStore(initial: { name: string; value: string }[] = []) {
  const jar = new Map(initial.map((c) => [c.name, c.value]));
  const setCalls: { name: string; value: string; options?: unknown }[] = [];

  const store = {
    get: vi.fn((name: string) => {
      const value = jar.get(name);
      return value ? { name, value } : undefined;
    }),
    getAll: vi.fn(() =>
      Array.from(jar.entries()).map(([name, value]) => ({ name, value }))
    ),
    set: vi.fn((name: string, value: string, options?: unknown) => {
      jar.set(name, value);
      setCalls.push({ name, value, options });
    }),
    _jar: jar,
    _setCalls: setCalls,
  };
  return store;
}

// ─── Mocks ───
vi.mock('next/server', () => {
  class MockNextRequest extends Request {
    get nextUrl() {
      return new URL(this.url);
    }
  }
  return {
    NextRequest: MockNextRequest,
    NextResponse: {
      json: (body: unknown, init?: ResponseInit) =>
        new Response(JSON.stringify(body), {
          ...init,
          headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
        }),
      redirect: (url: string | URL, status = 302) =>
        new Response(null, {
          status,
          headers: { location: String(url) },
        }),
    },
  };
});

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => Promise.resolve(createMockCookieStore())),
}));

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      getUser: vi.fn(),
      getSession: vi.fn(),
      mfa: {
        getAuthenticatorAssuranceLevel: vi.fn(),
        listFactors: vi.fn(),
        enroll: vi.fn(),
        challenge: vi.fn(),
        verify: vi.fn(),
      },
    },
  })),
}));

vi.mock('@/lib/supabaseCookieOptions', () => ({
  getSupabaseCookieOptions: vi.fn(() => ({ path: '/', sameSite: 'lax' })),
  SESSION_ONLY_COOKIE: 'wa_session_only',
}));

vi.mock('@/lib/supabase/env', () => ({
  getSupabaseEnv: vi.fn(() => ({ url: 'http://localhost:54321', anonKey: 'test-anon-key' })),
}));

vi.mock('@/lib/rate-limit', () => ({
  checkAuthRateLimit: vi.fn(() => Promise.resolve({ success: true })),
  checkAuthIpRateLimit: vi.fn(() => Promise.resolve({ success: true })),
  checkForgotPasswordRateLimit: vi.fn(() => Promise.resolve({ success: true })),
  checkForgotPasswordEmailRateLimit: vi.fn(() => Promise.resolve({ success: true })),
  checkVerifyMfaRateLimit: vi.fn(() => Promise.resolve({ success: true })),
}));

vi.mock('@/lib/auth/server', () => ({
  getUser: vi.fn(() => Promise.resolve(null)),
  hasSupabaseServerEnv: vi.fn(() => true),
  createSupabaseServerClient: vi.fn(() =>
    Promise.resolve({
      auth: {
        signOut: vi.fn(),
        getUser: vi.fn(),
        getSession: vi.fn(),
      },
    })
  ),
  resolveAuthGucContext: vi.fn(() => Promise.resolve({ userId: null, orgId: null, role: 'anonymous' })),
}));

vi.mock('@/lib/db/prisma', () => {
  const profile = { findUnique: vi.fn(() => Promise.resolve(null)) };
  const memberEvent = { create: vi.fn(() => Promise.resolve({})) };
  const user = { update: vi.fn(() => Promise.resolve({})), findUnique: vi.fn(() => Promise.resolve(null)) };
  const mockPrisma: any = {
    profile,
    memberEvent,
    user,
    $transaction: vi.fn((cb: any) => {
      if (typeof cb === 'function') return cb(mockPrisma);
      return Promise.all(cb);
    }),
  };
  return { prisma: mockPrisma };
});

vi.mock('@/lib/auth/postLoginRedirect', () => ({
  normalizePostLoginRedirect: vi.fn((raw: string | undefined, fallback = '/dashboard') =>
    raw ?? fallback
  ),
  resolveRoleAwarePostLoginRedirect: vi.fn((redirectTo: string) => redirectTo),
}));

vi.mock('@/lib/auth/mfaConfig', () => ({
  isStaffMfaEnforcementEnabled: vi.fn(() => true),
}));

vi.mock('@/lib/auth/mfaTrust', () => ({
  getAdminMfaTrustCookieName: vi.fn(() => 'wa_admin_mfa_trust'),
  getAdminMfaTrustCookieOptions: vi.fn(() => ({
    path: '/',
    maxAge: 604800,
    sameSite: 'lax' as const,
    secure: false,
    httpOnly: true,
  })),
  verifyAdminMfaTrustToken: vi.fn(() => Promise.resolve(false)),
  issueAdminMfaTrustToken: vi.fn(() => Promise.resolve('mock-trust-token')),
}));

vi.mock('@/lib/http/clientIp', () => ({
  getClientIpFromRequest: vi.fn(() => '127.0.0.1'),
}));

vi.mock('@/lib/auth/passwordReset', () => ({
  sendPasswordResetEmail: vi.fn(() => Promise.resolve({ error: null })),
}));

vi.mock('@/lib/auth/roles', () => ({
  getProfileRole: vi.fn(() => Promise.resolve('member')),
  getPartnerForUser: vi.fn(() => Promise.resolve(null)),
  getEmployerAccountForNav: vi.fn(() => Promise.resolve(null)),
  getCounselorForUser: vi.fn(() => Promise.resolve(null)),
  getUserRoles: vi.fn(() => Promise.resolve([])),
  isAdmin: vi.fn(() => Promise.resolve(false)),
  isSuperAdmin: vi.fn(() => Promise.resolve(false)),
}));

vi.mock('@/lib/auth/portalRoleSwitcher', () => ({
  getPortalSwitcherRoles: vi.fn(() => Promise.resolve([])),
}));

vi.mock('@/lib/observability/captureApiError', () => ({ captureApiResponseError: vi.fn(),
  captureApiError: vi.fn(),
}));

// ─── Imports after mocks ───
import { POST as loginPOST } from '@/app/api/auth/login/route';
import { POST as logoutPOST } from '@/app/api/auth/logout/route';
import { POST as forgotPasswordPOST } from '@/app/api/auth/forgot-password/route';
import { GET as meGET } from '@/app/api/auth/me/route';
import { GET as checkMfaRequiredGET } from '@/app/api/auth/check-mfa-required/route';
import { POST as setupMfaPOST, PATCH as setupMfaPATCH } from '@/app/api/auth/setup-mfa/route';
import { POST as verifyMfaPOST } from '@/app/api/auth/verify-mfa/route';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getUser, hasSupabaseServerEnv } from '@/lib/auth/server';
import { prisma } from '@/lib/db/prisma';
import {
  checkAuthRateLimit,
  checkAuthIpRateLimit,
  checkForgotPasswordRateLimit,
  checkForgotPasswordEmailRateLimit,
  checkVerifyMfaRateLimit,
} from '@/lib/rate-limit';
import { sendPasswordResetEmail } from '@/lib/auth/passwordReset';
import { isStaffMfaEnforcementEnabled } from '@/lib/auth/mfaConfig';
import { verifyAdminMfaTrustToken } from '@/lib/auth/mfaTrust';
import { getClientIpFromRequest } from '@/lib/http/clientIp';

const makeJsonRequest = (body: unknown, url = 'http://localhost:3000/api/auth/login') =>
  new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-wap-login-flow': 'client' },
    body: JSON.stringify(body),
  });

function resetLoginMocks() {
  vi.mocked(checkAuthRateLimit).mockResolvedValue({ success: true });
  vi.mocked(checkAuthIpRateLimit).mockResolvedValue({ success: true });
  vi.mocked(createServerClient).mockImplementation(() => ({
    auth: {
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      getUser: vi.fn(),
      getSession: vi.fn(),
      mfa: {
        getAuthenticatorAssuranceLevel: vi.fn(),
        listFactors: vi.fn(),
        enroll: vi.fn(),
        challenge: vi.fn(),
        verify: vi.fn(),
        unenroll: vi.fn(),
        challengeAndVerify: vi.fn(),
        webauthn: { challenge: vi.fn(), verify: vi.fn(), enroll: vi.fn(), unenroll: vi.fn() },
      },
    },
  }) as any);
  vi.mocked(prisma.profile.findUnique).mockResolvedValue(null);
  vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
  vi.mocked(isStaffMfaEnforcementEnabled).mockReturnValue(false);
  vi.mocked(verifyAdminMfaTrustToken).mockResolvedValue(false);
  vi.mocked(cookies).mockResolvedValue(createMockCookieStore() as any);
}

function resetForgotPasswordMocks() {
  vi.mocked(checkForgotPasswordRateLimit).mockResolvedValue({ success: true });
  vi.mocked(checkForgotPasswordEmailRateLimit).mockResolvedValue({ success: true });
  vi.mocked(sendPasswordResetEmail).mockResolvedValue({ error: null } as any);
}

function resetMeMocks() {
  vi.mocked(hasSupabaseServerEnv).mockReturnValue(true);
  vi.mocked(getUser).mockResolvedValue(null);
}

function resetMfaMocks() {
  vi.mocked(isStaffMfaEnforcementEnabled).mockReturnValue(true);
  vi.mocked(checkVerifyMfaRateLimit).mockResolvedValue({ success: true });
  vi.mocked(createServerClient).mockImplementation(() => ({
    auth: {
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      getUser: vi.fn(),
      getSession: vi.fn(),
      mfa: {
        getAuthenticatorAssuranceLevel: vi.fn(),
        listFactors: vi.fn(),
        enroll: vi.fn(),
        challenge: vi.fn(),
        verify: vi.fn(),
        unenroll: vi.fn(),
        challengeAndVerify: vi.fn(),
        webauthn: { challenge: vi.fn(), verify: vi.fn(), enroll: vi.fn(), unenroll: vi.fn() },
      },
    },
  }) as any);
  vi.mocked(prisma.profile.findUnique).mockResolvedValue(null);
  vi.mocked(verifyAdminMfaTrustToken).mockResolvedValue(false);
  vi.mocked(cookies).mockResolvedValue(createMockCookieStore() as any);
}

// ─────────────────────────────────────────────
// POST /api/auth/login
// ─────────────────────────────────────────────
describe('POST /api/auth/login', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetLoginMocks();
  });

  it.each(['success', 'provider-error', 'network-error'])('rejects a soft-deleted account and clears new session cookies when revocation has %s', async (outcome) => {
    const signOut = outcome === 'network-error'
      ? vi.fn().mockRejectedValue(new Error('Auth unavailable'))
      : vi.fn().mockResolvedValue({ error: outcome === 'provider-error' ? { message: 'Auth unavailable' } : null });
    vi.mocked(createServerClient).mockReturnValue({ auth: {
      signInWithPassword: vi.fn().mockResolvedValue({ data: { user: { id: 'deleted-user' }, session: { access_token: 'fixture' } }, error: null }),
      signOut,
    } } as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ deletedAt: new Date('2026-09-09T12:00:00Z') } as any);
    const cookieStore = createMockCookieStore([
      { name: 'sb-fixture-auth-token.0', value: 'new-session-part-0' },
      { name: 'sb-fixture-auth-token.1', value: 'new-session-part-1' },
      { name: 'theme', value: 'dark' },
    ]);
    vi.mocked(cookies).mockResolvedValue(cookieStore as any);
    const response = await loginPOST(makeJsonRequest({ email: 'deleted@example.test', password: 'fixture-password' }));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: expect.stringContaining("Your account isn't available") });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { id: 'deleted-user' }, select: { deletedAt: true } });
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
    for (const name of ['sb-fixture-auth-token.0', 'sb-fixture-auth-token.1', 'wa_session_only', 'wa_admin_mfa_trust']) {
      expect(cookieStore._setCalls).toContainEqual(expect.objectContaining({ name, value: '', options: expect.objectContaining({ maxAge: 0 }) }));
    }
    expect(cookieStore._jar.get('theme')).toBe('dark');
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it.each([null, { deletedAt: null }])('permits an authenticated active or not-yet-reconciled application account: %j', async (account) => {
    const signOut = vi.fn();
    const signInWithPassword = vi.fn().mockResolvedValue({ data: { user: { id: 'active-user' }, session: { access_token: 'fixture' } }, error: null });
    vi.mocked(createServerClient).mockReturnValue({ auth: { signInWithPassword, signOut } } as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(account as any);
    const response = await loginPOST(makeJsonRequest({ email: ' Active@Example.Test ', password: 'fixture-password' }));
    expect(response.status).toBe(200);
    expect(signInWithPassword).toHaveBeenCalledWith({ email: 'active@example.test', password: 'fixture-password' });
    expect(await response.json()).toMatchObject({ ok: true, redirectTo: '/dashboard' });
    expect(signOut).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid JSON body', async () => {
    const res = await loginPOST(
      new Request('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: 'not-json',
      })
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Invalid request');
  });

  it('returns 400 when email is missing', async () => {
    const res = await loginPOST(makeJsonRequest({ password: 'secret123' }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Email and password are required');
  });

  it('returns 400 when password is missing', async () => {
    const res = await loginPOST(makeJsonRequest({ email: 'jane@example.com' }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Email and password are required');
  });

  it('returns 429 when rate limited', async () => {
    vi.mocked(checkAuthRateLimit).mockResolvedValue({ success: false });
    vi.mocked(checkAuthIpRateLimit).mockResolvedValue({ success: true });

    const res = await loginPOST(
      makeJsonRequest({ email: 'jane@example.com', password: 'secret123' })
    );

    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toContain('Too many login attempts');
    expect(res.headers.get('Retry-After')).toBe('60');
  });

  it('returns 429 when IP bucket is rate limited', async () => {
    vi.mocked(checkAuthRateLimit).mockResolvedValue({ success: true });
    vi.mocked(checkAuthIpRateLimit).mockResolvedValue({ success: false });

    const res = await loginPOST(
      makeJsonRequest({ email: 'jane@example.com', password: 'secret123' })
    );

    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toContain('Too many login attempts');
    expect(res.headers.get('Retry-After')).toBe('60');
  });

  it('returns 429 when both buckets are rate limited', async () => {
    vi.mocked(checkAuthRateLimit).mockResolvedValue({ success: false });
    vi.mocked(checkAuthIpRateLimit).mockResolvedValue({ success: false });

    const res = await loginPOST(
      makeJsonRequest({ email: 'jane@example.com', password: 'secret123' })
    );

    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toContain('Too many login attempts');
    expect(res.headers.get('Retry-After')).toBe('60');
  });

  it('uses trusted client IP helper for login rate-limit keys', async () => {
    vi.mocked(getClientIpFromRequest).mockReturnValue('198.51.100.77');
    vi.mocked(createServerClient).mockReturnValue({
      auth: {
        signInWithPassword: vi.fn(() =>
          Promise.resolve({
            data: {
              session: { access_token: 'tok', refresh_token: 'ref' },
              user: { id: 'user-123', email: 'jane@example.com' },
            },
            error: null,
          })
        ),
        mfa: {
          getAuthenticatorAssuranceLevel: vi.fn(() =>
            Promise.resolve({ data: { currentLevel: 'aal1', nextLevel: 'aal1' } })
          ),
          listFactors: vi.fn(() => Promise.resolve({ data: { totp: [] } })),
        },
      },
    } as any);
    vi.mocked(prisma.profile.findUnique).mockResolvedValue({ role: 'member' } as any);
    const cookieStore = createMockCookieStore();
    vi.mocked(cookies).mockResolvedValue(cookieStore as any);

    const res = await loginPOST(
      makeJsonRequest({ email: 'Jane@Example.com', password: 'secret123' })
    );

    expect(res.status).toBe(200);
    expect(getClientIpFromRequest).toHaveBeenCalled();
    expect(checkAuthRateLimit).toHaveBeenCalledWith(
      'login:198.51.100.77:jane@example.com',
      expect.any(Request)
    );
    expect(checkAuthIpRateLimit).toHaveBeenCalledWith('198.51.100.77', expect.any(Request));
  });

  it('allows QA bypass when x-wap-qa-bypass header matches secret', async () => {
    const originalBypass = process.env.WAP_RATE_LIMIT_QA_BYPASS;
    const originalSecret = process.env.WAP_RATE_LIMIT_QA_SECRET;
    process.env.WAP_RATE_LIMIT_QA_BYPASS = '1';
    process.env.WAP_RATE_LIMIT_QA_SECRET = 'test-secret';

    try {
      vi.mocked(createServerClient).mockReturnValue({
        auth: {
          signInWithPassword: vi.fn(() =>
            Promise.resolve({
              data: {
                session: { access_token: 'tok', refresh_token: 'ref' },
                user: { id: 'user-123', email: 'jane@example.com' },
              },
              error: null,
            })
          ),
          mfa: {
            getAuthenticatorAssuranceLevel: vi.fn(() =>
              Promise.resolve({ data: { currentLevel: 'aal1', nextLevel: 'aal1' } })
            ),
            listFactors: vi.fn(() => Promise.resolve({ data: { totp: [] } })),
          },
        },
      } as any);
      vi.mocked(prisma.profile.findUnique).mockResolvedValue({
        role: 'member',
      } as any);

      const cookieStore = createMockCookieStore();
      vi.mocked(cookies).mockResolvedValue(cookieStore as any);

      const req = new Request('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-wap-login-flow': 'client',
          'x-wap-qa-bypass': 'test-secret',
        },
        body: JSON.stringify({ email: 'jane@example.com', password: 'secret123' }),
      });

      const res = await loginPOST(req);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
    } finally {
      process.env.WAP_RATE_LIMIT_QA_BYPASS = originalBypass;
      process.env.WAP_RATE_LIMIT_QA_SECRET = originalSecret;
    }
  });

  it('returns 401 for invalid credentials', async () => {
    vi.mocked(createServerClient).mockReturnValue({
      auth: {
        signInWithPassword: vi.fn(() =>
          Promise.resolve({ data: {}, error: { message: 'Invalid login credentials' } })
        ),
        mfa: {
          getAuthenticatorAssuranceLevel: vi.fn(() =>
            Promise.resolve({ data: { currentLevel: 'aal1', nextLevel: 'aal1' } })
          ),
          listFactors: vi.fn(() => Promise.resolve({ data: { totp: [] } })),
        },
      },
    } as any);

    const res = await loginPOST(
      makeJsonRequest({ email: 'jane@example.com', password: 'wrong' })
    );

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toContain('Incorrect email or password.');
    expect(body.error).toContain('Forgot password?');
  });

  it('reports a Supabase-side rate limit instead of blaming the password', async () => {
    vi.mocked(createServerClient).mockReturnValue({
      auth: {
        signInWithPassword: vi.fn(() =>
          Promise.resolve({
            data: {},
            error: { message: 'Request rate limit reached', status: 429 },
          })
        ),
        mfa: {
          getAuthenticatorAssuranceLevel: vi.fn(),
          listFactors: vi.fn(),
        },
      },
    } as any);

    const res = await loginPOST(makeJsonRequest({ email: 'jane@example.com', password: 'right' }));

    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('60');
    const body = await res.json();
    expect(body.error).toContain('Too many sign-in attempts');
    expect(body.error).not.toContain('Incorrect email or password');
  });

  it('reports an auth provider outage as temporary, not as wrong credentials', async () => {
    vi.mocked(createServerClient).mockReturnValue({
      auth: {
        signInWithPassword: vi.fn(() =>
          Promise.resolve({
            data: {},
            error: { message: 'Database error querying schema', status: 500 },
          })
        ),
        mfa: {
          getAuthenticatorAssuranceLevel: vi.fn(),
          listFactors: vi.fn(),
        },
      },
    } as any);

    const res = await loginPOST(makeJsonRequest({ email: 'jane@example.com', password: 'right' }));

    expect(res.status).toBe(503);
    expect(res.headers.get('Retry-After')).toBe('60');
    const body = await res.json();
    expect(body.error).toContain('temporarily unavailable');
    expect(body.error).not.toContain('Incorrect email or password');
  });

  it('returns friendly 401 for unconfirmed email', async () => {
    vi.mocked(createServerClient).mockReturnValue({
      auth: {
        signInWithPassword: vi.fn(() =>
          Promise.resolve({
            data: {},
            error: { message: 'Email not confirmed' },
          })
        ),
        mfa: {
          getAuthenticatorAssuranceLevel: vi.fn(() =>
            Promise.resolve({ data: { currentLevel: 'aal1', nextLevel: 'aal1' } })
          ),
          listFactors: vi.fn(() => Promise.resolve({ data: { totp: [] } })),
        },
      },
    } as any);

    const res = await loginPOST(
      makeJsonRequest({ email: 'jane@example.com', password: 'secret123' })
    );

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toContain("been verified yet");
  });

  it('returns friendly 401 for disabled account', async () => {
    vi.mocked(createServerClient).mockReturnValue({
      auth: {
        signInWithPassword: vi.fn(() =>
          Promise.resolve({
            data: {},
            error: { message: 'user disabled' },
          })
        ),
        mfa: {
          getAuthenticatorAssuranceLevel: vi.fn(() =>
            Promise.resolve({ data: { currentLevel: 'aal1', nextLevel: 'aal1' } })
          ),
          listFactors: vi.fn(() => Promise.resolve({ data: { totp: [] } })),
        },
      },
    } as any);

    const res = await loginPOST(
      makeJsonRequest({ email: 'jane@example.com', password: 'secret123' })
    );

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toContain("isn't available");
  });

  it('returns 401 when no session returned', async () => {
    vi.mocked(createServerClient).mockReturnValue({
      auth: {
        signInWithPassword: vi.fn(() =>
          Promise.resolve({ data: { session: null }, error: null })
        ),
        mfa: {
          getAuthenticatorAssuranceLevel: vi.fn(() =>
            Promise.resolve({ data: { currentLevel: 'aal1', nextLevel: 'aal1' } })
          ),
          listFactors: vi.fn(() => Promise.resolve({ data: { totp: [] } })),
        },
      },
    } as any);

    const res = await loginPOST(
      makeJsonRequest({ email: 'jane@example.com', password: 'secret123' })
    );

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Login failed. Please try again.');
  });

  it('logs in successfully for member without MFA', async () => {
    vi.mocked(createServerClient).mockReturnValue({
      auth: {
        signInWithPassword: vi.fn(() =>
          Promise.resolve({
            data: {
              session: { access_token: 'tok', refresh_token: 'ref' },
              user: { id: 'user-123', email: 'jane@example.com' },
            },
            error: null,
          })
        ),
        mfa: {
          getAuthenticatorAssuranceLevel: vi.fn(() =>
            Promise.resolve({ data: { currentLevel: 'aal1', nextLevel: 'aal1' } })
          ),
          listFactors: vi.fn(() => Promise.resolve({ data: { totp: [] } })),
        },
      },
    } as any);
    vi.mocked(prisma.profile.findUnique).mockResolvedValue({
      role: 'member',
    } as any);

    const cookieStore = createMockCookieStore();
    vi.mocked(cookies).mockResolvedValue(cookieStore as any);

    const res = await loginPOST(
      makeJsonRequest({ email: 'jane@example.com', password: 'secret123' })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.redirectTo).toBe('/dashboard');
  });

  it('sets session-only cookie when rememberMe is false', async () => {
    vi.mocked(createServerClient).mockReturnValue({
      auth: {
        signInWithPassword: vi.fn(() =>
          Promise.resolve({
            data: {
              session: { access_token: 'tok' },
              user: { id: 'user-123' },
            },
            error: null,
          })
        ),
        mfa: {
          getAuthenticatorAssuranceLevel: vi.fn(() =>
            Promise.resolve({ data: { currentLevel: 'aal1', nextLevel: 'aal1' } })
          ),
        },
      },
    } as any);
    vi.mocked(prisma.profile.findUnique).mockResolvedValue({ role: 'member' } as any);

    const cookieStore = createMockCookieStore();
    vi.mocked(cookies).mockResolvedValue(cookieStore as any);

    const res = await loginPOST(
      makeJsonRequest({ email: 'jane@example.com', password: 'secret123', rememberMe: false })
    );

    expect(res.status).toBe(200);
    const sessionOnlySet = cookieStore._setCalls.find(
      (c) => c.name === 'wa_session_only'
    );
    expect(sessionOnlySet).toBeDefined();
    expect(sessionOnlySet!.value).toBe('1');
  });

  it('clears session-only cookie when rememberMe is true', async () => {
    vi.mocked(createServerClient).mockReturnValue({
      auth: {
        signInWithPassword: vi.fn(() =>
          Promise.resolve({
            data: {
              session: { access_token: 'tok' },
              user: { id: 'user-123' },
            },
            error: null,
          })
        ),
        mfa: {
          getAuthenticatorAssuranceLevel: vi.fn(() =>
            Promise.resolve({ data: { currentLevel: 'aal1', nextLevel: 'aal1' } })
          ),
        },
      },
    } as any);
    vi.mocked(prisma.profile.findUnique).mockResolvedValue({ role: 'member' } as any);

    const cookieStore = createMockCookieStore([{ name: 'wa_session_only', value: '1' }]);
    vi.mocked(cookies).mockResolvedValue(cookieStore as any);

    const res = await loginPOST(
      makeJsonRequest({ email: 'jane@example.com', password: 'secret123', rememberMe: true })
    );

    expect(res.status).toBe(200);
    const clearCall = cookieStore._setCalls.find((c) => c.name === 'wa_session_only');
    expect(clearCall).toBeDefined();
    expect(clearCall!.value).toBe('');
  });

  it('requires MFA setup for staff with no TOTP enrolled', async () => {
    vi.mocked(isStaffMfaEnforcementEnabled).mockReturnValue(true);
    vi.mocked(createServerClient).mockReturnValue({
      auth: {
        signInWithPassword: vi.fn(() =>
          Promise.resolve({
            data: {
              session: { access_token: 'tok' },
              user: { id: 'user-123' },
            },
            error: null,
          })
        ),
        mfa: {
          getAuthenticatorAssuranceLevel: vi.fn(() =>
            Promise.resolve({ data: { currentLevel: 'aal1', nextLevel: 'aal1' } })
          ),
          listFactors: vi.fn(() => Promise.resolve({ data: { totp: [] } })),
        },
      },
    } as any);
    vi.mocked(prisma.profile.findUnique).mockResolvedValue({ role: 'admin' } as any);

    const res = await loginPOST(
      makeJsonRequest({ email: 'admin@example.com', password: 'secret123' })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mfaSetupRequired).toBe(true);
    expect(body.redirectTo).toContain('/setup-mfa');
  });

  it('requires MFA verification for staff with TOTP enrolled', async () => {
    vi.mocked(isStaffMfaEnforcementEnabled).mockReturnValue(true);
    vi.mocked(createServerClient).mockReturnValue({
      auth: {
        signInWithPassword: vi.fn(() =>
          Promise.resolve({
            data: {
              session: { access_token: 'tok' },
              user: { id: 'user-123' },
            },
            error: null,
          })
        ),
        mfa: {
          getAuthenticatorAssuranceLevel: vi.fn(() =>
            Promise.resolve({ data: { currentLevel: 'aal1', nextLevel: 'aal2' } })
          ),
          listFactors: vi.fn(() =>
            Promise.resolve({ data: { totp: [{ id: 'factor-1' }] } })
          ),
        },
      },
    } as any);
    vi.mocked(prisma.profile.findUnique).mockResolvedValue({ role: 'admin' } as any);
    vi.mocked(verifyAdminMfaTrustToken).mockResolvedValue(false);

    const res = await loginPOST(
      makeJsonRequest({ email: 'admin@example.com', password: 'secret123' })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mfaRequired).toBe(true);
    expect(body.redirectTo).toContain('/verify-mfa');
  });

  it('bypasses MFA for trusted device', async () => {
    vi.mocked(isStaffMfaEnforcementEnabled).mockReturnValue(true);
    vi.mocked(createServerClient).mockReturnValue({
      auth: {
        signInWithPassword: vi.fn(() =>
          Promise.resolve({
            data: {
              session: { access_token: 'tok' },
              user: { id: 'user-123' },
            },
            error: null,
          })
        ),
        mfa: {
          getAuthenticatorAssuranceLevel: vi.fn(() =>
            Promise.resolve({ data: { currentLevel: 'aal1', nextLevel: 'aal2' } })
          ),
          listFactors: vi.fn(() =>
            Promise.resolve({ data: { totp: [{ id: 'factor-1' }] } })
          ),
        },
      },
    } as any);
    vi.mocked(prisma.profile.findUnique).mockResolvedValue({ role: 'admin' } as any);
    vi.mocked(verifyAdminMfaTrustToken).mockResolvedValue(true);

    const res = await loginPOST(
      new Request('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-wap-login-flow': 'client',
        },
        body: JSON.stringify({ email: 'admin@example.com', password: 'secret123' }),
      })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mfaTrusted).toBe(true);
    expect(body.redirectTo).toBeDefined();
  });

  it('returns 302 redirect for server-side login flow', async () => {
    vi.mocked(createServerClient).mockReturnValue({
      auth: {
        signInWithPassword: vi.fn(() =>
          Promise.resolve({
            data: {
              session: { access_token: 'tok' },
              user: { id: 'user-123' },
            },
            error: null,
          })
        ),
        mfa: {
          getAuthenticatorAssuranceLevel: vi.fn(() =>
            Promise.resolve({ data: { currentLevel: 'aal1', nextLevel: 'aal1' } })
          ),
        },
      },
    } as any);
    vi.mocked(prisma.profile.findUnique).mockResolvedValue({ role: 'member' } as any);

    const res = await loginPOST(
      new Request('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'jane@example.com', password: 'secret123' }),
      })
    );

    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toContain('/dashboard');
  });
});

// ─────────────────────────────────────────────
// POST /api/auth/logout
// ─────────────────────────────────────────────
describe('POST /api/auth/logout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(cookies).mockResolvedValue(createMockCookieStore() as any);
  });

  it('signs out and clears cookies', async () => {
    const signOutFn = vi.fn(() => Promise.resolve({ error: null }));
    const { createSupabaseServerClient } = await import('@/lib/auth/server');
    vi.mocked(createSupabaseServerClient).mockResolvedValue({
      auth: { signOut: signOutFn },
    } as any);

    const cookieStore = createMockCookieStore();
    vi.mocked(cookies).mockResolvedValue(cookieStore as any);

    const res = await logoutPOST(new Request('http://localhost/api/auth/logout', { method: 'POST' }));

    expect(signOutFn).toHaveBeenCalled();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    const sessionClear = cookieStore._setCalls.find((c) => c.name === 'wa_session_only');
    expect(sessionClear).toBeDefined();
    expect(sessionClear!.value).toBe('');
    expect(sessionClear!.options).toMatchObject({ maxAge: 0 });

    const trustClear = cookieStore._setCalls.find((c) => c.name === 'wa_admin_mfa_trust');
    expect(trustClear).toBeDefined();
    expect(trustClear!.value).toBe('');
  });

  it('clears the local session even when the provider client cannot be created', async () => {
    const { createSupabaseServerClient } = await import('@/lib/auth/server');
    vi.mocked(createSupabaseServerClient).mockRejectedValue(new Error('Supabase down'));
    const cookieStore = createMockCookieStore([{ name: 'sb-fixture-auth-token', value: 'synthetic' }]);
    vi.mocked(cookies).mockResolvedValue(cookieStore as any);

    const res = await logoutPOST(new Request('http://localhost/api/auth/logout', { method: 'POST' }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true, globalSignOut: false });
    expect(cookieStore._jar.get('sb-fixture-auth-token')).toBe('');
  });
});

// ─────────────────────────────────────────────
// POST /api/auth/forgot-password
// ─────────────────────────────────────────────
describe('POST /api/auth/forgot-password', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetForgotPasswordMocks();
  });

  it('returns 400 for invalid JSON', async () => {
    const res = await forgotPasswordPOST(
      new Request('http://localhost:3000/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: 'not-json',
      })
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Invalid request');
  });

  it('returns 400 when email is missing', async () => {
    const res = await forgotPasswordPOST(makeJsonRequest({}, 'http://localhost:3000/api/auth/forgot-password'));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Email is required');
  });

  it('returns 429 when IP rate limited', async () => {
    vi.mocked(checkForgotPasswordRateLimit).mockResolvedValue({ success: false });

    const res = await forgotPasswordPOST(
      makeJsonRequest({ email: 'jane@example.com' }, 'http://localhost:3000/api/auth/forgot-password')
    );

    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toContain('Too many reset requests');
  });

  it('returns uniform success for non-existent email', async () => {
    vi.mocked(sendPasswordResetEmail).mockResolvedValue({ error: { message: 'User not found' }, via: 'skipped' } as any);

    const res = await forgotPasswordPOST(
      makeJsonRequest({ email: 'nobody@example.com' }, 'http://localhost:3000/api/auth/forgot-password')
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.message).toContain('If an account exists');
  });

  it('returns uniform success for existing email', async () => {
    vi.mocked(sendPasswordResetEmail).mockResolvedValue({ error: null } as any);

    const res = await forgotPasswordPOST(
      makeJsonRequest({ email: 'jane@example.com' }, 'http://localhost:3000/api/auth/forgot-password')
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.message).toContain('If an account exists');
  });

  it('returns a safe retryable error when sendPasswordResetEmail throws', async () => {
    vi.mocked(sendPasswordResetEmail).mockRejectedValue(new Error('SMTP failure'));

    const res = await forgotPasswordPOST(
      makeJsonRequest({ email: 'jane@example.com' }, 'http://localhost:3000/api/auth/forgot-password')
    );

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toContain('Password reset is temporarily unavailable');
    expect(body.error).not.toContain('SMTP failure');
  });
});

// ─────────────────────────────────────────────
// GET /api/auth/me
// ─────────────────────────────────────────────
describe('GET /api/auth/me', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMeMocks();
  });

  it('returns null fields when Supabase env is missing', async () => {
    vi.mocked(hasSupabaseServerEnv).mockReturnValue(false);

    const res = await meGET(new Request('http://localhost:3000/api/auth/me'));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.role).toBeNull();
    expect(body.superAdmin).toBe(false);
  });

  it('returns null fields when user is unauthenticated', async () => {
    vi.mocked(getUser).mockResolvedValue(null);

    const res = await meGET(new Request('http://localhost:3000/api/auth/me'));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.role).toBeNull();
    expect(body.canAccessMemberDashboard).toBe(false);
  });

  it('returns full context for authenticated member', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'user-123', email: 'jane@example.com' } as any);

    const { getProfileRole, getPartnerForUser, getEmployerAccountForNav, getCounselorForUser, isSuperAdmin } =
      await import('@/lib/auth/roles');
    vi.mocked(getProfileRole).mockResolvedValue('member');
    vi.mocked(getPartnerForUser).mockResolvedValue(null);
    vi.mocked(getEmployerAccountForNav).mockResolvedValue(null);
    vi.mocked(getCounselorForUser).mockResolvedValue(null);
    vi.mocked(isSuperAdmin).mockResolvedValue(false);

    const { getPortalSwitcherRoles } = await import('@/lib/auth/portalRoleSwitcher');
    vi.mocked(getPortalSwitcherRoles).mockResolvedValue([
      { role: 'member', roleLabel: 'Member', homeHref: '/dashboard' },
    ]);

    const res = await meGET(new Request('http://localhost:3000/api/auth/me'));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.role).toBe('member');
    expect(body.superAdmin).toBe(false);
    expect(body.canAccessMemberDashboard).toBe(true);
    expect(body.availablePortals).toEqual([{ role: 'member', roleLabel: 'Member', homeHref: '/dashboard' }]);
  });

  it('does not advertise member dashboard access to staff with only another portal', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'user-employer', email: 'employer@example.com' } as any);
    const { getProfileRole, isSuperAdmin } = await import('@/lib/auth/roles');
    vi.mocked(getProfileRole).mockResolvedValue('employer');
    vi.mocked(isSuperAdmin).mockResolvedValue(false);
    const { getPortalSwitcherRoles } = await import('@/lib/auth/portalRoleSwitcher');
    vi.mocked(getPortalSwitcherRoles).mockResolvedValue([
      { role: 'employer', roleLabel: 'Employer', homeHref: '/employer' },
    ]);

    const res = await meGET(new Request('http://localhost:3000/api/auth/me'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.canAccessMemberDashboard).toBe(false);
    expect(body.availablePortals).toEqual([{ role: 'employer', roleLabel: 'Employer', homeHref: '/employer' }]);
  });

  it('returns superAdmin true when UserRole grants super_admin even if profile is member', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'user-sa', email: 'mike@example.com' } as any);

    const { getProfileRole, isSuperAdmin } = await import('@/lib/auth/roles');
    vi.mocked(getProfileRole).mockResolvedValue('member');
    vi.mocked(isSuperAdmin).mockResolvedValue(true);

    const { getPortalSwitcherRoles } = await import('@/lib/auth/portalRoleSwitcher');
    vi.mocked(getPortalSwitcherRoles).mockResolvedValue([
      { role: 'member', roleLabel: 'Member', homeHref: '/dashboard' },
      { role: 'admin', roleLabel: 'Admin', homeHref: '/admin' },
    ]);

    const res = await meGET(new Request('http://localhost:3000/api/auth/me'));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.superAdmin).toBe(true);
    expect(body.canAccessMemberDashboard).toBe(true);
    expect(isSuperAdmin).toHaveBeenCalledWith('user-sa');
    expect(getPortalSwitcherRoles).toHaveBeenCalledWith(
      'user-sa',
      expect.objectContaining({ superAdmin: true }),
    );
  });

  it('returns 500 on unexpected error', async () => {
    vi.mocked(getUser).mockRejectedValue(new Error('DB failure'));

    const res = await meGET(new Request('http://localhost:3000/api/auth/me'));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Internal server error');
  });
});

// ─────────────────────────────────────────────
// GET /api/auth/check-mfa-required
// ─────────────────────────────────────────────
describe('GET /api/auth/check-mfa-required', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMfaMocks();
  });

  it('fails closed in a read-only audit when profile-role metadata cannot load', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'user-123', email: 'jane@example.com' } as any);
    const { getProfileRole } = await import('@/lib/auth/roles');
    vi.mocked(getProfileRole).mockRejectedValue(new Error('role database unavailable'));

    const res = await meGET(new Request('http://localhost:3000/api/auth/me', {
      headers: { 'x-workforceap-read-only-audit': '1' },
    }));

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error' });
  });

  it('returns a read-only audit placeholder before rate limits, auth providers, or cookies', async () => {
    const res = await checkMfaRequiredGET(
      new Request('http://localhost:3000/api/auth/check-mfa-required', {
        headers: { 'x-workforceap-read-only-audit': '1' },
      })
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      mfaRequired: false,
      auditSuppressed: true,
    });
    expect(checkAuthRateLimit).not.toHaveBeenCalled();
    expect(createServerClient).not.toHaveBeenCalled();
    expect(cookies).not.toHaveBeenCalled();
  });

  it('returns disabled when MFA enforcement is off', async () => {
    vi.mocked(isStaffMfaEnforcementEnabled).mockReturnValue(false);

    const res = await checkMfaRequiredGET(
      new Request('http://localhost:3000/api/auth/check-mfa-required')
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mfaRequired).toBe(false);
    expect(body.mfaEnforcement).toBe(false);
    expect(body.reason).toBe('mfa_enforcement_disabled');
  });

  it('returns 401 when session cannot get AAL', async () => {
    vi.mocked(createServerClient).mockReturnValue({
      auth: {
        mfa: {
          getAuthenticatorAssuranceLevel: vi.fn(() =>
            Promise.resolve({ data: null, error: { message: 'no session' } })
          ),
        },
      },
    } as any);

    const res = await checkMfaRequiredGET(
      new Request('http://localhost:3000/api/auth/check-mfa-required')
    );

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.reason).toBe('no_session');
  });

  it('returns mfaRequired=true for staff at aal1 needing aal2', async () => {
    vi.mocked(createServerClient).mockReturnValue({
      auth: {
        getUser: vi.fn(() => Promise.resolve({ data: { user: { id: 'user-123' } } })),
        mfa: {
          getAuthenticatorAssuranceLevel: vi.fn(() =>
            Promise.resolve({ data: { currentLevel: 'aal1', nextLevel: 'aal2' } })
          ),
        },
      },
    } as any);
    vi.mocked(prisma.profile.findUnique).mockResolvedValue({ role: 'admin' } as any);
    vi.mocked(verifyAdminMfaTrustToken).mockResolvedValue(false);

    const res = await checkMfaRequiredGET(
      new Request('http://localhost:3000/api/auth/check-mfa-required')
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mfaRequired).toBe(true);
    expect(body.mfaEnforcement).toBe(true);
  });

  it('returns mfaRequired=false for trusted device', async () => {
    vi.mocked(createServerClient).mockReturnValue({
      auth: {
        getUser: vi.fn(() => Promise.resolve({ data: { user: { id: 'user-123' } } })),
        mfa: {
          getAuthenticatorAssuranceLevel: vi.fn(() =>
            Promise.resolve({ data: { currentLevel: 'aal1', nextLevel: 'aal2' } })
          ),
        },
      },
    } as any);
    vi.mocked(prisma.profile.findUnique).mockResolvedValue({ role: 'admin' } as any);
    vi.mocked(verifyAdminMfaTrustToken).mockResolvedValue(true);

    const res = await checkMfaRequiredGET(
      new Request('http://localhost:3000/api/auth/check-mfa-required')
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mfaRequired).toBe(false);
  });

  it('returns mfaRequired=false when already at aal2', async () => {
    vi.mocked(createServerClient).mockReturnValue({
      auth: {
        mfa: {
          getAuthenticatorAssuranceLevel: vi.fn(() =>
            Promise.resolve({ data: { currentLevel: 'aal2', nextLevel: 'aal2' } })
          ),
        },
      },
    } as any);

    const res = await checkMfaRequiredGET(
      new Request('http://localhost:3000/api/auth/check-mfa-required')
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mfaRequired).toBe(false);
  });
});

// ─────────────────────────────────────────────
// POST /api/auth/setup-mfa
// ─────────────────────────────────────────────
describe('POST /api/auth/setup-mfa', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMfaMocks();
  });

  it('returns 404 when MFA enforcement is disabled', async () => {
    vi.mocked(isStaffMfaEnforcementEnabled).mockReturnValue(false);

    const res = await setupMfaPOST(
      new Request('http://localhost:3000/api/auth/setup-mfa', { method: 'POST' })
    );

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('MFA setup is currently disabled.');
  });

  it('returns 400 when MFA already enrolled', async () => {
    vi.mocked(createServerClient).mockReturnValue({
      auth: {
        mfa: {
          listFactors: vi.fn(() =>
            Promise.resolve({ data: { totp: [{ id: 'factor-1' }] } })
          ),
        },
      },
    } as any);

    const res = await setupMfaPOST(
      new Request('http://localhost:3000/api/auth/setup-mfa', { method: 'POST' })
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('MFA already enrolled.');
  });

  it('enrolls TOTP successfully', async () => {
    vi.mocked(createServerClient).mockReturnValue({
      auth: {
        mfa: {
          listFactors: vi.fn(() => Promise.resolve({ data: { totp: [] } })),
          enroll: vi.fn(() =>
            Promise.resolve({
              data: {
                id: 'factor-new',
                totp: {
                  qr_code: 'data:image/png;base64,abc',
                  secret: 'SECRET123',
                  uri: 'otpauth://totp/WorkforceAP?secret=SECRET123',
                },
              },
              error: null,
            })
          ),
        },
      },
    } as any);

    const res = await setupMfaPOST(
      new Request('http://localhost:3000/api/auth/setup-mfa', { method: 'POST' })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.factorId).toBe('factor-new');
    expect(body.qr).toBe('data:image/png;base64,abc');
    expect(body.secret).toBe('SECRET123');
  });

  it('returns 500 when enroll fails', async () => {
    vi.mocked(createServerClient).mockReturnValue({
      auth: {
        mfa: {
          listFactors: vi.fn(() => Promise.resolve({ data: { totp: [] } })),
          enroll: vi.fn(() =>
            Promise.resolve({ data: null, error: { message: 'Rate limit exceeded' } })
          ),
        },
      },
    } as any);

    const res = await setupMfaPOST(
      new Request('http://localhost:3000/api/auth/setup-mfa', { method: 'POST' })
    );

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Failed to start MFA enrollment.');
  });
});

// ─────────────────────────────────────────────
// PATCH /api/auth/setup-mfa
// ─────────────────────────────────────────────
describe('PATCH /api/auth/setup-mfa', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMfaMocks();
  });

  it('returns 404 when MFA enforcement is disabled', async () => {
    vi.mocked(isStaffMfaEnforcementEnabled).mockReturnValue(false);

    const res = await setupMfaPATCH(
      makeJsonRequest({ factorId: 'f1', code: '123456' }, 'http://localhost:3000/api/auth/setup-mfa')
    );

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('MFA setup is currently disabled.');
  });

  it('returns 400 when factorId is missing', async () => {
    const res = await setupMfaPATCH(
      makeJsonRequest({ code: '123456' }, 'http://localhost:3000/api/auth/setup-mfa')
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Factor ID and code are required.');
  });

  it('returns 400 when code is missing', async () => {
    const res = await setupMfaPATCH(
      makeJsonRequest({ factorId: 'f1' }, 'http://localhost:3000/api/auth/setup-mfa')
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Factor ID and code are required.');
  });

  it('returns 500 when challenge creation fails', async () => {
    vi.mocked(createServerClient).mockReturnValue({
      auth: {
        mfa: {
          challenge: vi.fn(() =>
            Promise.resolve({ data: null, error: { message: 'Network error' } })
          ),
        },
      },
    } as any);

    const res = await setupMfaPATCH(
      makeJsonRequest({ factorId: 'f1', code: '123456' }, 'http://localhost:3000/api/auth/setup-mfa')
    );

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Failed to create challenge.');
  });

  it('returns 401 for invalid code', async () => {
    vi.mocked(createServerClient).mockReturnValue({
      auth: {
        mfa: {
          challenge: vi.fn(() => Promise.resolve({ data: { id: 'challenge-1' }, error: null })),
          verify: vi.fn(() =>
            Promise.resolve({ data: null, error: { message: 'Invalid TOTP' } })
          ),
        },
      },
    } as any);

    const res = await setupMfaPATCH(
      makeJsonRequest({ factorId: 'f1', code: '000000' }, 'http://localhost:3000/api/auth/setup-mfa')
    );

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toContain('Invalid code');
  });

  it('confirms enrollment with valid code', async () => {
    vi.mocked(createServerClient).mockReturnValue({
      auth: {
        mfa: {
          challenge: vi.fn(() => Promise.resolve({ data: { id: 'challenge-1' }, error: null })),
          verify: vi.fn(() => Promise.resolve({ data: {}, error: null })),
        },
      },
    } as any);

    const res = await setupMfaPATCH(
      makeJsonRequest({ factorId: 'f1', code: '123456' }, 'http://localhost:3000/api/auth/setup-mfa')
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.message).toBe('MFA enabled successfully.');
  });
});

// ─────────────────────────────────────────────
// POST /api/auth/verify-mfa
// ─────────────────────────────────────────────
describe('POST /api/auth/verify-mfa', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMfaMocks();
  });

  it('returns 404 when MFA enforcement is disabled', async () => {
    vi.mocked(isStaffMfaEnforcementEnabled).mockReturnValue(false);

    const res = await verifyMfaPOST(
      makeJsonRequest({ code: '123456' }, 'http://localhost:3000/api/auth/verify-mfa')
    );

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('MFA verification is currently disabled.');
  });

  it('returns 429 when rate limited', async () => {
    vi.mocked(checkVerifyMfaRateLimit).mockResolvedValue({ success: false });

    const res = await verifyMfaPOST(
      makeJsonRequest({ code: '123456' }, 'http://localhost:3000/api/auth/verify-mfa')
    );

    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toContain('Too many verification attempts');
  });

  it('uses trusted client IP helper for MFA verify rate limits', async () => {
    vi.mocked(getClientIpFromRequest).mockReturnValue('198.51.100.88');
    vi.mocked(checkVerifyMfaRateLimit).mockResolvedValue({ success: false });

    const res = await verifyMfaPOST(
      makeJsonRequest({ code: '123456' }, 'http://localhost:3000/api/auth/verify-mfa')
    );

    expect(res.status).toBe(429);
    expect(getClientIpFromRequest).toHaveBeenCalled();
    expect(checkVerifyMfaRateLimit).toHaveBeenCalledWith('198.51.100.88');
  });

  it('returns 400 when code is missing', async () => {
    const res = await verifyMfaPOST(
      makeJsonRequest({}, 'http://localhost:3000/api/auth/verify-mfa')
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('6-digit verification code');
  });

  it('returns 401 when AAL check fails', async () => {
    vi.mocked(createServerClient).mockReturnValue({
      auth: {
        mfa: {
          getAuthenticatorAssuranceLevel: vi.fn(() =>
            Promise.resolve({ data: null, error: { message: 'Session expired' } })
          ),
        },
      },
    } as any);

    const res = await verifyMfaPOST(
      makeJsonRequest({ code: '123456' }, 'http://localhost:3000/api/auth/verify-mfa')
    );

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toContain('Session expired');
  });

  it('returns 400 when no MFA required', async () => {
    vi.mocked(createServerClient).mockReturnValue({
      auth: {
        mfa: {
          getAuthenticatorAssuranceLevel: vi.fn(() =>
            Promise.resolve({ data: { currentLevel: 'aal2', nextLevel: 'aal2' } })
          ),
        },
      },
    } as any);

    const res = await verifyMfaPOST(
      makeJsonRequest({ code: '123456' }, 'http://localhost:3000/api/auth/verify-mfa')
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('No MFA required or session invalid.');
  });

  it('returns 400 when no TOTP factor found', async () => {
    vi.mocked(createServerClient).mockReturnValue({
      auth: {
        mfa: {
          getAuthenticatorAssuranceLevel: vi.fn(() =>
            Promise.resolve({ data: { currentLevel: 'aal1', nextLevel: 'aal2' } })
          ),
          listFactors: vi.fn(() =>
            Promise.resolve({ data: { totp: [] }, error: null })
          ),
        },
      },
    } as any);

    const res = await verifyMfaPOST(
      makeJsonRequest({ code: '123456' }, 'http://localhost:3000/api/auth/verify-mfa')
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('No MFA factor found');
  });

  it('returns 500 when challenge creation fails', async () => {
    vi.mocked(createServerClient).mockReturnValue({
      auth: {
        mfa: {
          getAuthenticatorAssuranceLevel: vi.fn(() =>
            Promise.resolve({ data: { currentLevel: 'aal1', nextLevel: 'aal2' } })
          ),
          listFactors: vi.fn(() =>
            Promise.resolve({ data: { totp: [{ id: 'factor-1' }] }, error: null })
          ),
          challenge: vi.fn(() =>
            Promise.resolve({ data: null, error: { message: 'Network error' } })
          ),
        },
      },
    } as any);

    const res = await verifyMfaPOST(
      makeJsonRequest({ code: '123456' }, 'http://localhost:3000/api/auth/verify-mfa')
    );

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain('Failed to create MFA challenge');
  });

  it('returns 401 for invalid verification code', async () => {
    vi.mocked(createServerClient).mockReturnValue({
      auth: {
        mfa: {
          getAuthenticatorAssuranceLevel: vi.fn(() =>
            Promise.resolve({ data: { currentLevel: 'aal1', nextLevel: 'aal2' } })
          ),
          listFactors: vi.fn(() =>
            Promise.resolve({ data: { totp: [{ id: 'factor-1' }] }, error: null })
          ),
          challenge: vi.fn(() => Promise.resolve({ data: { id: 'challenge-1' }, error: null })),
          verify: vi.fn(() =>
            Promise.resolve({ data: null, error: { message: 'Invalid code' } })
          ),
        },
      },
    } as any);

    const res = await verifyMfaPOST(
      makeJsonRequest({ code: '000000' }, 'http://localhost:3000/api/auth/verify-mfa')
    );

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toContain('Invalid verification code');
  });

  it('verifies successfully and sets trust cookie', async () => {
    vi.mocked(createServerClient).mockReturnValue({
      auth: {
        mfa: {
          getAuthenticatorAssuranceLevel: vi.fn(() =>
            Promise.resolve({ data: { currentLevel: 'aal1', nextLevel: 'aal2' } })
          ),
          listFactors: vi.fn(() =>
            Promise.resolve({ data: { totp: [{ id: 'factor-1' }] }, error: null })
          ),
          challenge: vi.fn(() => Promise.resolve({ data: { id: 'challenge-1' }, error: null })),
          verify: vi.fn(() =>
            Promise.resolve({ data: { user: { id: 'user-123' } }, error: null })
          ),
        },
      },
    } as any);

    const cookieStore = createMockCookieStore();
    vi.mocked(cookies).mockResolvedValue(cookieStore as any);

    const res = await verifyMfaPOST(
      makeJsonRequest(
        { code: '123456', trustDevice: true },
        'http://localhost:3000/api/auth/verify-mfa'
      )
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.aal).toBe('aal2');

    const trustSet = cookieStore._setCalls.find((c) => c.name === 'wa_admin_mfa_trust');
    expect(trustSet).toBeDefined();
    expect(trustSet!.value).toBe('mock-trust-token');
  });

  it('clears trust cookie when trustDevice is false', async () => {
    vi.mocked(createServerClient).mockReturnValue({
      auth: {
        mfa: {
          getAuthenticatorAssuranceLevel: vi.fn(() =>
            Promise.resolve({ data: { currentLevel: 'aal1', nextLevel: 'aal2' } })
          ),
          listFactors: vi.fn(() =>
            Promise.resolve({ data: { totp: [{ id: 'factor-1' }] }, error: null })
          ),
          challenge: vi.fn(() => Promise.resolve({ data: { id: 'challenge-1' }, error: null })),
          verify: vi.fn(() =>
            Promise.resolve({ data: { user: { id: 'user-123' } }, error: null })
          ),
        },
      },
    } as any);

    const cookieStore = createMockCookieStore();
    vi.mocked(cookies).mockResolvedValue(cookieStore as any);

    const res = await verifyMfaPOST(
      makeJsonRequest(
        { code: '123456', trustDevice: false },
        'http://localhost:3000/api/auth/verify-mfa'
      )
    );

    expect(res.status).toBe(200);
    const trustSet = cookieStore._setCalls.find((c) => c.name === 'wa_admin_mfa_trust');
    expect(trustSet).toBeDefined();
    expect(trustSet!.value).toBe('');
  });
});
