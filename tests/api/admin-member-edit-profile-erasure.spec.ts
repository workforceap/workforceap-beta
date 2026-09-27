import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  getUser: vi.fn(),
  isAdmin: vi.fn(),
  getOrg: vi.fn(),
  scopedFind: vi.fn(),
  activeWrite: vi.fn(),
  txFind: vi.fn(),
  txUpdate: vi.fn(),
  profileUpsert: vi.fn(),
  invalidate: vi.fn(),
}));

vi.mock('next/server', () => ({
  NextResponse: { json: (body: unknown, init?: ResponseInit) => new Response(JSON.stringify(body), init) },
}));
vi.mock('@/lib/db/withRequestGuc', () => ({ withApiGuc: (handler: unknown) => handler }));
vi.mock('@/lib/auth/server', () => ({ getUser: mock.getUser }));
vi.mock('@/lib/auth/roles', () => ({ isAdmin: mock.isAdmin }));
vi.mock('@/lib/tenant/organization', () => ({ getActorOrganizationId: mock.getOrg }));
vi.mock('@/lib/tenant/withTenantScope', () => ({
  withTenantScope: (_orgId: string, write: (db: unknown) => Promise<unknown>) => write({ user: { findFirst: mock.scopedFind } }),
}));
vi.mock('@/lib/member/activeWrite', () => {
  class MemberLifecycleWriteError extends Error {}
  return { MemberLifecycleWriteError, withActiveMemberWrite: mock.activeWrite };
});
vi.mock('@/lib/member/getMemberState', () => ({ invalidateMemberState: mock.invalidate }));
vi.mock('@/lib/audit', () => ({ auditLog: vi.fn(async () => undefined) }));
vi.mock('@/lib/audit/log', () => ({ auditRequestMeta: () => ({}), logAuditEvent: vi.fn(async () => undefined) }));

import { PATCH } from '@/app/api/admin/members/[id]/edit-profile/route';
import { MemberLifecycleWriteError } from '@/lib/member/activeWrite';

const memberId = '11111111-1111-4111-8111-111111111111';
const request = () => new Request(`http://localhost/api/admin/members/${memberId}/edit-profile`, {
  method: 'PATCH',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ fullName: 'Restored Name', profileAddress: 'Private Address' }),
});

describe('admin member edit-profile deletion barrier', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.getUser.mockResolvedValue({ id: 'admin-1' });
    mock.isAdmin.mockResolvedValue(true);
    mock.getOrg.mockResolvedValue('org-1');
    mock.scopedFind.mockResolvedValue({ id: memberId });
    mock.invalidate.mockResolvedValue(undefined);
  });

  it('rejects a stale initial member read when deletion wins before the final write', async () => {
    mock.activeWrite.mockRejectedValue(new MemberLifecycleWriteError());

    const response = await PATCH(request() as never, { params: Promise.resolve({ id: memberId }) });

    expect(response.status).toBe(409);
    expect(mock.activeWrite).toHaveBeenCalledWith(memberId, expect.any(Function));
    expect(mock.txUpdate).not.toHaveBeenCalled();
    expect(mock.profileUpsert).not.toHaveBeenCalled();
  });

  it('commits member and profile changes through one guarded write', async () => {
    const tx = {
      user: { findFirst: mock.txFind, update: mock.txUpdate },
      profile: { upsert: mock.profileUpsert },
    };
    mock.txFind.mockResolvedValueOnce({ id: memberId }).mockResolvedValueOnce({ id: memberId, fullName: 'Restored Name', email: 'member@example.org' });
    mock.txUpdate.mockResolvedValue({ id: memberId });
    mock.profileUpsert.mockResolvedValue({ userId: memberId });
    mock.activeWrite.mockImplementation(async (_id: string, write: (client: typeof tx) => Promise<unknown>) => write(tx));

    const response = await PATCH(request() as never, { params: Promise.resolve({ id: memberId }) });

    expect(response.status).toBe(200);
    expect(mock.activeWrite).toHaveBeenCalledOnce();
    expect(mock.txUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: memberId, organizationId: 'org-1' },
      data: { fullName: 'Restored Name' },
    }));
    expect(mock.profileUpsert).toHaveBeenCalledOnce();
  });
});
