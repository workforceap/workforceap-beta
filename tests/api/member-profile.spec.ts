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
    })
  ),
}));

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(),
    },
  })),
}));

vi.mock('@/lib/supabaseCookieOptions', () => ({
  getSupabaseCookieOptions: vi.fn(() => ({})),
}));

vi.mock('@/lib/audit', () => ({ auditLog: vi.fn(async () => undefined) }));
vi.mock('@/lib/audit/log', () => ({
  logAuditEvent: vi.fn(async () => undefined),
  auditRequestMeta: vi.fn(() => ({})),
}));

vi.mock('@/lib/auth/server', () => ({
  resolveAuthGucContext: vi.fn(async () => ({ userId: null, orgId: null, role: 'anonymous' })),
  getUser: vi.fn(),
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    profile: {
      upsert: vi.fn(),
    },
    $transaction: vi.fn(async (arg: any) => {
      const { prisma } = await import('@/lib/db/prisma');
      return typeof arg === 'function' ? arg(prisma) : Promise.all(arg);
    }),
  },
}));

// ─── Imports after mocks ───
import { GET as profileGET, PATCH as profilePATCH } from '@/app/api/member/profile/route';
import { GET as completenessGET } from '@/app/api/member/profile/completeness/route';
import { getUser } from '@/lib/auth/server';
import { prisma } from '@/lib/db/prisma';

const makeRequest = (body?: Record<string, unknown>) =>
  new Request('http://localhost:3000/api/member/profile', {
    method: body ? 'PATCH' : 'GET',
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });

describe('GET /api/member/profile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns member profile for authenticated user', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'user-123', email: 'jane@example.com' } as any);

    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'user-123',
      email: 'jane@example.com',
      fullName: 'Jane Doe',
      phone: '512-555-1234',
      profile: {
        address: '123 Main St',
        city: 'Austin',
        state: 'TX',
        zip: '78701',
      },
    } as any);

    const res = await profileGET(new Request('http://localhost'));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user).toMatchObject({
      id: 'user-123',
      email: 'jane@example.com',
      fullName: 'Jane Doe',
      phone: '512-555-1234',
    });
    expect(body.profile).toMatchObject({
      address: '123 Main St',
      city: 'Austin',
      state: 'TX',
      zip: '78701',
    });
  });

  it('returns null profile when no profile row exists', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'user-123', email: 'jane@example.com' } as any);

    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'user-123',
      email: 'jane@example.com',
      fullName: 'Jane Doe',
      phone: '512-555-1234',
      profile: null,
    } as any);

    const res = await profileGET(new Request('http://localhost'));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user).toBeDefined();
    expect(body.profile).toBeNull();
  });

  it('returns 401 for unauthenticated user', async () => {
    vi.mocked(getUser).mockResolvedValue(null);

    const res = await profileGET(new Request('http://localhost'));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 404 when user not found in database', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'user-ghost', email: 'ghost@example.com' } as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    const res = await profileGET(new Request('http://localhost'));

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('User not found');
  });

  it('returns 500 on unexpected database error', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'user-123', email: 'jane@example.com' } as any);
    vi.mocked(prisma.user.findUnique).mockRejectedValue(new Error('DB connection lost'));

    const res = await profileGET(new Request('http://localhost'));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Internal server error');
  });
});

describe('PATCH /api/member/profile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates profile fields successfully', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'user-123', email: 'jane@example.com' } as any);

    const updatedUser = {
      id: 'user-123',
      email: 'jane@example.com',
      fullName: 'Jane Updated',
      phone: '512-555-9999',
      profile: {
        address: '456 Oak Ave',
        city: 'Dallas',
        state: 'TX',
        zip: '75201',
      },
    };

    vi.mocked(prisma.user.findUnique).mockResolvedValue(updatedUser as any);
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => {
      return fn({
        user: { update: vi.fn().mockResolvedValue({}), findUnique: prisma.user.findUnique },
        profile: { upsert: vi.fn().mockResolvedValue({}) },
      });
    });

    const res = await profilePATCH(
      makeRequest({
        fullName: 'Jane Updated',
        phone: '512-555-9999',
        address: '456 Oak Ave',
        city: 'Dallas',
        state: 'TX',
        zip: '75201',
      })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.fullName).toBe('Jane Updated');
    expect(body.user.phone).toBe('512-555-9999');
    expect(body.profile.address).toBe('456 Oak Ave');
    expect(body.profile.city).toBe('Dallas');
  });

  it('updates only user fields when no profile fields provided', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'user-123', email: 'jane@example.com' } as any);

    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'user-123',
      email: 'jane@example.com',
      fullName: 'Jane Updated',
      phone: '512-555-9999',
      profile: null,
    } as any);

    vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => {
      return fn({
        user: { update: vi.fn().mockResolvedValue({}), findUnique: prisma.user.findUnique },
        profile: { upsert: vi.fn().mockResolvedValue({}) },
      });
    });

    const res = await profilePATCH(
      makeRequest({
        fullName: 'Jane Updated',
      })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.fullName).toBe('Jane Updated');
  });

  it('returns 401 for unauthenticated user', async () => {
    vi.mocked(getUser).mockResolvedValue(null);

    const res = await profilePATCH(makeRequest({ fullName: 'Jane Updated' }));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 400 for invalid JSON body', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'user-123', email: 'jane@example.com' } as any);

    const res = await profilePATCH(
      new Request('http://localhost:3000/api/member/profile', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: 'not-json',
      })
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Invalid JSON');
  });

  it('returns 400 when fullName is empty string', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'user-123', email: 'jane@example.com' } as any);

    const res = await profilePATCH(
      makeRequest({ fullName: '' })
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('at least 1 character');
  });

  it('returns 400 when fullName exceeds 200 characters', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'user-123', email: 'jane@example.com' } as any);

    const res = await profilePATCH(
      makeRequest({ fullName: 'a'.repeat(201) })
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('at most 200 character');
  });

  it('returns 400 when phone exceeds 50 characters', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'user-123', email: 'jane@example.com' } as any);

    const res = await profilePATCH(
      makeRequest({ phone: '1'.repeat(51) })
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('at most 50 character');
  });

  it('allows phone to be null', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'user-123', email: 'jane@example.com' } as any);

    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'user-123',
      email: 'jane@example.com',
      fullName: 'Jane Doe',
      phone: null,
      profile: null,
    } as any);

    vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => {
      return fn({
        user: { update: vi.fn().mockResolvedValue({}), findUnique: prisma.user.findUnique },
        profile: { upsert: vi.fn().mockResolvedValue({}) },
      });
    });

    const res = await profilePATCH(
      makeRequest({ phone: null })
    );

    expect(res.status).toBe(200);
  });

  it('returns 500 on unexpected database error', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'user-123', email: 'jane@example.com' } as any);
    vi.mocked(prisma.$transaction).mockRejectedValue(new Error('DB write failed'));

    const res = await profilePATCH(
      makeRequest({ fullName: 'Jane Updated' })
    );

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Internal server error');
  });
});

describe('GET /api/member/profile/completeness', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.$transaction).mockImplementation(async (arg: any) =>
      typeof arg === 'function' ? arg(prisma) : Promise.all(arg)
    );
  });

  it('returns profile completion percentage for a complete profile', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'user-123', email: 'jane@example.com' } as any);

    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'user-123',
      email: 'jane@example.com',
      fullName: 'Jane Doe',
      phone: '512-555-1234',
      profile: {
        address: '123 Main St',
        city: 'Austin',
        state: 'TX',
        zip: '78701',
        profilePhone: '512-555-1234',
        profileLinkedin: 'linkedin.com/in/jane',
        profileBio: 'Software developer',
        dob: new Date('1990-01-01'),
        veteranStatus: 'not-a-veteran',
        employmentStatus: 'employed',
        educationLevel: 'bachelor',
        householdIncome: '50k-75k',
        referralSource: 'friend',
        usCitizen: true,
        authorizedToWork: true,
        hasDisability: false,
        ethnicity: 'not-specified',
        employmentStatusAtEnroll: 'unemployed',
        financialAidInterest: false,
      },
    } as any);

    const res = await completenessGET(new Request('http://localhost'));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.percentage).toBe(100);
    expect(body.filled).toBe(body.total);
    expect(body.missing).toEqual([]);
    expect(body.isComplete).toBe(true);
  });

  it('identifies missing fields for an incomplete profile', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'user-123', email: 'jane@example.com' } as any);

    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'user-123',
      email: 'jane@example.com',
      fullName: '',
      phone: null,
      profile: {
        address: null,
        city: null,
        state: 'TX',
        zip: null,
        profilePhone: null,
        profileLinkedin: null,
        profileBio: null,
        dob: null,
        veteranStatus: null,
        employmentStatus: null,
        educationLevel: null,
        householdIncome: null,
        referralSource: null,
        usCitizen: null,
        authorizedToWork: null,
        hasDisability: null,
        ethnicity: null,
        employmentStatusAtEnroll: null,
        financialAidInterest: null,
      },
    } as any);

    const res = await completenessGET(new Request('http://localhost'));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.percentage).toBeLessThan(100);
    expect(body.filled).toBeLessThan(body.total);
    expect(body.missing.length).toBeGreaterThan(0);
    expect(body.missing).toContain('fullName');
    expect(body.missing).toContain('phone');
    expect(body.missing).toContain('address');
    expect(body.isComplete).toBe(false);
  });

  it('returns 401 for unauthenticated user', async () => {
    vi.mocked(getUser).mockResolvedValue(null);

    const res = await completenessGET(new Request('http://localhost'));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 404 when user not found in database', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'user-ghost', email: 'ghost@example.com' } as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    const res = await completenessGET(new Request('http://localhost'));

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('User not found');
  });

  it('returns 500 on unexpected database error', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'user-123', email: 'jane@example.com' } as any);
    vi.mocked(prisma.user.findUnique).mockRejectedValue(new Error('DB connection lost'));

    const res = await completenessGET(new Request('http://localhost'));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Internal server error');
  });
});
