vi.mock('@/lib/tenant/withTenantScope', () => ({ crossTenantOK: (fn: () => Promise<unknown>) => fn() }));
import { describe, it, expect, vi, beforeEach } from 'vitest';

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
    },
  };
});

vi.mock('next/headers', () => ({
  cookies: vi.fn(() =>
    Promise.resolve({
      getAll: vi.fn(() => []),
      // The route reads the `wap_partner_ref` cookie to recover partner
      // attribution; no request here carries one.
      get: vi.fn(() => undefined),
    })
  ),
}));

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      signUp: vi.fn(),
    },
  })),
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    $transaction: vi.fn(async (arg: any) => { const { prisma } = await import('@/lib/db/prisma'); return typeof arg === 'function' ? arg(prisma) : Promise.all(arg); }),
    user: {
      update: vi.fn(),
      // Signup now checks for a pre-existing app row before creating one
      // (never roll back a returning member's auth user). Default: brand new.
      findUnique: vi.fn(async () => null),
      findFirst: vi.fn(async () => null),
      // The route selects ILIKE candidates and then keeps only an exact
      // case-insensitive match, so the collision check reads findMany.
      findMany: vi.fn(async () => []),
    },
    application: {
      findFirst: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
  },
}));

vi.mock('@/lib/member/service', () => ({
  createMember: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  checkSignupRateLimit: vi.fn(),
  checkSignupEmailRateLimit: vi.fn(() => Promise.resolve({ success: true })),
}));

vi.mock('@/lib/supabaseCookieOptions', () => ({
  getSupabaseCookieOptions: vi.fn(() => ({})),
}));

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: vi.fn(() => ({
    auth: {
      admin: {
        deleteUser: vi.fn(async () => ({ data: null, error: null })),
      },
    },
  })),
}));

vi.mock('@/lib/email', () => ({
  sendNewApplicationAdminEmail: vi.fn(),
}));

vi.mock('@/lib/auth/server', () => ({
  resolveAuthGucContext: vi.fn(async () => ({ userId: null, orgId: null, role: 'anonymous' })),
  getUser: vi.fn(),
}));

// ─── Imports after mocks ───
import { POST as signupPOST } from '@/app/api/member/signup/route';
import { POST as onboardingCompletePOST } from '@/app/api/onboarding/complete/route';
import { createMember } from '@/lib/member/service';
import { checkSignupRateLimit } from '@/lib/rate-limit';
import { createServerClient } from '@supabase/ssr';
import { getUser } from '@/lib/auth/server';
import { prisma } from '@/lib/db/prisma';
import { NextRequest } from 'next/server';

describe('POST /api/member/signup — member onboarding', () => {
  const makeRequest = (body: Record<string, unknown>) =>
    new NextRequest('http://localhost:3000/api/member/signup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

  const validSignupBody = {
    fullName: 'Jane Doe',
    email: 'jane@example.com',
    phone: '512-555-1234',
    zip: '78701',
    programInterest: 'Digital Literacy Empowerment Class (6 weeks, 30 hours total)',
    employmentStatus: 'unemployed',
    veteranStatus: 'not-a-veteran',
    password: 'SecurePass123',
    consentTerms: true,
    consentCommunications: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-anon-key');
    vi.stubEnv('POSTGRES_PRISMA_URL', 'postgres://test');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key');
  });

  it('creates a member with valid data', async () => {
    vi.mocked(checkSignupRateLimit).mockResolvedValue({ success: true } as any);

    const mockUser = { id: 'user-123', email: 'jane@example.com' };
    vi.mocked(createServerClient).mockReturnValue({
      auth: {
        signUp: vi.fn().mockResolvedValue({
          data: { user: mockUser },
          error: null,
        }),
      },
    } as any);

    vi.mocked(createMember).mockResolvedValue(undefined);

    const res = await signupPOST(makeRequest(validSignupBody));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.message).toContain('Check your email');

    expect(createMember).toHaveBeenCalledWith(
      'user-123',
      expect.objectContaining({
        fullName: 'Jane Doe',
        email: 'jane@example.com',
        phone: '512-555-1234',
        zip: '78701',
        programInterest: validSignupBody.programInterest,
        employmentStatus: 'unemployed',
        veteranStatus: 'not-a-veteran',
        consentTerms: true,
        consentCommunications: true,
      })
    );
  });

  it('returns 429 when rate limit exceeded', async () => {
    vi.mocked(checkSignupRateLimit).mockResolvedValue({ success: false } as any);

    const res = await signupPOST(makeRequest(validSignupBody));

    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toContain('Too many signup attempts');
    expect(createMember).not.toHaveBeenCalled();
  });

  it('returns 400 for missing required fields', async () => {
    vi.mocked(checkSignupRateLimit).mockResolvedValue({ success: true } as any);

    const res = await signupPOST(makeRequest({}));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it('returns 400 for missing name', async () => {
    vi.mocked(checkSignupRateLimit).mockResolvedValue({ success: true } as any);

    const res = await signupPOST(
      makeRequest({ ...validSignupBody, fullName: '' })
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('Name');
  });

  it('returns 400 for missing email', async () => {
    vi.mocked(checkSignupRateLimit).mockResolvedValue({ success: true } as any);

    const res = await signupPOST(
      makeRequest({ ...validSignupBody, email: '' })
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it('accepts empty phone as optional field', async () => {
    vi.mocked(checkSignupRateLimit).mockResolvedValue({ success: true } as any);

    const mockUser = { id: 'user-no-phone', email: 'nophone@example.com' };
    vi.mocked(createServerClient).mockReturnValue({
      auth: {
        signUp: vi.fn().mockResolvedValue({
          data: { user: mockUser },
          error: null,
        }),
      },
    } as any);

    vi.mocked(createMember).mockResolvedValue(undefined);

    const res = await signupPOST(
      makeRequest({ ...validSignupBody, phone: '' })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(createMember).toHaveBeenCalledWith(
      'user-no-phone',
      expect.objectContaining({ phone: undefined })
    );
  });

  it('returns 400 for invalid email format', async () => {
    vi.mocked(checkSignupRateLimit).mockResolvedValue({ success: true } as any);

    const res = await signupPOST(
      makeRequest({ ...validSignupBody, email: 'not-an-email' })
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('valid email');
  });

  it('returns 400 for invalid phone format', async () => {
    vi.mocked(checkSignupRateLimit).mockResolvedValue({ success: true } as any);

    const res = await signupPOST(
      makeRequest({ ...validSignupBody, phone: 'abc-def-ghij' })
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('phone');
  });

  it('returns 400 for password too short', async () => {
    vi.mocked(checkSignupRateLimit).mockResolvedValue({ success: true } as any);

    const res = await signupPOST(
      makeRequest({ ...validSignupBody, password: 'short1' })
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('Password');
  });

  it('returns 400 when consentTerms is false', async () => {
    vi.mocked(checkSignupRateLimit).mockResolvedValue({ success: true } as any);

    const res = await signupPOST(
      makeRequest({ ...validSignupBody, consentTerms: false })
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('terms');
  });

  it('returns 400 for duplicate email (user already exists)', async () => {
    vi.mocked(checkSignupRateLimit).mockResolvedValue({ success: true } as any);

    vi.mocked(createServerClient).mockReturnValue({
      auth: {
        signUp: vi.fn().mockResolvedValue({
          data: { user: null },
          error: {
            message: 'User already registered',
            code: 'user_already_exists',
          },
        }),
      },
    } as any);

    const res = await signupPOST(makeRequest(validSignupBody));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('already exist');
    expect(createMember).not.toHaveBeenCalled();
  });

  it('returns 400 for Supabase rate limit on email', async () => {
    vi.mocked(checkSignupRateLimit).mockResolvedValue({ success: true } as any);

    vi.mocked(createServerClient).mockReturnValue({
      auth: {
        signUp: vi.fn().mockResolvedValue({
          data: { user: null },
          error: {
            message: 'Email rate limit exceeded',
            code: 'over_email_send_limit',
          },
        }),
      },
    } as any);

    const res = await signupPOST(makeRequest(validSignupBody));

    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toContain('Too many signup emails');
  });

  it('returns 500 when Supabase is not configured', async () => {
    vi.unstubAllEnvs();
    // Keep this test deterministic when CI provides public placeholder values
    // at the workflow level. This case exercises the missing-public-config
    // branch; service-role configuration has its own production guard.
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    vi.mocked(checkSignupRateLimit).mockResolvedValue({ success: true } as any);

    const res = await signupPOST(makeRequest(validSignupBody));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain('Supabase is not configured');
  });

  it('returns 500 when createMember throws', async () => {
    vi.mocked(checkSignupRateLimit).mockResolvedValue({ success: true } as any);

    const mockUser = { id: 'user-456', email: 'john@example.com' };
    vi.mocked(createServerClient).mockReturnValue({
      auth: {
        signUp: vi.fn().mockResolvedValue({
          data: { user: mockUser },
          error: null,
        }),
      },
    } as any);

    vi.mocked(createMember).mockRejectedValue(new Error('DB transaction failed'));

    const res = await signupPOST(makeRequest(validSignupBody));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain('Account creation failed');
  });

  it('returns 500 on unexpected error', async () => {
    vi.mocked(checkSignupRateLimit).mockRejectedValue(new Error('Redis down'));

    const res = await signupPOST(makeRequest(validSignupBody));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Internal server error');
  });
});

describe('POST /api/onboarding/complete — onboarding completion', () => {
  const makeRequest = (body: Record<string, unknown>) =>
    new Request('http://localhost:3000/api/onboarding/complete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('marks member onboarding as complete', async () => {
    vi.mocked(getUser).mockResolvedValue({
      id: 'user-123',
      email: 'jane@example.com',
    } as any);

    vi.mocked(prisma.user.update).mockResolvedValue({
      id: 'user-123',
      onboardingCompletedAt: new Date('2026-01-15'),
      onboardingPortal: 'member',
    } as any);

    const res = await onboardingCompletePOST(makeRequest({ portal: 'member' }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-123' },
        data: expect.objectContaining({
          onboardingCompletedAt: expect.any(Date),
          onboardingPortal: 'member',
        }),
      })
    );
  });

  it('returns 401 when user is not authenticated', async () => {
    vi.mocked(getUser).mockResolvedValue(null);

    const res = await onboardingCompletePOST(makeRequest({ portal: 'member' }));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid portal value', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'user-123' } as any);

    const res = await onboardingCompletePOST(makeRequest({ portal: 'invalid' }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it('returns 400 for missing portal', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'user-123' } as any);

    const res = await onboardingCompletePOST(makeRequest({}));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it('returns 500 on unexpected database error', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'user-123' } as any);
    vi.mocked(prisma.user.update).mockRejectedValue(new Error('DB write failed'));

    const res = await onboardingCompletePOST(makeRequest({ portal: 'member' }));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Internal server error');
  });
});

describe('Onboarding profile creation via createMember', () => {
  it('createMember is called with profile fields after signup', async () => {
    vi.mocked(checkSignupRateLimit).mockResolvedValue({ success: true } as any);

    const mockUser = { id: 'user-profile-1', email: 'profile@example.com' };
    vi.mocked(createServerClient).mockReturnValue({
      auth: {
        signUp: vi.fn().mockResolvedValue({
          data: { user: mockUser },
          error: null,
        }),
      },
    } as any);

    vi.mocked(createMember).mockResolvedValue(undefined);

    const body = {
      fullName: 'Profile Test',
      email: 'profile@example.com',
      phone: '512-555-9999',
      zip: '78704',
      programInterest: 'CompTIA A+ Professional Certificate (CompTIA A+)',
      employmentStatus: 'underemployed',
      veteranStatus: 'veteran',
      password: 'ProfilePass1',
      consentTerms: true,
      consentCommunications: false,
    };

    const res = await signupPOST(
      new NextRequest('http://localhost:3000/api/member/signup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
    );

    expect(res.status).toBe(200);
    expect(createMember).toHaveBeenCalledTimes(1);

    const callArgs = vi.mocked(createMember).mock.calls[0];
    expect(callArgs[0]).toBe('user-profile-1');
    expect(callArgs[1]).toMatchObject({
      fullName: 'Profile Test',
      email: 'profile@example.com',
      phone: '512-555-9999',
      zip: '78704',
      programInterest: 'CompTIA A+ Professional Certificate (CompTIA A+)',
      employmentStatus: 'underemployed',
      veteranStatus: 'veteran',
      consentTerms: true,
      consentCommunications: false,
    });
  });
});
