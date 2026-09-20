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
      json: (body: unknown, init?: ResponseInit) => {
        const res: any = new Response(JSON.stringify(body), {
          ...init,
          headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
        });
        res.cookies = { set: vi.fn(), get: vi.fn(), getAll: vi.fn(() => []), delete: vi.fn() };
        return res;
      },
      redirect: (url: string, init?: ResponseInit) =>
        new Response(null, { status: 302, headers: { location: url, ...(init?.headers || {}) } }),
    },
  };
});

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({ get: vi.fn(), getAll: vi.fn(() => []), set: vi.fn() })),
}));

const mockSetCookie = vi.fn();
vi.mock('@/lib/auth/server', () => ({
  getUser: vi.fn(),
  setAuthCookie: vi.fn(),
  resolveAuthGucContext: vi.fn(() => Promise.resolve({ userId: 'test-user-id', orgId: null, roles: [] })),
}));

vi.mock('@/lib/supabase-admin', () => {
  const mock = {
    auth: {
      admin: {
        createUser: vi.fn(),
        deleteUser: vi.fn().mockResolvedValue({ data: null, error: null }),
        generateLink: vi.fn().mockResolvedValue({
          data: { properties: { action_link: 'https://test.supabase.co/auth/v1/verify?token=abc' } },
          error: null,
        }),
      },
    },
    from: vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => ({ single: vi.fn() })) })) })),
  };
  return {
    supabaseAdmin: mock,
    getSupabaseAdmin: vi.fn(() => mock),
  };
});

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      signInWithPassword: vi.fn().mockResolvedValue({
        data: {
          session: {
            access_token: 'access',
            refresh_token: 'refresh',
            expires_in: 3600,
          },
        },
        error: null,
      }),
    },
  })),
}));

vi.mock('@/lib/supabase-client', () => ({
  supabaseClient: vi.fn(() => ({
    auth: {
      signInWithPassword: vi.fn(),
    },
  })),
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    profile: {
      create: vi.fn(),
    },
    partner: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    partnerUser: {
      create: vi.fn(),
      findUnique: vi.fn(),
    },
    partnerSignupRequest: {
      create: vi.fn(),
    },
    $transaction: vi.fn(async (arg: any) => {
      const { prisma } = await import('@/lib/db/prisma');
      return typeof arg === 'function' ? arg(prisma) : Promise.all(arg);
    }),
  },
}));

vi.mock('@/lib/tenant/organization', () => ({
  getDefaultOrganizationId: vi.fn(() => Promise.resolve('org-1')),
  getActorOrganizationId: vi.fn(() => Promise.resolve('org-1')),
}));

vi.mock('@/lib/email/sanitizeSubject', () => ({
  sanitizeEmailSubjectLine: vi.fn((s: string) => s),
}));

const { resendSend } = vi.hoisted(() => ({
  resendSend: vi.fn().mockResolvedValue({ id: 'email-1' }),
}));
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: resendSend };
  },
}));

// Sends go through lib/email/send.ts: sign unsubscribe tokens and keep the
// failure diagnostic inert. Recipients below avoid reserved fixture domains
// (example.com is skipped by the wrapper) where the test asserts a send.
process.env.UNSUBSCRIBE_TOKEN_SECRET ??= 'test-unsubscribe-secret';
vi.mock('@/lib/diagnostics', () => ({ recordWorkflowDiagnostic: vi.fn(async () => undefined) }));

// ─── Imports after mocks ───
import { POST as signupPost } from '@/app/api/partner/signup/route';
import { POST as approvePost } from '@/app/api/admin/partners/[id]/approve/route';
import { POST as rejectPost } from '@/app/api/admin/partners/[id]/reject/route';
import { PATCH as contactPatch } from '@/app/api/partner/settings/contact/route';
import { getUser } from '@/lib/auth/server';
import { prisma } from '@/lib/db/prisma';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
const supabaseAdmin = getSupabaseAdmin();
import { isAdmin } from '@/lib/auth/roles';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth/roles', () => ({
  getPartnerForUser: vi.fn(),
  isAdmin: vi.fn(),
  getProfileRole: vi.fn(() => Promise.resolve('admin')),
  isSuperAdmin: vi.fn(() => Promise.resolve(true)),
}));

vi.mock('@/lib/tenant/withTenantScope', () => ({
  withTenantScope: vi.fn(async (_orgId: string, fn: (db: unknown) => Promise<unknown>) => {
    const { prisma } = await import('@/lib/db/prisma');
    return fn(prisma);
  }),
}));

vi.mock('@/lib/audit', () => ({
  auditLog: vi.fn(() => Promise.resolve()),
}));

vi.mock('@/lib/audit/log', () => ({
  auditRequestMeta: vi.fn(() => ({})),
  logAuditEvent: vi.fn(() => Promise.resolve()),
}));

const UUIDS = {
  admin: '550e8400-e29b-41d4-a716-446655440000',
  user: '550e8400-e29b-41d4-a716-446655440002',
  partner: '550e8400-e29b-41d4-a716-446655440003',
};

function makeSignupRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost:3000/api/partner/signup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ─────────────────────────────────────────────
// POST /api/partner/signup
// ─────────────────────────────────────────────
describe('POST /api/partner/signup', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
    process.env.RESEND_API_KEY = 'test-resend-key';
    vi.clearAllMocks();
  });

  it('returns 400 for missing required fields', async () => {
    const res = await signupPost(makeSignupRequest({ organizationName: 'Test Org' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/required/i);
  });

  it('returns 400 for invalid email', async () => {
    const res = await signupPost(
      makeSignupRequest({
        organizationName: 'Test Org',
        contactName: 'Jane',
        contactEmail: 'not-an-email',
        password: 'securePass123',
        orgType: 'nonprofit',
        serveArea: 'Austin',
        expectedMonthly: '1-5',
      })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/email/i);
  });

  it('returns 400 for short password', async () => {
    const res = await signupPost(
      makeSignupRequest({
        organizationName: 'Test Org',
        contactName: 'Jane',
        contactEmail: 'test@example.com',
        password: 'short',
        orgType: 'nonprofit',
        serveArea: 'Austin',
        expectedMonthly: '1-5',
      })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Required|8/i);
  });

  it('returns 400 when email already exists', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: UUIDS.user } as any);

    const res = await signupPost(
      makeSignupRequest({
        organizationName: 'Test Org',
        contactName: 'Jane',
        contactEmail: 'existing@example.com',
        password: 'securePass123',
        orgType: 'nonprofit',
        serveArea: 'Austin',
        expectedMonthly: '1-5',
      })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/already/i);
  });

  it('creates an unconfirmed partner account and sends a verification email', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(supabaseAdmin.auth.admin.createUser).mockResolvedValue({
      data: { user: { id: UUIDS.user } },
      error: null,
    } as any);

    vi.mocked(prisma.partner.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.partner.findFirst).mockResolvedValue(null);

    vi.mocked(prisma.$transaction).mockImplementation(async (ops: any) => {
      // If ops is a function, call it with a mock tx
      if (typeof ops === 'function') {
        const mockTx = {
          user: { create: vi.fn().mockResolvedValue({ id: UUIDS.user }), findUnique: prisma.user.findUnique },
          profile: { create: vi.fn().mockResolvedValue({ id: 'profile-1' }) },
          partner: {
            create: vi.fn().mockResolvedValue({ id: UUIDS.partner, name: 'New Org', slug: 'new-org', referralCode: 'REF123' }),
            findUnique: prisma.partner.findUnique,
            findFirst: prisma.partner.findFirst,
            update: prisma.partner.update,
          },
          partnerUser: { create: vi.fn().mockResolvedValue({ id: 'pu-1' }) },
          partnerSignupRequest: { create: vi.fn().mockResolvedValue({ id: 'psr-1' }) },
        };
        return ops(mockTx as any);
      }
      return Promise.all(ops);
    });

    const res = await signupPost(
      makeSignupRequest({
        organizationName: 'New Org',
        contactName: 'Jane Doe',
        contactEmail: 'new@example.org',
        password: 'securePass123',
        contactPhone: '512-555-1234',
        orgType: 'nonprofit',
        serveArea: 'Austin',
        expectedMonthly: '1-5',
        hearAbout: 'Google',
      })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.redirectTo).toBeUndefined();
    expect(body.message).toContain('verify your address');
    expect(supabaseAdmin.auth.admin.createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'new@example.org',
        password: 'securePass123',
      })
    );
    expect(supabaseAdmin.auth.admin.createUser).toHaveBeenCalledWith(
      expect.not.objectContaining({
        email_confirm: true,
      })
    );
    expect(supabaseAdmin.auth.admin.generateLink).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'signup',
        email: 'new@example.org',
      })
    );
  });
});

// ─────────────────────────────────────────────
// POST /api/admin/partners/[id]/approve
// ─────────────────────────────────────────────
describe('POST /api/admin/partners/[id]/approve', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    vi.mocked(getUser).mockResolvedValue(null as any);

    const res = await approvePost(
      new NextRequest('http://localhost:3000/api/admin/partners/123/approve', { method: 'POST' }),
      { params: Promise.resolve({ id: '123' }) }
    );
    expect(res.status).toBe(401);
  });

  it('returns 403 when not admin', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.user } as any);
    vi.mocked(isAdmin).mockResolvedValue(false);

    const res = await approvePost(
      new NextRequest('http://localhost:3000/api/admin/partners/123/approve', { method: 'POST' }),
      { params: Promise.resolve({ id: '123' }) }
    );
    expect(res.status).toBe(403);
  });

  it('returns 404 when partner not found', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.admin } as any);
    vi.mocked(isAdmin).mockResolvedValue(true);
    vi.mocked(prisma.partner.findFirst).mockResolvedValue(null);

    const res = await approvePost(
      new NextRequest('http://localhost:3000/api/admin/partners/123/approve', { method: 'POST' }),
      { params: Promise.resolve({ id: '123' }) }
    );
    expect(res.status).toBe(404);
  });

  it('returns 400 when partner is not pending', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.admin } as any);
    vi.mocked(isAdmin).mockResolvedValue(true);
    vi.mocked(prisma.partner.findFirst).mockResolvedValue({
      id: '123',
      status: 'active',
    } as any);

    const res = await approvePost(
      new NextRequest('http://localhost:3000/api/admin/partners/123/approve', { method: 'POST' }),
      { params: Promise.resolve({ id: '123' }) }
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/not pending/i);
  });

  it('approves a pending partner and sends email', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.admin } as any);
    vi.mocked(isAdmin).mockResolvedValue(true);
    vi.mocked(prisma.partner.findFirst).mockResolvedValue({
      id: '123',
      status: 'pending_approval',
      contactEmail: 'partner@example.com',
      contactName: 'Jane',
      name: 'New Org',
      slug: 'new-org',
      referralCode: 'REF123',
    } as any);
    vi.mocked(prisma.partner.update).mockResolvedValue({ id: '123' } as any);

    const res = await approvePost(
      new NextRequest('http://localhost:3000/api/admin/partners/123/approve', { method: 'POST' }),
      { params: Promise.resolve({ id: '123' }) }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(prisma.partner.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'active',
          active: true,
        }),
      })
    );
  });
});

// ─────────────────────────────────────────────
// POST /api/admin/partners/[id]/reject
// ─────────────────────────────────────────────
describe('POST /api/admin/partners/[id]/reject', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 403 when not admin', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.user } as any);
    vi.mocked(isAdmin).mockResolvedValue(false);

    const res = await rejectPost(
      new NextRequest('http://localhost:3000/api/admin/partners/123/reject', { method: 'POST' }),
      { params: Promise.resolve({ id: '123' }) }
    );
    expect(res.status).toBe(403);
  });

  it('rejects a pending partner with notes', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.admin } as any);
    vi.mocked(isAdmin).mockResolvedValue(true);
    vi.mocked(prisma.partner.findFirst).mockResolvedValue({
      id: '123',
      status: 'pending_approval',
      contactEmail: 'partner@example.com',
      contactName: 'Jane',
      name: 'New Org',
    } as any);
    vi.mocked(prisma.partner.update).mockResolvedValue({ id: '123' } as any);

    const res = await rejectPost(
      new NextRequest('http://localhost:3000/api/admin/partners/123/reject', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ notes: 'Does not meet requirements' }),
      }),
      { params: Promise.resolve({ id: '123' }) }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(prisma.partner.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'rejected',
          active: false,
          rejectionNotes: 'Does not meet requirements',
        }),
      })
    );
  });
});

// ─────────────────────────────────────────────
// PATCH /api/partner/settings/contact
// ─────────────────────────────────────────────
describe('PATCH /api/partner/settings/contact', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    vi.mocked(getUser).mockResolvedValue(null as any);

    const res = await contactPatch(
      new NextRequest('http://localhost:3000/api/partner/settings/contact', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ contactName: 'New Name' }),
      })
    );
    expect(res.status).toBe(401);
  });

  it('returns 403 when not a partner', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.user } as any);
    const { getPartnerForUser } = await import('@/lib/auth/roles');
    vi.mocked(getPartnerForUser).mockResolvedValue(null);

    const res = await contactPatch(
      new NextRequest('http://localhost:3000/api/partner/settings/contact', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ contactName: 'New Name' }),
      })
    );
    expect(res.status).toBe(403);
  });

  it('updates contact info for partner', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.user } as any);
    const { getPartnerForUser } = await import('@/lib/auth/roles');
    vi.mocked(getPartnerForUser).mockResolvedValue({ partnerId: UUIDS.partner } as any);
    vi.mocked(prisma.partner.update).mockResolvedValue({ id: UUIDS.partner } as any);

    const res = await contactPatch(
      new NextRequest('http://localhost:3000/api/partner/settings/contact', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ contactName: 'Jane Updated', contactPhone: '512-555-9999' }),
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(prisma.partner.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: UUIDS.partner },
        data: expect.objectContaining({
          contactName: 'Jane Updated',
          contactPhone: '512-555-9999',
        }),
      })
    );
  });
});
