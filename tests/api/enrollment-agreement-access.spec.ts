// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  user: vi.fn(), role: vi.fn(), org: vi.fn(), client: vi.fn(), assurance: vi.fn(), trust: vi.fn(),
  findMember: vi.fn(), findAssignment: vi.fn(), notErasing: vi.fn(), cookie: vi.fn(),
  summary: vi.fn(), create: vi.fn(), coverage: vi.fn(), read: vi.fn(), review: vi.fn(),
}));
vi.mock('@/lib/auth/server', () => ({ getUser: mocks.user, createSupabaseServerClient: mocks.client }));
vi.mock('@/lib/auth/roles', () => ({ getProfileRole: mocks.role }));
vi.mock('@/lib/tenant/organization', () => ({ getActorOrganizationId: mocks.org }));
vi.mock('@/lib/db/prisma', () => ({ prisma: { counselorAssignment: { findFirst: mocks.findAssignment } } }));
vi.mock('@/lib/tenant/withTenantScope', () => ({
  withTenantScope: (_org: string, fn: (db: unknown) => Promise<unknown>) => fn({ user: { findFirst: mocks.findMember } }),
}));
vi.mock('@/lib/enrollmentAgreements/operationLock', () => ({ assertEnrollmentAgreementNotErasing: mocks.notErasing }));
vi.mock('@/lib/auth/mfaTrust', () => ({ getAdminMfaTrustCookieName: () => 'wa_admin_mfa_trust', verifyAdminMfaTrustToken: mocks.trust }));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: mocks.cookie }),
  headers: async () => new Headers({ 'user-agent': 'synthetic-agent', 'x-real-ip': '192.0.2.1' }),
}));
vi.mock('@/lib/db/withRequestGuc', () => ({ withApiGuc: (handler: unknown) => handler }));
vi.mock('@/lib/enrollmentAgreements/service', () => ({
  getAgreementSummary: mocks.summary, createAgreementSubmission: mocks.create, getAgreementCoverage: mocks.coverage,
  getAgreementForRead: mocks.read, reviewAgreementSubmission: mocks.review,
}));
vi.mock('@/lib/rate-limit', () => ({ checkResumeUploadRateLimit: async () => ({ success: true }) }));
vi.mock('@/lib/enrollmentAgreements/pdf', () => ({ readAgreementPdf: vi.fn() }));

import { requireAgreementActor, requireAgreementMemberAccess } from '@/lib/enrollmentAgreements/access';
import { EnrollmentAgreementError } from '@/lib/enrollmentAgreements/errors';
import { GET, POST } from '@/app/api/enrollment-agreements/route';
import { GET as COVERAGE } from '@/app/api/enrollment-agreements/coverage/route';
import { GET as TEMPLATE } from '@/app/api/enrollment-agreements/template/route';
import { GET as DOWNLOAD } from '@/app/api/enrollment-agreements/[id]/download/route';
import { POST as REVIEW } from '@/app/api/enrollment-agreements/[id]/review/route';

const MEMBER = '11111111-1111-4111-8111-111111111111';
const STAFF = '22222222-2222-4222-8222-222222222222';
const OTHER = '33333333-3333-4333-8333-333333333333';
const ORG = '44444444-4444-4444-8444-444444444444';
const actor = { id: MEMBER, organizationId: ORG, role: 'member' };
const request = (path: string, method = 'GET') => new Request(`https://portal.test/api/enrollment-agreements${path}`, { method });
const params = { params: Promise.resolve({ id: OTHER }) };
const handlers = [
  ['summary', () => GET(request(''))],
  ['upload', () => POST(request('', 'POST'))],
  ['coverage', () => COVERAGE(request('/coverage'))],
  ['template', () => TEMPLATE(request('/template'))],
  ['download', () => DOWNLOAD(request(`/${OTHER}/download`), params)],
  ['review', () => REVIEW(request(`/${OTHER}/review`, 'POST'), params)],
] as const;

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('ENROLLMENT_AGREEMENTS_ENABLED', 'true');
  vi.stubEnv('STAFF_MFA_ENFORCEMENT', '1');
  mocks.user.mockResolvedValue({ id: STAFF, user_metadata: { role: 'member' } });
  mocks.role.mockResolvedValue('admin');
  mocks.org.mockResolvedValue(ORG);
  mocks.client.mockResolvedValue({ auth: { mfa: { getAuthenticatorAssuranceLevel: mocks.assurance } } });
  mocks.assurance.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal2' }, error: null });
  mocks.trust.mockResolvedValue(false);
  mocks.cookie.mockReturnValue({ value: 'synthetic-trust-token' });
  mocks.findMember.mockResolvedValue({ id: MEMBER, organizationId: ORG });
  mocks.findAssignment.mockResolvedValue(null);
  mocks.notErasing.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllEnvs());

describe('enrollment agreement role-aware staff MFA', () => {
  it.each(['admin', 'super_admin', 'counselor', 'case_manager'])('rejects AAL1 %s on every API variant before data/file work', async (role) => {
    mocks.role.mockResolvedValue(role);
    for (const [name, run] of handlers) {
      const response = await run();
      expect(response.status, name).toBe(403);
      expect(await response.json(), name).toMatchObject({ code: 'MFA_REQUIRED' });
      expect(response.headers.get('cache-control'), name).toContain('no-store');
    }
    for (const fn of [mocks.summary, mocks.create, mocks.coverage, mocks.read, mocks.review, mocks.findMember]) expect(fn).not.toHaveBeenCalled();
  });
  it('uses persisted staff role even when auth metadata claims member', async () => {
    await expect(requireAgreementActor()).rejects.toMatchObject({ status: 403, code: 'MFA_REQUIRED' });
    expect(mocks.role).toHaveBeenCalledWith(STAFF);
  });
  it('preserves member self-service without consulting staff MFA', async () => {
    mocks.user.mockResolvedValue({ id: MEMBER }); mocks.role.mockResolvedValue('member');
    mocks.client.mockRejectedValue(new Error('must not be called for a member'));
    expect(await requireAgreementActor()).toEqual(actor);
    expect(await requireAgreementMemberAccess(actor, MEMBER, 'upload')).toMatchObject({ canUpload: true, canReview: false });
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it('allows AAL2 staff and preserves the explicitly disabled rollout switch', async () => {
    mocks.assurance.mockResolvedValue({ data: { currentLevel: 'aal2', nextLevel: 'aal2' }, error: null });
    expect(await requireAgreementActor()).toMatchObject({ id: STAFF, role: 'admin' });
    expect(mocks.trust).not.toHaveBeenCalled();
    vi.stubEnv('STAFF_MFA_ENFORCEMENT', '0'); mocks.client.mockClear();
    expect(await requireAgreementActor()).toMatchObject({ role: 'admin' });
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it('requires setup even when a stale trusted-device cookie exists without an enrolled factor', async () => {
    mocks.assurance.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal1' }, error: null });
    mocks.trust.mockResolvedValue(true);
    await expect(requireAgreementActor()).rejects.toMatchObject({ status: 403, code: 'MFA_SETUP_REQUIRED' });
    expect(mocks.trust).not.toHaveBeenCalled();
  });
  it('honors only validated enrolled-device trust bound to the actor, user agent, and IP', async () => {
    mocks.trust.mockResolvedValue(true);
    expect(await requireAgreementActor()).toMatchObject({ role: 'admin' });
    expect(mocks.trust).toHaveBeenCalledWith({ token: 'synthetic-trust-token', userId: STAFF, userAgent: 'synthetic-agent', ip: '192.0.2.1' });
    mocks.trust.mockRejectedValue(new Error('bad token'));
    await expect(requireAgreementActor()).rejects.toMatchObject({ status: 403, code: 'MFA_REQUIRED' });
  });
  it.each([
    { data: null, error: null },
    { data: { currentLevel: 'aal2' }, error: new Error('provider failure') },
    { data: { currentLevel: 'unknown' }, error: null },
  ])('fails closed for assurance failure %#', async (result) => {
    mocks.assurance.mockResolvedValue(result);
    await expect(requireAgreementActor()).rejects.toMatchObject({ status: 503, code: 'MFA_UNAVAILABLE' });
    expect(mocks.trust).not.toHaveBeenCalled();
  });
  it('fails closed when client creation or assurance lookup throws', async () => {
    mocks.client.mockRejectedValueOnce(new Error('configuration unavailable'));
    await expect(requireAgreementActor()).rejects.toMatchObject({ status: 503 });
    mocks.assurance.mockRejectedValue(new Error('network'));
    await expect(requireAgreementActor()).rejects.toMatchObject({ status: 503 });
  });
  it('requires authentication before MFA or feature availability checks', async () => {
    mocks.user.mockResolvedValue(null); vi.stubEnv('ENROLLMENT_AGREEMENTS_ENABLED', 'false');
    await expect(requireAgreementActor()).rejects.toMatchObject({ status: 401 });
    expect(mocks.role).not.toHaveBeenCalled(); expect(mocks.client).not.toHaveBeenCalled();
  });
});

describe('enrollment student lookup does not reveal inaccessible account state', () => {
  it.each(['member', 'employer', 'partner', 'counselor', 'case_manager'])('%s sees the same denial before malformed, missing, or erasing subject lookup', async (role) => {
    mocks.notErasing.mockRejectedValue(new EnrollmentAgreementError(409, 'ACCOUNT_ERASURE_IN_PROGRESS', 'Erasing'));
    for (const id of ['malformed', OTHER]) {
      for (const found of [null, { id, organizationId: ORG }]) {
        mocks.findMember.mockResolvedValue(found);
        await expect(requireAgreementMemberAccess({ ...actor, role }, id)).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
      }
    }
    expect(mocks.findMember).not.toHaveBeenCalled(); expect(mocks.notErasing).not.toHaveBeenCalled();
  });
  it.each(['counselor', 'case_manager'])('denies %s writes before even assignment or student lookup', async (role) => {
    mocks.findAssignment.mockResolvedValue({ id: 'assigned' });
    for (const intent of ['upload', 'review'] as const) {
      await expect(requireAgreementMemberAccess({ ...actor, role }, OTHER, intent)).rejects.toMatchObject({ status: 403 });
    }
    expect(mocks.findAssignment).not.toHaveBeenCalled(); expect(mocks.findMember).not.toHaveBeenCalled(); expect(mocks.notErasing).not.toHaveBeenCalled();
  });
  it('authorizes active same-org counselor assignment before reading student or erasure state', async () => {
    mocks.findAssignment.mockResolvedValue({ id: 'assigned' });
    await requireAgreementMemberAccess({ ...actor, role: 'counselor' }, OTHER);
    expect(mocks.findAssignment.mock.invocationCallOrder[0]).toBeLessThan(mocks.findMember.mock.invocationCallOrder[0]);
    expect(mocks.findMember.mock.invocationCallOrder[0]).toBeLessThan(mocks.notErasing.mock.invocationCallOrder[0]);
    expect(mocks.findAssignment).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({
      memberId: OTHER, active: true, member: { organizationId: ORG, deletedAt: null },
      counselor: { userId: MEMBER, active: true, user: { organizationId: ORG, deletedAt: null } },
    }) }));
  });
  it('still reports validation/missing/erasure distinctions to an authorized admin', async () => {
    const admin = { ...actor, id: STAFF, role: 'admin' };
    await expect(requireAgreementMemberAccess(admin, 'malformed')).rejects.toMatchObject({ status: 400 });
    mocks.findMember.mockResolvedValue(null);
    await expect(requireAgreementMemberAccess(admin, OTHER)).rejects.toMatchObject({ status: 404 });
    mocks.findMember.mockResolvedValue({ id: OTHER, organizationId: ORG });
    mocks.notErasing.mockRejectedValue(new EnrollmentAgreementError(409, 'ACCOUNT_ERASURE_IN_PROGRESS', 'Erasing'));
    await expect(requireAgreementMemberAccess(admin, OTHER)).rejects.toMatchObject({ status: 409 });
  });
});
