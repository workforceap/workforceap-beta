import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next/server', () => {
  class MockNextResponse extends Response {
    static json(body: unknown, init?: ResponseInit) {
      return new Response(JSON.stringify(body), {
        ...init,
        headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
      });
    }
  }
  return {
    NextResponse: MockNextResponse,
    after: vi.fn((callback: () => unknown) => {
      void Promise.resolve(callback()).catch(() => undefined);
    }),
  };
});

vi.mock('@/lib/auth/server', () => ({
  resolveAuthGucContext: vi.fn(async () => ({ userId: null, orgId: null, role: 'anonymous' })),
  getUser: vi.fn(),
}));

vi.mock('@/lib/auth/roles', () => ({
  requireAdmin: vi.fn(),
  isAdmin: vi.fn(),
  isSuperAdmin: vi.fn(),
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    $transaction: vi.fn(async (arg: any) => { const { prisma } = await import('@/lib/db/prisma'); return typeof arg === 'function' ? arg(prisma) : Promise.all(arg); }),
    employer: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('@/lib/audit', () => ({ auditLog: vi.fn(async () => undefined) }));

vi.mock('@/lib/notify/discord', () => ({ notifyDiscord: vi.fn(async () => undefined) }));

vi.mock('@/lib/email', () => ({
  sendEmployerApprovedEmail: vi.fn(),
  sendEmployerRejectedEmail: vi.fn(),
}));

vi.mock('@/lib/tenant/withTenantScope', () => ({
  withTenantScope: vi.fn(async (_orgId: string, fn: Function) => fn(prisma)),
}));

vi.mock('@/lib/tenant/organization', () => ({
  getActorOrganizationId: vi.fn(() => Promise.resolve('org-1')),
  getDefaultOrganizationId: vi.fn().mockResolvedValue('org-1'),
}));

// ─── Imports after mocks ───
import { POST as approvePost } from '@/app/api/admin/employers/[id]/approve/route';
import { POST as rejectPost } from '@/app/api/admin/employers/[id]/reject/route';
import { getUser } from '@/lib/auth/server';
import { requireAdmin } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';
import { sendEmployerApprovedEmail, sendEmployerRejectedEmail } from '@/lib/email';
import { notifyDiscord } from '@/lib/notify/discord';
import { after } from 'next/server';

const adminUser = { id: 'admin-1', email: 'admin@wap.org' };

function makeRequest(body: Record<string, unknown>, id: string) {
  return new Request(`http://localhost:3000/api/admin/employers/${id}/approve`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/admin/employers/[id]/approve', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUser).mockResolvedValue(adminUser as any);
    vi.mocked(requireAdmin).mockResolvedValue(undefined);
    vi.mocked(sendEmployerApprovedEmail).mockResolvedValue({ ok: true });
  });

  it('approves a pending employer', async () => {
    vi.mocked(prisma.employer.findFirst).mockResolvedValue({
      id: 'emp-1',
      status: 'pending_approval',
      companyName: 'Acme',
      contactEmail: 'acme@example.com',
      contactName: 'Jane',
    } as any);

    vi.mocked(prisma.employer.update).mockResolvedValue({
      id: 'emp-1',
      status: 'active',
      companyName: 'Acme',
      contactEmail: 'acme@example.com',
      contactName: 'Jane',
    } as any);

    const res = await approvePost(makeRequest({}, 'emp-1') as any, { params: Promise.resolve({ id: 'emp-1' }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.employer.status).toBe('active');
    expect(sendEmployerApprovedEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'acme@example.com', companyName: 'Acme' })
    );
  });

  it('retains the approval email and the Discord bridge with after() instead of abandoning them', async () => {
    vi.mocked(prisma.employer.findFirst).mockResolvedValue({
      id: 'emp-1',
      status: 'pending_approval',
      companyName: 'Acme',
      contactEmail: 'acme@example.com',
      contactName: 'Jane',
    } as any);
    vi.mocked(prisma.employer.update).mockResolvedValue({
      id: 'emp-1',
      status: 'active',
      companyName: 'Acme',
      contactEmail: 'acme@example.com',
      contactName: 'Jane',
    } as any);
    // Record instead of running so a direct (non-retained) call is visible.
    const retained: Array<() => unknown> = [];
    vi.mocked(after).mockImplementation(((task: () => unknown) => { retained.push(task); }) as typeof after);

    const res = await approvePost(makeRequest({}, 'emp-1') as any, { params: Promise.resolve({ id: 'emp-1' }) });
    expect(res.status).toBe(200);

    // One retained task for the email, one for Discord; neither ran on the response path.
    expect(retained).toHaveLength(2);
    expect(sendEmployerApprovedEmail).not.toHaveBeenCalled();
    expect(notifyDiscord).not.toHaveBeenCalled();

    for (const task of retained) await task();
    expect(sendEmployerApprovedEmail).toHaveBeenCalledTimes(1);
    expect(notifyDiscord).toHaveBeenCalledTimes(1);
    expect(notifyDiscord).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'employer_approval',
        fields: expect.arrayContaining([{ name: 'company', value: 'Acme' }, { name: 'previousStatus', value: 'pending_approval' }]),
      })
    );

    // Restore the run-immediately behaviour the other suites rely on.
    vi.mocked(after).mockImplementation(((callback: () => unknown) => {
      void Promise.resolve(callback()).catch(() => undefined);
    }) as typeof after);
  });

  it('returns 400 if employer is already active', async () => {
    vi.mocked(prisma.employer.findFirst).mockResolvedValue({
      id: 'emp-1',
      status: 'active',
    } as any);

    const res = await approvePost(makeRequest({}, 'emp-1') as any, { params: Promise.resolve({ id: 'emp-1' }) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('already active');
  });

  it('returns 404 if employer not found', async () => {
    vi.mocked(prisma.employer.findFirst).mockResolvedValue(null);

    const res = await approvePost(makeRequest({}, 'emp-1') as any, { params: Promise.resolve({ id: 'emp-1' }) });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain('not found');
  });
});

describe('POST /api/admin/employers/[id]/reject', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUser).mockResolvedValue(adminUser as any);
    vi.mocked(requireAdmin).mockResolvedValue(undefined);
    vi.mocked(sendEmployerRejectedEmail).mockResolvedValue({ ok: true });
  });

  it('rejects a pending employer', async () => {
    vi.mocked(prisma.employer.findFirst).mockResolvedValue({
      id: 'emp-1',
      status: 'pending_approval',
      companyName: 'Acme',
      contactEmail: 'acme@example.com',
      contactName: 'Jane',
    } as any);

    vi.mocked(prisma.employer.update).mockResolvedValue({
      id: 'emp-1',
      status: 'inactive',
      companyName: 'Acme',
      contactEmail: 'acme@example.com',
      contactName: 'Jane',
    } as any);

    const res = await rejectPost(makeRequest({ reason: 'Incomplete information' }, 'emp-1') as any, { params: Promise.resolve({ id: 'emp-1' }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.employer.status).toBe('inactive');
    expect(sendEmployerRejectedEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'acme@example.com', companyName: 'Acme', reason: 'Incomplete information' })
    );
  });

  it('returns 400 if employer is already inactive', async () => {
    vi.mocked(prisma.employer.findFirst).mockResolvedValue({
      id: 'emp-1',
      status: 'inactive',
    } as any);

    const res = await rejectPost(makeRequest({}, 'emp-1') as any, { params: Promise.resolve({ id: 'emp-1' }) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('already rejected');
  });
});
