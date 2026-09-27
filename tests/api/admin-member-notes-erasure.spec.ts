// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(), isAdmin: vi.fn(), organizationId: vi.fn(), tenantScope: vi.fn(),
  activeWrite: vi.fn(), memberLookup: vi.fn(), createNote: vi.fn(), auditLog: vi.fn(), auditEvent: vi.fn(),
}));

vi.mock('@/lib/auth/server', () => ({ getUser: mocks.getUser }));
vi.mock('@/lib/auth/roles', () => ({ isAdmin: mocks.isAdmin }));
vi.mock('@/lib/tenant/organization', () => ({ getActorOrganizationId: mocks.organizationId }));
vi.mock('@/lib/tenant/withTenantScope', () => ({ withTenantScope: mocks.tenantScope }));
vi.mock('@/lib/member/activeWrite', () => ({
  MemberLifecycleWriteError: class MemberLifecycleWriteError extends Error {},
  withActiveMemberWrite: mocks.activeWrite,
}));
vi.mock('@/lib/db/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/db/withRequestGuc', () => ({ withApiGuc: (handler: unknown) => handler }));
vi.mock('@/lib/audit', () => ({ auditLog: mocks.auditLog }));
vi.mock('@/lib/audit/log', () => ({ logAuditEvent: mocks.auditEvent }));
vi.mock('@/lib/observability/captureApiError', () => ({ captureApiError: vi.fn() }));

import { POST } from '@/app/api/admin/members/[id]/notes/route';
import { MemberLifecycleWriteError } from '@/lib/member/activeWrite';

const request = () => new NextRequest('http://localhost/api/admin/members/member-1/notes', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ content: 'Private synthetic counselor note' }),
});
const context = { params: Promise.resolve({ id: 'member-1' }) };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getUser.mockResolvedValue({ id: 'admin-1' });
  mocks.isAdmin.mockResolvedValue(true);
  mocks.organizationId.mockResolvedValue('org-1');
  mocks.tenantScope.mockResolvedValue({ id: 'member-1' });
  mocks.memberLookup.mockResolvedValue({ id: 'member-1' });
  mocks.createNote.mockResolvedValue({ id: 'note-1', content: 'Private synthetic counselor note' });
  mocks.auditLog.mockResolvedValue(undefined);
  mocks.auditEvent.mockResolvedValue(undefined);
  mocks.activeWrite.mockImplementation(async (_id, write) => write({
    user: { findFirst: mocks.memberLookup }, counselorNote: { create: mocks.createNote },
  }));
});

it('rejects a stale admin note when erasure wins after the tenant lookup', async () => {
  mocks.activeWrite.mockRejectedValueOnce(new MemberLifecycleWriteError());
  const response = await POST(request(), context);
  expect(response.status).toBe(409);
  expect(mocks.tenantScope).toHaveBeenCalledOnce();
  expect(mocks.createNote).not.toHaveBeenCalled();
});

it('rechecks tenant membership inside the guarded write', async () => {
  mocks.memberLookup.mockResolvedValueOnce(null);
  const response = await POST(request(), context);
  expect(response.status).toBe(404);
  expect(mocks.memberLookup).toHaveBeenCalledWith({
    where: { id: 'member-1', organizationId: 'org-1' }, select: { id: true },
  });
  expect(mocks.createNote).not.toHaveBeenCalled();
});

it('still creates a note for an active member in the admin tenant', async () => {
  const response = await POST(request(), context);
  expect(response.status).toBe(201);
  expect(mocks.activeWrite).toHaveBeenCalledWith('member-1', expect.any(Function));
  expect(mocks.createNote).toHaveBeenCalledWith(expect.objectContaining({
    data: { memberId: 'member-1', authorId: 'admin-1', content: 'Private synthetic counselor note' },
  }));
});
