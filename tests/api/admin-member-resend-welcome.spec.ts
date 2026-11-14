// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  user: vi.fn(), admin: vi.fn(), superAdmin: vi.fn(), org: vi.fn(), member: vi.fn(),
  limit: vi.fn(), send: vi.fn(), audit: vi.fn(), event: vi.fn(),
}));
vi.mock('@/lib/auth/server', () => ({ getUser: mocks.user }));
vi.mock('@/lib/auth/roles', () => ({ isAdmin: mocks.admin, isSuperAdmin: mocks.superAdmin }));
vi.mock('@/lib/tenant/organization', () => ({ getActorOrganizationId: mocks.org }));
vi.mock('@/lib/tenant/withTenantScope', () => ({ withTenantScope: async (org: string, fn: (db: unknown) => Promise<unknown>) => {
  expect(org).toBe('org-a');
  return fn({ user: { findFirst: mocks.member } });
} }));
vi.mock('@/lib/db/withRequestGuc', () => ({ withApiGuc: (handler: unknown) => handler }));
vi.mock('@/lib/rate-limit', () => ({ checkWelcomeResendRateLimit: mocks.limit }));
vi.mock('@/lib/email', () => ({ sendMemberWelcomeLetterEmail: mocks.send }));
vi.mock('@/lib/audit', () => ({ auditLog: mocks.audit }));
vi.mock('@/lib/audit/log', () => ({ auditRequestMeta: () => ({ marker: 'request' }), logAuditEvent: mocks.event }));
import { POST } from '@/app/api/admin/members/[id]/resend-welcome/route';
import { matchesWhere } from '../helpers/prismaWhereMatches';
const request = (headers?: HeadersInit) => new Request('http://localhost/api/admin/members/m1/resend-welcome', { method: 'POST', headers });
const context = () => ({ params: Promise.resolve({ id: 'm1' }) });
const recipient = (overrides: Record<string, unknown> = {}) => ({
  id: 'm1', organizationId: 'org-a', deletedAt: null,
  email: 'recorded@member.test', fullName: 'Member Name',
  profile: { role: 'member' }, userRoles: [{ role: { name: 'member' } }],
  ...overrides,
});
const useRecipient = (row: ReturnType<typeof recipient>) => {
  mocks.member.mockImplementation(async ({ where }: { where: unknown }) => matchesWhere(row, where) ? row : null);
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.user.mockResolvedValue({ id: 'admin-a' });
  mocks.admin.mockResolvedValue(true);
  mocks.superAdmin.mockResolvedValue(false);
  mocks.org.mockResolvedValue('org-a');
  useRecipient(recipient());
  mocks.limit.mockResolvedValue({ success: true });
  mocks.send.mockResolvedValue({ ok: true });
  mocks.audit.mockResolvedValue(undefined);
  mocks.event.mockResolvedValue(undefined);
});

describe('admin welcome letter resend', () => {
  it('rejects unauthenticated and non-admin actors', async () => {
    mocks.user.mockResolvedValueOnce(null);
    expect((await POST(request(), context())).status).toBe(401);
    mocks.admin.mockResolvedValueOnce(false);
    expect((await POST(request(), context())).status).toBe(403);
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it('fails closed when the actor organization cannot be resolved', async () => {
    mocks.org.mockRejectedValueOnce(new Error('database unavailable'));
    expect((await POST(request(), context())).status).toBe(403);
    mocks.org.mockResolvedValueOnce('');
    expect((await POST(request(), context())).status).toBe(403);
    expect(mocks.member).not.toHaveBeenCalled();
  });
  it('uses tenant and active-member filters; absent, cross-tenant or deleted members cannot receive mail', async () => {
    mocks.member.mockResolvedValueOnce(null);
    expect((await POST(request(), context())).status).toBe(404);
    expect(mocks.member).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: 'm1', organizationId: 'org-a', deletedAt: null }) }));
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it.each([
    ['cross tenant', { organizationId: 'org-b' }],
    ['deleted', { deletedAt: new Date() }],
    ['missing email', { email: '' }],
    ['missing role', { profile: null, userRoles: [] }],
    ['unknown role', { profile: { role: 'unknown' }, userRoles: [{ role: { name: 'unknown' } }] }],
    ...['admin', 'super_admin', 'case_manager', 'counselor', 'employer', 'partner'].map((role): [string, Record<string, unknown>] => [
      `${role} profile with baseline member row`, { profile: { role } },
    ]),
  ])('rejects %s before rate limiting or sending', async (_description, overrides) => {
    useRecipient(recipient(overrides as Record<string, unknown>));
    expect((await POST(request(), context())).status).toBe(404);
    expect(mocks.limit).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });
  it('accepts a member profile without a backfilled role row', async () => {
    useRecipient(recipient({ userRoles: [] }));
    expect((await POST(request(), context())).status).toBe(200);
    expect(mocks.send).toHaveBeenCalledOnce();
  });
  it.each([
    ['missing profile', { profile: null }],
    ['unknown profile', { profile: { role: 'unknown' } }],
    ['member profile with staff row', { userRoles: [{ role: { name: 'member' } }, { role: { name: 'admin' } }] }],
  ])('preserves canonical member eligibility for %s', async (_description, overrides) => {
    useRecipient(recipient(overrides as Record<string, unknown>));
    expect((await POST(request(), context())).status).toBe(200);
    expect(mocks.send).toHaveBeenCalledOnce();
  });
  it('blocks read-only audits and rate-limited sends', async () => {
    expect((await POST(request({ 'x-workforceap-read-only-audit': '1' }), context())).status).toBe(403);
    mocks.limit.mockResolvedValueOnce({ success: false });
    expect((await POST(request(), context())).status).toBe(429);
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it('returns a safe error when the provider rejects a send', async () => {
    mocks.send.mockResolvedValueOnce({ ok: false, error: 'secret provider detail' });
    const response = await POST(request(), context());
    expect(response.status).toBe(502);
    expect(JSON.stringify(await response.json())).not.toContain('secret');
    expect(mocks.audit).not.toHaveBeenCalled();
  });
  it('returns a safe 500 when the send path throws', async () => {
    mocks.send.mockRejectedValueOnce(new Error('secret provider crash'));
    const response = await POST(request(), context());
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({ error: 'The welcome letter could not be sent. Please try again later.' });
    expect(JSON.stringify(body)).not.toContain('secret');
    expect(mocks.audit).not.toHaveBeenCalled();
  });
  it.each([false, true])('sends only to the recorded address and audits provider acceptance (super admin: %s)', async (superAdmin) => {
    mocks.superAdmin.mockResolvedValue(superAdmin);
    const response = await POST(request(), context());
    expect(response.status).toBe(200);
    expect(mocks.send).toHaveBeenCalledWith({ to: 'recorded@member.test', fullName: 'Member Name', memberId: 'm1' });
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ actorUserId: 'admin-a', targetId: 'm1', metadata: { organizationId: 'org-a' } }));
    expect(mocks.event).toHaveBeenCalledWith(expect.objectContaining({ result: { success: true, extensions: { organizationId: 'org-a', providerAccepted: true } } }));
  });
});
