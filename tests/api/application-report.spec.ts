// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { applicationReportFixture } from '../fixtures/applicationReport';

const h = vi.hoisted(() => ({ auth: vi.fn(), actor: vi.fn(), access: vi.fn(), member: vi.fn(), application: vi.fn(), update: vi.fn(), audit: vi.fn(), render: vi.fn() }));
vi.mock('@/lib/auth/server', () => ({ getUser: h.actor }));
vi.mock('@/lib/auth/roles', () => ({ requireAdminOrCounselor: h.auth }));
vi.mock('@/lib/tenant/organization', () => ({ getActorOrganizationId: async () => 'org-A' }));
vi.mock('@/lib/counselor/staffMemberAccess', () => ({ assertStaffCanAccessMemberRecord: h.access }));
vi.mock('@/lib/tenant/withTenantScope', () => ({ withTenantScope: async (_org: string, fn: (db: unknown) => Promise<unknown>) => fn({ user: { findFirst: h.member }, application: { findFirst: h.application, updateMany: h.update } }) }));
vi.mock('@/lib/db/withRequestGuc', () => ({ withApiGuc: (fn: unknown) => fn }));
vi.mock('@/lib/audit', () => ({ auditLog: h.audit }));
vi.mock('@/lib/apply/applicationReportFile', () => ({ applicationReportFile: h.render }));
import { GET, POST } from '@/app/api/admin/members/[id]/applications/[applicationId]/report/route';

const context = (id = 'member-A', applicationId = 'app-A') => ({ params: Promise.resolve({ id, applicationId }) });
const request = new NextRequest('https://example.test/api/admin/members/member-A/applications/app-A/report');
beforeEach(() => {
  vi.resetAllMocks();
  h.auth.mockResolvedValue({ ok: true }); h.actor.mockResolvedValue({ id: 'staff-A' }); h.access.mockResolvedValue(true);
  h.member.mockImplementation(async ({ where }) => where.id === 'member-A' && where.organizationId === 'org-A' && where.deletedAt === null ? { id: 'member-A' } : null);
  h.application.mockImplementation(async ({ where }) => where.id === 'app-A' && where.userId === 'member-A' && where.user.organizationId === 'org-A' && where.user.deletedAt === null ? { applicationReportSnapshot: applicationReportFixture() } : null);
  h.render.mockResolvedValue({ content: Buffer.from('%PDF-synthetic'), contentType: 'application/pdf', filename: 'application-app-A.pdf' });
  h.audit.mockResolvedValue(undefined);
});
describe('staff application report access', () => {
  it('requires authentication and does not load data when rejected', async () => {
    h.auth.mockResolvedValue({ ok: false, error: 'Unauthorized', status: 401 });
    expect((await GET(request, context())).status).toBe(401); expect(h.member).not.toHaveBeenCalled();
  });
  it('rejects another tenant member, another member application and unassigned counselors', async () => {
    expect((await POST(request, context('member-B'))).status).toBe(404);
    expect((await POST(request, context('member-A', 'app-B'))).status).toBe(404);
    h.access.mockResolvedValue(false);
    expect((await GET(request, context())).status).toBe(403);
    expect(h.render).not.toHaveBeenCalled(); expect(h.update).not.toHaveBeenCalled();
  });
  it('downloads the saved report without replacing it and audits access without answers', async () => {
    const response = await POST(request, context());
    expect(response.status).toBe(200); expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(response.headers.get('Content-Disposition')).toContain('application-app-A.pdf');
    expect(h.render).toHaveBeenCalledWith(applicationReportFixture(), 'app-A'); expect(h.update).not.toHaveBeenCalled();
    expect(h.audit).toHaveBeenCalledWith(expect.objectContaining({ actorUserId: 'staff-A', action: 'download_application_report', targetId: 'app-A', metadata: { organizationId: 'org-A', memberId: 'member-A', recovered: false, format: 'application/pdf' } }));
    expect(JSON.stringify(h.audit.mock.calls)).not.toContain('Example Company');
  });
  it('never creates a missing snapshot on GET', async () => {
    h.application.mockResolvedValue({ applicationReportSnapshot: null });
    expect((await GET(request, context())).status).toBe(409); expect(h.update).not.toHaveBeenCalled();
  });
  it('explicitly captures an older record, then renders the durable winner of concurrent capture', async () => {
    const winner = applicationReportFixture();
    h.application.mockResolvedValueOnce({ applicationReportSnapshot: null, submittedAt: null, programInterest: 'Original choice', notes: 'County: Travis\nStaff secret: never include', user: { fullName: 'Updated name', email: 'updated@example.test', profile: null, applyEligibilityScreenings: [] } }).mockResolvedValueOnce({ applicationReportSnapshot: winner });
    h.update.mockResolvedValue({ count: 0 });
    expect((await POST(request, context())).status).toBe(200);
    const saved = h.update.mock.calls[0][0];
    expect(saved.where).toMatchObject({ id: 'app-A', userId: 'member-A', applicationReportSnapshot: { equals: expect.anything() } });
    expect(saved.data.applicationReportSnapshot.source).toBe('recovered_record');
    expect(JSON.stringify(saved.data)).toContain('Original choice'); expect(JSON.stringify(saved.data)).not.toContain('never include');
    expect(h.render).toHaveBeenCalledWith(winner, 'app-A');
  });
  it('does not overwrite a corrupt stored snapshot or expose its content in errors', async () => {
    h.application.mockResolvedValue({ applicationReportSnapshot: { private: 'do not expose' } });
    const response = await POST(request, context());
    expect(response.status).toBe(500); expect(await response.text()).not.toContain('do not expose'); expect(h.update).not.toHaveBeenCalled();
  });
  it('does not load data when the session disappears after the role check', async () => {
    h.actor.mockResolvedValue(null);
    expect((await POST(request, context())).status).toBe(401);
    expect(h.member).not.toHaveBeenCalled(); expect(h.application).not.toHaveBeenCalled();
  });
  it('does not load an application for a missing or deleted member', async () => {
    h.member.mockResolvedValue(null);
    expect((await POST(request, context())).status).toBe(404);
    expect(h.application).not.toHaveBeenCalled();
  });
  it('reads only same-org screening when recovering an older record', async () => {
    h.application.mockResolvedValue({ applicationReportSnapshot: null, submittedAt: null, programInterest: 'Training', notes: null, user: { fullName: 'Ada', email: 'ada@example.test', profile: null, applyEligibilityScreenings: [] } });
    h.update.mockResolvedValue({ count: 0 });
    await POST(request, context());
    expect(h.application.mock.calls[0][0].select.user.select.applyEligibilityScreenings.where).toEqual({ organizationId: 'org-A' });
  });
  it('recovers a school collection without adult screening or staff notes', async () => {
    const adultScreening = { q1: 'yes', layoffCompany: 'Must not appear', organizationId: 'org-A' };
    h.application.mockResolvedValueOnce({
      applicationReportSnapshot: null, submittedAt: null, programInterest: 'Training',
      notes: 'Collection: high-school student (no employment or income screening)\nCounty: Travis\nStaff secret: never include',
      user: { fullName: 'Student', email: 'student@example.test', profile: { gradeLevel: '11', barrierTypes: ['high_school_student'] }, applyEligibilityScreenings: [adultScreening] },
    }).mockResolvedValueOnce({ applicationReportSnapshot: applicationReportFixture() });
    h.update.mockResolvedValue({ count: 0 });
    expect((await POST(request, context())).status).toBe(200);
    const saved = JSON.stringify(h.update.mock.calls[0][0].data.applicationReportSnapshot);
    expect(saved).toContain('Travis'); expect(saved).toContain('School & guardian');
    expect(saved).not.toContain('Must not appear'); expect(saved).not.toContain('never include');
    expect(saved).not.toContain('Unemployed / underemployed');
  });
  it('treats a leftover grade level as school collection even without the notes banner', async () => {
    h.application.mockResolvedValueOnce({
      applicationReportSnapshot: null, submittedAt: null, programInterest: 'Training', notes: 'County: Travis',
      user: { fullName: 'Student', email: 'student@example.test', profile: { gradeLevel: '12' }, applyEligibilityScreenings: [{ layoffCompany: 'Must not appear' }] },
    }).mockResolvedValueOnce({ applicationReportSnapshot: applicationReportFixture() });
    h.update.mockResolvedValue({ count: 0 });
    await POST(request, context());
    expect(JSON.stringify(h.update.mock.calls[0][0].data)).not.toContain('Must not appear');
  });
  it('recovers adult screening for a non-school record', async () => {
    h.application.mockResolvedValueOnce({
      applicationReportSnapshot: null, submittedAt: null, programInterest: 'Training', notes: 'County: Travis',
      user: { fullName: 'Ada', email: 'ada@example.test', profile: null, applyEligibilityScreenings: [{ q1: 'yes', layoffCompany: 'Example Plant' }] },
    }).mockResolvedValueOnce({ applicationReportSnapshot: applicationReportFixture() });
    h.update.mockResolvedValue({ count: 0 });
    await POST(request, context());
    expect(JSON.stringify(h.update.mock.calls[0][0].data)).toContain('Example Plant');
  });
  it('fails closed when a concurrent recovery leaves no durable snapshot', async () => {
    h.application.mockResolvedValue({ applicationReportSnapshot: null, submittedAt: null, programInterest: 'Training', notes: null, user: { fullName: 'Ada', email: 'ada@example.test', profile: null, applyEligibilityScreenings: [] } });
    h.update.mockResolvedValue({ count: 0 });
    const response = await POST(request, context());
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain('ada@example.test');
    expect(h.render).not.toHaveBeenCalled();
  });
  it('marks the download as private, nosniff, and sandboxed', async () => {
    const response = await GET(request, context());
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(response.headers.get('Content-Security-Policy')).toBe("sandbox; default-src 'none'; style-src 'unsafe-inline'");
  });
});
