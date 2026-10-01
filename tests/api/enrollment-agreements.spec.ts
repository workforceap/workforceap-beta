// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(), getProfileRole: vi.fn(), getActorOrganizationId: vi.fn(),
  findMember: vi.fn(), findAssignment: vi.fn(), findSubmissions: vi.fn(), findSubmission: vi.fn(),
  countSubmissions: vi.fn(), queryRaw: vi.fn(), userCount: vi.fn(), userFindMany: vi.fn(),
  store: vi.fn(), remove: vi.fn(), readPdf: vi.fn(), limiter: vi.fn(),
  withTenantScope: vi.fn(),
  acquire: vi.fn(), release: vi.fn(), assertNotErasing: vi.fn(),
}));
vi.mock('@/lib/db/withRequestGuc', () => ({ withApiGuc: (handler: unknown) => handler }));
vi.mock('@/lib/auth/server', () => ({ getUser: mocks.getUser }));
vi.mock('@/lib/auth/roles', () => ({ getProfileRole: mocks.getProfileRole }));
vi.mock('@/lib/tenant/organization', () => ({ getActorOrganizationId: mocks.getActorOrganizationId }));
vi.mock('@/lib/db/prisma', () => ({ prisma: { counselorAssignment: { findFirst: mocks.findAssignment }, $queryRaw: mocks.queryRaw } }));
vi.mock('@/lib/tenant/withTenantScope', () => ({ withTenantScope: mocks.withTenantScope }));
vi.mock('@/lib/enrollmentAgreements/storage', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/enrollmentAgreements/storage')>(),
  storeAgreementPdf: mocks.store, removeStagedAgreementPdf: mocks.remove,
}));
vi.mock('@/lib/enrollmentAgreements/pdf', () => ({ readAgreementPdf: mocks.readPdf }));
vi.mock('@/lib/rate-limit', () => ({ checkResumeUploadRateLimit: mocks.limiter }));
vi.mock('@/lib/enrollmentAgreements/operationLock', () => ({
  acquireEnrollmentAgreementUploadLock: mocks.acquire,
  releaseEnrollmentAgreementUploadLock: mocks.release,
  assertEnrollmentAgreementNotErasing: mocks.assertNotErasing,
}));

import { GET, POST } from '@/app/api/enrollment-agreements/route';
import { POST as REVIEW } from '@/app/api/enrollment-agreements/[id]/review/route';
import { GET as COVERAGE } from '@/app/api/enrollment-agreements/coverage/route';
import { createAgreementSubmission, reviewAgreementSubmission } from '@/lib/enrollmentAgreements/service';
import { requireAgreementMemberAccess } from '@/lib/enrollmentAgreements/access';
import { EnrollmentAgreementError } from '@/lib/enrollmentAgreements/errors';

const MEMBER = '11111111-1111-4111-8111-111111111111';
const ADMIN = '22222222-2222-4222-8222-222222222222';
const OTHER = '33333333-3333-4333-8333-333333333333';
const ID = '44444444-4444-4444-8444-444444444444';
const ORG = '55555555-5555-4555-8555-555555555555';
const admin = { id: ADMIN, organizationId: ORG, role: 'admin' };
const member = { id: MEMBER, organizationId: ORG, role: 'member' };
const pdf = new Uint8Array(Buffer.from('%PDF-1.7\nsynthetic\n%%EOF'));
const submission = () => ({
  id: ID, organizationId: ORG, memberId: MEMBER, storagePath: `enrollment-agreements/${MEMBER}/${ID}.pdf`,
  sha256: 'a'.repeat(64), sizeBytes: pdf.length, templateVersion: '2026-09-30', uploadedByUserId: MEMBER,
  uploadedAt: new Date('2026-10-01T12:00:00Z'), status: 'pending', isCurrent: true,
  reviewedByUserId: null, reviewedAt: null, reviewNote: null,
});
function uploadRequest(memberId = MEMBER) {
  const form = new FormData();
  form.set('file', new File([pdf], 'signed.pdf', { type: 'application/pdf' }));
  form.set('memberId', memberId); form.set('templateVersion', '2026-09-30');
  return new Request('https://portal.test/api/enrollment-agreements', { method: 'POST', body: form, headers: { origin: 'https://portal.test' } });
}
function reviewRequest(body: unknown) {
  return new Request(`https://portal.test/api/enrollment-agreements/${ID}/review`, {
    method: 'POST', headers: { origin: 'https://portal.test', 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('ENROLLMENT_AGREEMENTS_ENABLED', 'true');
  mocks.getUser.mockResolvedValue({ id: MEMBER });
  mocks.getProfileRole.mockResolvedValue('member');
  mocks.getActorOrganizationId.mockResolvedValue(ORG);
  mocks.findMember.mockImplementation(({ where }: { where: { id: string } }) => Promise.resolve(
    where.id === MEMBER || where.id === ADMIN ? { id: where.id, organizationId: ORG } : null,
  ));
  mocks.findAssignment.mockResolvedValue(null);
  mocks.findSubmissions.mockResolvedValue([]);
  mocks.findSubmission.mockResolvedValue(submission());
  mocks.countSubmissions.mockResolvedValue(0);
  mocks.queryRaw.mockResolvedValue([{ id: ID }]);
  mocks.store.mockResolvedValue(undefined); mocks.remove.mockResolvedValue(undefined);
  mocks.readPdf.mockResolvedValue(pdf); mocks.limiter.mockResolvedValue({ success: true });
  mocks.acquire.mockResolvedValue('operation-token'); mocks.release.mockResolvedValue(undefined); mocks.assertNotErasing.mockResolvedValue(undefined);
  mocks.userCount.mockResolvedValue(0); mocks.userFindMany.mockResolvedValue([]);
  mocks.withTenantScope.mockImplementation((_orgId, fn) => fn({
    user: { findFirst: mocks.findMember, findMany: mocks.userFindMany, count: mocks.userCount },
    enrollmentAgreementSubmission: { findMany: mocks.findSubmissions, findFirst: mocks.findSubmission, count: mocks.countSubmissions },
  }));
});

describe('enrollment agreement authenticated routes', () => {
  it('rejects anonymous callers before exposing disabled feature configuration', async () => {
    vi.stubEnv('ENROLLMENT_AGREEMENTS_ENABLED', 'false'); mocks.getUser.mockResolvedValue(null);
    const response = await GET(new Request('https://portal.test/api/enrollment-agreements'));
    expect(response.status).toBe(401); expect(mocks.findSubmissions).not.toHaveBeenCalled();
  });
  it('disabled feature is unavailable, never a missing agreement', async () => {
    vi.stubEnv('ENROLLMENT_AGREEMENTS_ENABLED', 'false');
    const response = await GET(new Request('https://portal.test/api/enrollment-agreements'));
    expect(response.status).toBe(503); expect(await response.json()).not.toHaveProperty('status', 'missing');
  });
  it('missing schema is unavailable and never mislabels every student as missing', async () => {
    mocks.findSubmissions.mockRejectedValue({ code: 'P2021', secret: 'not-for-client' });
    const response = await GET(new Request('https://portal.test/api/enrollment-agreements'));
    expect(response.status).toBe(503); expect(await response.text()).not.toContain('not-for-client');
  });
  it('self reads a genuine missing agreement with no review permission', async () => {
    const response = await GET(new Request('https://portal.test/api/enrollment-agreements'));
    expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ status: 'missing', canUpload: true, canReview: false, submissions: [] });
    expect(mocks.withTenantScope).toHaveBeenCalledWith(ORG, expect.any(Function));
  });
  it('reads current status and history without leaking storage paths, hashes or provider URLs', async () => {
    mocks.findSubmissions.mockResolvedValue([submission()]);
    const response = await GET(new Request('https://portal.test/api/enrollment-agreements'));
    const body = await response.json();
    expect(body.status).toBe('pending');
    expect(body.submissions[0].downloadUrl).toBe(`/api/enrollment-agreements/${ID}/download`);
    expect(body.submissions[0]).not.toHaveProperty('storagePath'); expect(body.submissions[0]).not.toHaveProperty('sha256');
    expect(mocks.findSubmissions).toHaveBeenCalledWith(expect.objectContaining({ take: 50, where: { memberId: MEMBER, organizationId: ORG } }));
  });
  it('denies another member and cross-org subjects even to a super-admin', async () => {
    await expect(requireAgreementMemberAccess(member, ADMIN)).rejects.toMatchObject({ status: 403 });
    await expect(requireAgreementMemberAccess({ ...admin, role: 'super_admin' }, OTHER)).rejects.toMatchObject({ status: 404 });
  });
  it('permits only assigned same-org counselors to read and denies all counselor writes', async () => {
    const counselor = { ...admin, role: 'counselor' };
    await expect(requireAgreementMemberAccess(counselor, MEMBER)).rejects.toMatchObject({ status: 403 });
    mocks.findAssignment.mockResolvedValue({ id: 'assignment' });
    expect(await requireAgreementMemberAccess(counselor, MEMBER)).toMatchObject({ canUpload: false, canReview: false });
    await expect(requireAgreementMemberAccess(counselor, MEMBER, 'upload')).rejects.toMatchObject({ status: 403 });
    await expect(requireAgreementMemberAccess(counselor, MEMBER, 'review')).rejects.toMatchObject({ status: 403 });
    expect(mocks.findAssignment).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ active: true, member: { organizationId: ORG, deletedAt: null } }) }));
  });
  it('uploads exact bytes as pending; names/text cannot establish signatures', async () => {
    const response = await POST(uploadRequest());
    expect(response.status).toBe(201); expect(await response.json()).toMatchObject({ status: 'pending' });
    expect(mocks.store).toHaveBeenCalledWith(expect.stringMatching(new RegExp(`^enrollment-agreements/${MEMBER}/[0-9a-f-]+\\.pdf$`)), pdf);
  });
  it('denies counselor upload before parsing PDF or storing bytes', async () => {
    mocks.getUser.mockResolvedValue({ id: ADMIN }); mocks.getProfileRole.mockResolvedValue('counselor'); mocks.findAssignment.mockResolvedValue({ id: 'assignment' });
    const response = await POST(uploadRequest());
    expect(response.status).toBe(403); expect(mocks.readPdf).not.toHaveBeenCalled(); expect(mocks.store).not.toHaveBeenCalled();
  });
  it('rejects cross-site multipart requests before upload work', async () => {
    const request = uploadRequest(); request.headers.set('origin', 'https://evil.test');
    expect((await POST(request)).status).toBe(403); expect(mocks.store).not.toHaveBeenCalled();
  });
  it('rejects invalid PDF result without storing an object', async () => {
    mocks.readPdf.mockRejectedValue(new EnrollmentAgreementError(400, 'INVALID_PDF', 'Invalid PDF'));
    expect((await POST(uploadRequest())).status).toBe(400); expect(mocks.store).not.toHaveBeenCalled();
  });
  it('requires selected version rather than silently attributing an older agreement to new terms', async () => {
    const form = new FormData(); form.set('file', new File([pdf], 'file.pdf', { type: 'application/pdf' }));
    expect((await POST(new Request('https://portal.test/api/enrollment-agreements', { method: 'POST', body: form }))).status).toBe(400);
    expect(mocks.store).not.toHaveBeenCalled();
  });
  it('requires deliberate staff signature/date attestation and forbids self-review', async () => {
    await expect(reviewAgreementSubmission(admin, { id: ID, action: 'verify', reviewNote: null })).rejects.toMatchObject({ status: 400 });
    await expect(reviewAgreementSubmission({ ...member, role: 'admin' }, { id: ID, action: 'verify', reviewNote: null, attestSignatures: true })).rejects.toMatchObject({ status: 403 });
    expect(mocks.queryRaw).not.toHaveBeenCalled();
  });
  it('requires bounded correction note and rejects unknown review fields', async () => {
    mocks.getUser.mockResolvedValue({ id: ADMIN }); mocks.getProfileRole.mockResolvedValue('admin');
    expect((await REVIEW(reviewRequest({ action: 'request_correction' }), { params: Promise.resolve({ id: ID }) })).status).toBe(400);
    expect((await REVIEW(reviewRequest({ action: 'request_correction', reviewNote: 'a'.repeat(1001) }), { params: Promise.resolve({ id: ID }) })).status).toBe(400);
    expect((await REVIEW(reviewRequest({ action: 'verify', attestSignatures: true, memberId: OTHER }), { params: Promise.resolve({ id: ID }) })).status).toBe(400);
    expect(mocks.queryRaw).not.toHaveBeenCalled();
  });
  it('old revision review conflict does not report successful verification', async () => {
    mocks.queryRaw.mockResolvedValue([]);
    await expect(reviewAgreementSubmission(admin, { id: ID, action: 'verify', reviewNote: null, attestSignatures: true })).rejects.toMatchObject({ status: 409, code: 'STALE_REVIEW' });
  });
  it('rolls back a concurrent-upload conflict and cleans only the newly staged object', async () => {
    mocks.queryRaw.mockRejectedValue({ code: 'P2010', meta: { code: '23505' } });
    await expect(createAgreementSubmission(member, { memberId: MEMBER, templateVersion: '2026-09-30', bytes: pdf })).rejects.toMatchObject({ status: 409, code: 'REVISION_CONFLICT' });
    expect(mocks.remove).toHaveBeenCalledExactlyOnceWith(mocks.store.mock.calls[0][0]);
    expect(mocks.remove.mock.calls[0][0]).not.toBe(submission().storagePath);
  });
  it('preserves bytes after ambiguous network failure rather than deleting a possible committed revision', async () => {
    mocks.queryRaw.mockRejectedValue(new Error('connection lost after commit'));
    await expect(createAgreementSubmission(member, { memberId: MEMBER, templateVersion: 'previous', bytes: pdf })).rejects.toThrow();
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.release).not.toHaveBeenCalled();
  });
  it('does not mistake generic raw-query transport errors for a proven SQL rollback', async () => {
    mocks.queryRaw.mockRejectedValue({ code: 'P2010', meta: { code: '08006' } });
    expect((await POST(uploadRequest())).status).toBe(503);
    expect(mocks.remove).not.toHaveBeenCalled(); expect(mocks.release).not.toHaveBeenCalled();
  });
  it('does not store anything while another upload or account erasure owns the fence', async () => {
    mocks.acquire.mockRejectedValue(new EnrollmentAgreementError(409, 'AGREEMENT_OPERATION_IN_PROGRESS', 'Retry later'));
    expect((await POST(uploadRequest())).status).toBe(409);
    expect(mocks.store).not.toHaveBeenCalled(); expect(mocks.queryRaw).not.toHaveBeenCalled();
  });
  it('holds the fence until SQL commit, and never deletes committed bytes if release fails', async () => {
    mocks.queryRaw.mockImplementation(async () => {
      expect(mocks.acquire).toHaveBeenCalled(); expect(mocks.store).toHaveBeenCalled();
      expect(mocks.release).not.toHaveBeenCalled(); return [{ id: ID }];
    });
    mocks.release.mockRejectedValue(new EnrollmentAgreementError(503, 'AGREEMENT_LOCK_RECONCILIATION_REQUIRED', 'Support required'));
    expect((await POST(uploadRequest())).status).toBe(503);
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it('does not release the fence before rollback storage compensation is confirmed', async () => {
    mocks.queryRaw.mockRejectedValue({ code: 'P2010', meta: { code: '23505' } });
    mocks.remove.mockRejectedValue(new EnrollmentAgreementError(503, 'UPLOAD_CLEANUP_UNAVAILABLE', 'Support required'));
    expect((await POST(uploadRequest())).status).toBe(503); expect(mocks.release).not.toHaveBeenCalled();
  });
  it('denies new reads and reviews once erasure has claimed the persistent fence', async () => {
    mocks.assertNotErasing.mockRejectedValue(new EnrollmentAgreementError(409, 'ACCOUNT_ERASURE_IN_PROGRESS', 'Erasing'));
    expect((await GET(new Request('https://portal.test/api/enrollment-agreements'))).status).toBe(409);
    expect(mocks.findSubmissions).not.toHaveBeenCalled();
    await expect(reviewAgreementSubmission(admin, { id: ID, action: 'verify', reviewNote: null, attestSignatures: true })).rejects.toMatchObject({ status: 409 });
    expect(mocks.acquire).not.toHaveBeenCalled();
  });
  it('does not stage a file when the schema or private storage is unavailable', async () => {
    mocks.countSubmissions.mockRejectedValue({ code: 'P2021' });
    expect((await POST(uploadRequest())).status).toBe(503); expect(mocks.store).not.toHaveBeenCalled();
    mocks.countSubmissions.mockResolvedValue(0); mocks.store.mockRejectedValue(new EnrollmentAgreementError(503, 'PRIVATE_STORAGE_UNAVAILABLE', 'Unavailable'));
    expect((await POST(uploadRequest())).status).toBe(503); expect(mocks.queryRaw).not.toHaveBeenCalled();
  });
  it('coverage is admin-only, tenant-filtered, active-member-only, bounded and paginated', async () => {
    expect((await COVERAGE(new Request('https://portal.test/api/enrollment-agreements/coverage'))).status).toBe(403);
    mocks.getUser.mockResolvedValue({ id: ADMIN }); mocks.getProfileRole.mockResolvedValue('admin');
    mocks.userCount.mockResolvedValueOnce(70).mockResolvedValueOnce(10).mockResolvedValueOnce(2).mockResolvedValueOnce(3);
    mocks.userFindMany.mockResolvedValue([{ id: MEMBER, fullName: 'Synthetic Student', enrollmentAgreementSubmissions: [] }]);
    const response = await COVERAGE(new Request('https://portal.test/api/enrollment-agreements/coverage?status=missing&page=2'));
    expect(await response.json()).toMatchObject({ page: 2, hasMore: false, total: 70, counts: { missing: 70, pending: 10, verified: 2, needs_correction: 3 }, rows: [{ status: 'missing' }] });
    expect(mocks.userFindMany).toHaveBeenCalledWith(expect.objectContaining({ take: 50, skip: 50, where: expect.objectContaining({ organizationId: ORG, deletedAt: null, profile: { is: { role: 'member' } }, userRoles: expect.any(Object) }) }));
  });
});
