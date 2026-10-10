import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), { ...init, headers: { 'content-type': 'application/json' } }),
  },
}));
vi.mock('@/lib/db/withRequestGuc', () => ({ withApiGuc: (fn: unknown) => fn }));
vi.mock('@/lib/auth/server', () => ({ getUser: vi.fn() }));
vi.mock('@/lib/auth/roles', () => ({ isAdmin: vi.fn(async () => false) }));
vi.mock('@/lib/counselor/staffMemberAccess', () => ({ assertStaffCanAccessMemberRecord: vi.fn() }));
vi.mock('@/lib/audit', () => ({ auditLog: vi.fn(async () => {}) }));
vi.mock('@/lib/audit/log', () => ({ logAuditEvent: vi.fn(async () => {}), auditRequestMeta: () => ({}) }));

const tx = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), updateMany: vi.fn() },
  workflowDiagnostic: { create: vi.fn(async (_args: unknown) => ({ id: 'hist-1' })), delete: vi.fn(async (_args: unknown) => ({})) },
}));
vi.mock('@/lib/db/prisma', () => ({ prisma: { workflowDiagnostic: tx.workflowDiagnostic } }));
vi.mock('@/lib/tenant/organization', () => ({ getSubjectOrganizationId: vi.fn(async () => 'org-1') }));
vi.mock('@/lib/tenant/withTenantScope', () => ({
  withTenantScope: vi.fn(async (_org: string, fn: (db: unknown) => unknown) =>
    fn({ user: { findFirst: tx.user.findUnique, updateMany: tx.user.updateMany } })),
}));
vi.mock('@prisma/client', () => ({ Prisma: { JsonNull: 'JSON_NULL' } }));

import { POST } from '@/app/api/counselor/assessment-retake/route';
import { getUser } from '@/lib/auth/server';
import { assertStaffCanAccessMemberRecord } from '@/lib/counselor/staffMemberAccess';

const req = (body: unknown) => new Request('https://x.test/api/counselor/assessment-retake', { method: 'POST', body: JSON.stringify(body) });
const completed = {
  assessmentCompleted: true,
  assessmentScore: 26,
  assessmentScorePct: 27,
  assessmentCompletedAt: new Date('2026-10-09T14:30:49Z'),
  assessmentAnswers: { 1: 'A', 2: 'A' },
  programInterest: 'AI and Software Developer Professional Certificate (IBM)',
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getUser).mockResolvedValue({ id: 'staff-1' } as never);
  vi.mocked(assertStaffCanAccessMemberRecord).mockResolvedValue(true);
  tx.user.findUnique.mockResolvedValue(completed);
  tx.user.updateMany.mockResolvedValue({ count: 1 });
});

describe('POST /api/counselor/assessment-retake', () => {
  it('archives the previous result, then clears it so the member can retake', async () => {
    const res = await POST(req({ memberId: 'member-1', reason: 'clicked through' }) as never);
    expect(res.status).toBe(200);
    const archived = (tx.workflowDiagnostic.create.mock.calls as unknown as Array<[{ data: Record<string, any> }]>)[0]![0].data;
    expect(archived.workflow).toBe('member_assessment_history');
    expect(archived.entityId).toBe('member-1');
    expect(archived.metadata).toMatchObject({ previousScore: 26, previousScorePct: 27, previousAnswers: { 1: 'A', 2: 'A' }, allowedBy: 'staff-1', reason: 'clicked through' });
    const cleared = tx.user.updateMany.mock.calls[0][0];
    expect(cleared.where).toEqual({ id: 'member-1', assessmentCompleted: true });
    expect(cleared.data).toMatchObject({ assessmentCompleted: false, assessmentScore: null, assessmentScorePct: null, assessmentAnswers: 'JSON_NULL' });
    // archive is written before the result is cleared
    expect(tx.workflowDiagnostic.create.mock.invocationCallOrder[0]).toBeLessThan(tx.user.updateMany.mock.invocationCallOrder[0]);
  });

  it('refuses staff without access to the member', async () => {
    vi.mocked(assertStaffCanAccessMemberRecord).mockResolvedValue(false);
    const res = await POST(req({ memberId: 'member-1' }) as never);
    expect(res.status).toBe(403);
    expect(tx.user.updateMany).not.toHaveBeenCalled();
  });

  it('refuses a staff member resetting their own preassessment', async () => {
    const res = await POST(req({ memberId: 'staff-1' }) as never);
    expect(res.status).toBe(403);
  });

  it('requires sign-in and a member id', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(null as never);
    expect((await POST(req({ memberId: 'member-1' }) as never)).status).toBe(401);
    expect((await POST(req({}) as never)).status).toBe(400);
  });

  it('drops the extra history row if a second click already cleared the result', async () => {
    tx.user.updateMany.mockResolvedValue({ count: 0 });
    const res = await POST(req({ memberId: 'member-1' }) as never);
    expect(res.status).toBe(409);
    expect(tx.workflowDiagnostic.delete).toHaveBeenCalledWith({ where: { id: 'hist-1' } });
  });

  it('says so when there is nothing to retake', async () => {
    tx.user.findUnique.mockResolvedValue({ ...completed, assessmentCompleted: false });
    const res = await POST(req({ memberId: 'member-1' }) as never);
    expect(res.status).toBe(409);
    expect(tx.workflowDiagnostic.create).not.toHaveBeenCalled();
  });
});
