import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), {
        ...init,
        headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
      }),
  },
}));

vi.mock('@/lib/db/withRequestGuc', () => ({
  withApiGuc: (handler: (request: Request, context: unknown) => Promise<Response>) => handler,
}));

vi.mock('@/lib/auth/server', () => ({
  resolveAuthGucContext: vi.fn(async () => ({ userId: null, orgId: null, role: 'anonymous' })),
  getUser: vi.fn(),
}));

vi.mock('@/lib/auth/roles', () => ({
  isSuperAdmin: vi.fn(() => Promise.resolve(false)),
  requireAdmin: vi.fn(),
}));

vi.mock('@/lib/tenant/organization', () => ({
  getActorOrganizationId: vi.fn(),
}));

vi.mock('@/lib/tenant/withTenantScope', () => ({
  withTenantScope: vi.fn(async (_orgId: string, fn: (db: unknown) => Promise<unknown>) => {
    const { prisma } = await import('@/lib/db/prisma');
    return fn(prisma);
  }),
}));

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: vi.fn(),
}));

vi.mock('@/lib/auth/supabaseAdminUsers', () => ({
  findSupabaseAuthUserByEmail: vi.fn(),
}));

vi.mock('@/lib/observability/captureApiError', () => ({ captureApiError: vi.fn() }));
vi.mock('@/lib/audit', () => ({ auditLog: vi.fn(async () => undefined) }));
vi.mock('@/lib/audit/log', () => ({ logAuditEvent: vi.fn(async () => undefined) }));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    $transaction: vi.fn(async (arg: any) => { const { prisma } = await import('@/lib/db/prisma'); return typeof arg === 'function' ? arg(prisma) : Promise.all(arg); }),
    partner: {
      findFirst: vi.fn(),
    },
    user: {
      findFirst: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    partnerUser: {
      findFirst: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
  },
}));

import { POST } from '@/app/api/admin/partners/[id]/invite/route';
import { getUser } from '@/lib/auth/server';
import { requireAdmin } from '@/lib/auth/roles';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { findSupabaseAuthUserByEmail } from '@/lib/auth/supabaseAdminUsers';
import { prisma } from '@/lib/db/prisma';

const ADMIN_ID = '550e8400-e29b-41d4-a716-446655440001';
const USER_ID = '550e8400-e29b-41d4-a716-446655440002';
const PARTNER_ID = '550e8400-e29b-41d4-a716-446655440003';
const ORG_ID = '550e8400-e29b-41d4-a716-446655440004';
const OTHER_ORG_ID = '550e8400-e29b-41d4-a716-446655440005';

function makeRequest(body: Record<string, unknown>) {
  return new Request('http://localhost:3000/api/admin/partners/partner/invite', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/admin/partners/[id]/invite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUser).mockResolvedValue({ id: ADMIN_ID } as any);
    vi.mocked(requireAdmin).mockResolvedValue(undefined as any);
    vi.mocked(getActorOrganizationId).mockResolvedValue(ORG_ID);
    vi.mocked(getSupabaseAdmin).mockReturnValue({
      auth: {
        admin: {
          inviteUserByEmail: vi.fn(() =>
            Promise.resolve({ data: { user: null }, error: { message: 'User already registered' } })
          ),
        },
      },
    } as any);
    vi.mocked(findSupabaseAuthUserByEmail).mockResolvedValue({ id: USER_ID } as any);
    vi.mocked(prisma.partner.findFirst).mockResolvedValue({
      id: PARTNER_ID,
      organizationId: ORG_ID,
      contactName: 'Partner Contact',
    } as any);
    vi.mocked(prisma.partnerUser.findFirst).mockResolvedValue(null);
  });

  it('returns 409 and does not relink an existing user from another organization', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue({
      id: USER_ID,
      organizationId: OTHER_ORG_ID,
    } as any);

    const res = await POST(makeRequest({ email: 'Existing@Example.com' }), {
      params: Promise.resolve({ id: PARTNER_ID }),
    });

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'User already belongs to another organization' });
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.partnerUser.update).not.toHaveBeenCalled();
    expect(prisma.partnerUser.create).not.toHaveBeenCalled();
  });

  // Audit 2026-09-20: provider failures escaped as 500 "Internal server
  // error" and the partner page showed nothing. Every failure now reads
  // "Invite not sent: <reason>" with a 4xx/5xx that matches the cause.
  describe('provider failures', () => {
    it('answers 503 "Invite not sent" when the provider call throws a network error', async () => {
      vi.mocked(getSupabaseAdmin).mockReturnValue({
        auth: { admin: { inviteUserByEmail: vi.fn(() => Promise.reject(new TypeError('fetch failed'))) } },
      } as any);

      const res = await POST(makeRequest({ email: 'new@example.com' }), { params: Promise.resolve({ id: PARTNER_ID }) });
      const body = await res.json();
      expect(res.status).toBe(503);
      expect(body.reason).toBe('unavailable');
      expect(body.error).toMatch(/^Invite not sent: /);
      expect(body.error).not.toContain('fetch failed');
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('answers 503 when the provider reports itself unavailable', async () => {
      vi.mocked(getSupabaseAdmin).mockReturnValue({
        auth: {
          admin: {
            inviteUserByEmail: vi.fn(() =>
              Promise.resolve({ data: { user: null }, error: { name: 'AuthRetryableFetchError', message: 'Service Unavailable', status: 503 } })
            ),
          },
        },
      } as any);
      vi.mocked(findSupabaseAuthUserByEmail).mockResolvedValue(null);

      const res = await POST(makeRequest({ email: 'new@example.com' }), { params: Promise.resolve({ id: PARTNER_ID }) });
      expect(res.status).toBe(503);
      expect((await res.json()).error).toMatch(/^Invite not sent: the sign-in provider is unavailable/);
      expect(findSupabaseAuthUserByEmail).not.toHaveBeenCalled();
    });

    it('answers 503 when the provider client is not configured', async () => {
      vi.mocked(getSupabaseAdmin).mockImplementation(() => {
        throw new Error('SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL required for admin operations');
      });
      const res = await POST(makeRequest({ email: 'new@example.com' }), { params: Promise.resolve({ id: PARTNER_ID }) });
      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.error).toMatch(/^Invite not sent: /);
      expect(JSON.stringify(body)).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
    });

    it('answers 400 with a validation reason when the address is rejected and no auth user exists', async () => {
      vi.mocked(getSupabaseAdmin).mockReturnValue({
        auth: {
          admin: {
            inviteUserByEmail: vi.fn(() =>
              Promise.resolve({ data: { user: null }, error: { name: 'AuthApiError', code: 'email_address_invalid', message: 'Unable to validate email address: invalid format', status: 400 } })
            ),
          },
        },
      } as any);
      vi.mocked(findSupabaseAuthUserByEmail).mockResolvedValue(null);

      const res = await POST(makeRequest({ email: 'odd@example.com' }), { params: Promise.resolve({ id: PARTNER_ID }) });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.reason).toBe('validation');
      expect(body.error).toMatch(/^Invite not sent: the sign-in provider rejected that email address/);
      expect(body.error).not.toContain('Unable to validate');
    });

    it('still links an already-registered user (duplicate is not a failure)', async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: USER_ID, organizationId: ORG_ID } as any);
      const res = await POST(makeRequest({ email: 'existing@example.com' }), { params: Promise.resolve({ id: PARTNER_ID }) });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true, userId: USER_ID });
      expect(prisma.partnerUser.create).toHaveBeenCalledTimes(1);
    });
  });
});
