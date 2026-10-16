import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { matchesWhere } from '@/tests/helpers/prismaWhereMatches';

const state = vi.hoisted(() => ({
  actor: { id: 'admin-1' } as { id: string } | null,
  allowed: true,
  users: [] as Array<{ id: string; organizationId: string; deletedAt: Date | null }>,
  findLeader: vi.fn(), create: vi.fn(), audit: vi.fn(),
}));
vi.mock('@/lib/auth/server', () => ({ getUser: async () => state.actor }));
vi.mock('@/lib/auth/roles', () => ({ requireAdmin: async () => { if (!state.allowed) throw new Error('Forbidden'); } }));
vi.mock('@/lib/tenant/organization', () => ({ getActorOrganizationId: async () => 'org-1' }));
vi.mock('@/lib/tenant/withTenantScope', () => ({ withTenantScope: async (_org: string, fn: (db: unknown) => unknown) => fn({
  user: { findFirst: state.findLeader }, chapter: { create: state.create },
}) }));
vi.mock('@/lib/db/withRequestGuc', () => ({ withApiGuc: (fn: unknown) => fn }));
vi.mock('@/lib/audit', () => ({ auditLog: state.audit }));
import { POST } from '@/app/api/admin/chapters/route';

const own = '00000000-0000-4000-8000-000000000001';
const foreign = '00000000-0000-4000-8000-000000000002';
const deleted = '00000000-0000-4000-8000-000000000003';
const missing = '00000000-0000-4000-8000-000000000004';

function request(leaderId?: string) {
  return new NextRequest('https://example.test/api/admin/chapters', { method: 'POST',
    body: JSON.stringify({ name: 'Chapter', slug: 'chapter', ...(leaderId ? { leaderId } : {}) }),
    headers: { 'Content-Type': 'application/json' },
  });
}
beforeEach(() => {
  vi.clearAllMocks(); state.actor = { id: 'admin-1' }; state.allowed = true;
  state.users = [
    { id: own, organizationId: 'org-1', deletedAt: null },
    { id: foreign, organizationId: 'org-2', deletedAt: null },
    { id: deleted, organizationId: 'org-1', deletedAt: new Date('2026-01-01') },
  ];
  state.findLeader.mockImplementation(async ({ where }: { where: unknown }) =>
    state.users.find((user) => matchesWhere(user, where)) ?? null);
  state.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'chapter-1', ...data }));
  state.audit.mockResolvedValue(undefined);
});

describe('admin chapter leader tenant validation', () => {
  it.each([foreign, deleted, missing])('rejects unavailable leader %s with no chapter or success audit', async (leaderId) => {
    const response = await POST(request(leaderId));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Leader user not found in your organization' });
    expect(state.findLeader).toHaveBeenCalledWith({
      where: { id: leaderId, organizationId: 'org-1', deletedAt: null }, select: { id: true },
    });
    expect(state.create).not.toHaveBeenCalled(); expect(state.audit).not.toHaveBeenCalled();
  });

  it('creates a chapter with a live same-organization leader', async () => {
    const response = await POST(request(own));
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ organizationId: 'org-1', leaderId: own });
    expect(state.create).toHaveBeenCalledOnce(); expect(state.audit).toHaveBeenCalledOnce();
  });

  it('keeps the leader optional without querying users', async () => {
    expect((await POST(request())).status).toBe(201);
    expect(state.findLeader).not.toHaveBeenCalled();
    expect(state.create.mock.calls[0][0].data).not.toHaveProperty('leaderId');
  });

  it('rejects an invalid leader id before looking up or creating data', async () => {
    expect((await POST(request('not-a-uuid'))).status).toBe(400);
    expect(state.findLeader).not.toHaveBeenCalled(); expect(state.create).not.toHaveBeenCalled();
  });

  it.each([401, 403])('preserves the %s authentication/authorization gate before leader lookup', async (status) => {
    if (status === 401) state.actor = null; else state.allowed = false;
    expect((await POST(request(own))).status).toBe(status);
    expect(state.findLeader).not.toHaveBeenCalled(); expect(state.create).not.toHaveBeenCalled();
  });
});
