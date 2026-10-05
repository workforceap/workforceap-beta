// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  user: vi.fn(), role: vi.fn(), org: vi.fn(), scope: vi.fn(), find: vi.fn(), list: vi.fn(), count: vi.fn(),
  bucket: vi.fn(), download: vi.fn(), audit: vi.fn(),
}));
vi.mock('@/lib/db/withRequestGuc', () => ({ withApiGuc: (handler: unknown) => handler }));
vi.mock('@/lib/auth/server', () => ({ getUser: mocks.user }));
vi.mock('@/lib/auth/roles', () => ({ getProfileRole: mocks.role }));
vi.mock('@/lib/tenant/organization', () => ({ getActorOrganizationId: mocks.org }));
vi.mock('@/lib/tenant/withTenantScope', () => ({ withTenantScope: mocks.scope }));
vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => ({ storage: {
  getBucket: mocks.bucket, from: () => ({ download: mocks.download }),
} }) }));
vi.mock('@/lib/audit', () => ({ auditLog: mocks.audit }));

import { GET as LIST } from '@/app/api/enrollment-agreements/archive/route';
import { GET as DOWNLOAD } from '@/app/api/enrollment-agreements/archive/[id]/download/route';
import { getAgreementArchive, getArchivedAgreementForRead } from '@/lib/enrollmentAgreements/archive';
import { agreementSha256 } from '@/lib/enrollmentAgreements/storage';

const ADMIN = '22222222-2222-4222-8222-222222222222';
const MEMBER = '11111111-1111-4111-8111-111111111111';
const ID = '44444444-4444-4444-8444-444444444444';
const ORG = '55555555-5555-4555-8555-555555555555';
const OTHER_ORG = '66666666-6666-4666-8666-666666666666';
const bytes = new Uint8Array(Buffer.from('%PDF-1.7\nretained synthetic agreement\n%%EOF'));
const actor = { id: ADMIN, role: 'admin', organizationId: ORG };
const row = () => ({
  id: ID, organizationId: ORG, memberId: null, member: null, subjectMemberId: MEMBER, subjectName: 'Synthetic Student',
  uploadedByUserId: null, uploadedBySubjectId: MEMBER, reviewedByUserId: null, reviewedBySubjectId: ADMIN,
  storagePath: `enrollment-agreements/${MEMBER}/${ID}.pdf`, sha256: agreementSha256(bytes), sizeBytes: bytes.length,
  status: 'verified', isCurrent: false, templateVersion: 'previous', reviewNote: 'Signatures reviewed',
  uploadedAt: new Date('2026-10-01T12:00:00Z'), reviewedAt: new Date('2026-10-01T12:30:00Z'),
});
const list = (query = '') => LIST(new Request(`https://portal.test/api/enrollment-agreements/archive${query}`));
const download = (id = ID) => DOWNLOAD(new Request(`https://portal.test/api/enrollment-agreements/archive/${id}/download`), { params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('ENROLLMENT_AGREEMENTS_ENABLED', 'false');
  vi.stubEnv('STAFF_MFA_ENFORCEMENT', '0');
  mocks.user.mockResolvedValue({ id: ADMIN }); mocks.role.mockResolvedValue('admin'); mocks.org.mockResolvedValue(ORG);
  mocks.scope.mockImplementation((_org, fn) => fn({ enrollmentAgreementSubmission: {
    findFirst: mocks.find, findMany: mocks.list, count: mocks.count,
  } }));
  mocks.find.mockImplementation(({ where }) => where.organizationId === ORG ? row() : null);
  mocks.list.mockResolvedValue([row()]); mocks.count.mockResolvedValue(1);
  mocks.bucket.mockResolvedValue({ data: { public: false }, error: null });
  mocks.download.mockResolvedValue({ data: new Blob([bytes]), error: null });
  mocks.audit.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllEnvs());

describe('restricted retained enrollment agreement archive', () => {
  it('lists retained historical revisions with collection disabled and without a User lookup', async () => {
    const response = await list();
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    const body = await response.json();
    expect(body).toMatchObject({ page: 1, total: 1, hasMore: false, rows: [{
      id: ID, subjectMemberId: MEMBER, subjectName: 'Synthetic Student', status: 'verified',
      isCurrent: false, retainedAfterAccountDeletion: true, downloadUrl: `/api/enrollment-agreements/archive/${ID}/download`,
    }] });
    expect(body.rows[0]).not.toHaveProperty('storagePath'); expect(body.rows[0]).not.toHaveProperty('sha256');
    expect(mocks.list).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: ORG }, take: 50, skip: 0 }));
  });
  it('keeps pending and correction revisions unverified and distinguishes active accounts', async () => {
    mocks.list.mockResolvedValue([
      { ...row(), status: 'pending', isCurrent: true, reviewedAt: null, reviewedBySubjectId: null },
      { ...row(), status: 'needs_correction', member: { deletedAt: null } },
      { ...row(), member: { deletedAt: new Date() } },
    ]);
    const body = await (await list()).json();
    expect(body.rows.map((value: { status: string }) => value.status)).toEqual(['pending', 'needs_correction', 'verified']);
    expect(body.rows.map((value: { retainedAfterAccountDeletion: boolean }) => value.retainedAfterAccountDeletion)).toEqual([true, false, true]);
  });
  it('searches only within tenant and uses bounded pagination for all revisions', async () => {
    mocks.count.mockResolvedValue(101);
    const body = await (await list('?query=Synthetic&page=2')).json();
    expect(body).toMatchObject({ page: 2, total: 101, hasMore: true });
    expect(mocks.scope).toHaveBeenCalledWith(ORG, expect.any(Function));
    const expectedWhere = { organizationId: ORG, OR: [{ subjectName: { contains: 'Synthetic', mode: 'insensitive' } }] };
    expect(mocks.count).toHaveBeenCalledWith({ where: expectedWhere });
    expect(mocks.list).toHaveBeenCalledWith(expect.objectContaining({ where: expectedWhere, take: 50, skip: 50 }));
    await list(`?query=${MEMBER}`);
    expect(mocks.list).toHaveBeenLastCalledWith(expect.objectContaining({ where: expect.objectContaining({ OR: expect.arrayContaining([{ subjectMemberId: MEMBER }]) }) }));
  });
  it.each(['?page=0', '?page=-1', '?page=100000', '?page=1x', `?query=${'a'.repeat(121)}`])('rejects invalid filter %s before data lookup', async (query) => {
    expect((await list(query)).status).toBe(400); expect(mocks.list).not.toHaveBeenCalled();
  });
  it('never presents database failure as an empty archive', async () => {
    mocks.count.mockRejectedValue({ code: 'P2021', message: 'private SQL diagnostics' });
    const response = await list();
    expect(response.status).toBe(503); expect(await response.text()).not.toMatch(/SQL|diagnostics/);
  });
  it.each(['member', 'counselor', 'case_manager', 'employer', 'partner'])('denies %s before search or document lookup even for their own record', async (role) => {
    mocks.role.mockResolvedValue(role); mocks.user.mockResolvedValue({ id: MEMBER });
    expect((await list()).status).toBe(403); expect((await download()).status).toBe(403);
    await expect(getArchivedAgreementForRead({ ...actor, role }, 'malformed')).rejects.toMatchObject({ status: 403 });
    await expect(getAgreementArchive({ ...actor, role }, '', 1)).rejects.toMatchObject({ status: 403 });
    expect(mocks.scope).not.toHaveBeenCalled(); expect(mocks.download).not.toHaveBeenCalled();
  });
  it('requires authentication independently of feature availability', async () => {
    mocks.user.mockResolvedValue(null);
    expect((await list()).status).toBe(401); expect((await download()).status).toBe(401);
    expect(mocks.org).not.toHaveBeenCalled(); expect(mocks.find).not.toHaveBeenCalled();
  });
  it.each(['admin', 'super_admin'])('denies cross-tenant %s with the same response as a missing record', async (role) => {
    mocks.role.mockResolvedValue(role); mocks.org.mockResolvedValue(OTHER_ORG);
    const response = await download();
    expect(response.status).toBe(404);
    expect(mocks.find).toHaveBeenCalledWith({ where: { id: ID, organizationId: OTHER_ORG } });
    expect(mocks.download).not.toHaveBeenCalled(); expect(mocks.audit).not.toHaveBeenCalled();
  });
  it('returns original detached-record bytes only after exact integrity validation and required audit', async () => {
    const response = await download();
    expect(response.status).toBe(200); expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(response.headers.get('content-disposition')).toContain('attachment;');
    expect(mocks.download).toHaveBeenCalledExactlyOnceWith(row().storagePath);
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({
      actorUserId: ADMIN, targetId: ID, action: 'enrollment_agreement_downloaded', metadata: { organizationId: ORG, memberId: MEMBER },
    }));
    expect(JSON.stringify(mocks.audit.mock.calls)).not.toMatch(/Synthetic Student|PDF|enrollment-agreements\//);
  });
  it('withholds bytes when required archive audit fails, including an admin reading their own retained record', async () => {
    mocks.user.mockResolvedValue({ id: MEMBER });
    mocks.audit.mockRejectedValue(new Error('private diagnostics'));
    const response = await download();
    expect(response.status).toBe(503); expect(await response.text()).not.toMatch(/PDF|diagnostics/);
    expect(mocks.audit).toHaveBeenCalled();
  });
  it.each(['hash', 'path', 'size', 'public bucket'])('fails closed on archive %s integrity failure', async (failure) => {
    const record = row();
    if (failure === 'hash') record.sha256 = '0'.repeat(64);
    if (failure === 'path') record.storagePath = `enrollment-agreements/${ADMIN}/${ID}.pdf`;
    if (failure === 'size') record.sizeBytes++;
    if (failure === 'public bucket') mocks.bucket.mockResolvedValue({ data: { public: true }, error: null });
    mocks.find.mockResolvedValue(record);
    const response = await download();
    expect(response.status).toBe(503); expect(await response.text()).not.toContain('%PDF');
    expect(mocks.audit).not.toHaveBeenCalled();
  });
});
