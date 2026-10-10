import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), { ...init, headers: { 'content-type': 'application/json' } }),
  },
}));
vi.mock('@/lib/db/withRequestGuc', () => ({ withApiGuc: (fn: unknown) => fn }));
vi.mock('@/lib/db/withDbRetry', () => ({ withDbRetry: (fn: () => Promise<unknown>) => fn() }));
vi.mock('@/lib/auth/server', () => ({ getUser: vi.fn() }));
vi.mock('@/lib/auth/roles', () => ({
  isAdmin: vi.fn(async () => true),
  getProfileRole: vi.fn(async () => 'admin'),
}));
vi.mock('@/lib/audit', () => ({ auditLog: vi.fn(async () => {}) }));
vi.mock('@/lib/audit/log', () => ({ logAuditEvent: vi.fn(async () => {}), auditRequestMeta: () => ({}) }));

const tx = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), updateMany: vi.fn() },
  workflowDiagnostic: {
    create: vi.fn(async (_args: unknown) => ({ id: 'hist-1' })),
    delete: vi.fn(async (_args: unknown) => ({})),
  },
}));
vi.mock('@/lib/db/prisma', () => ({ prisma: { workflowDiagnostic: tx.workflowDiagnostic } }));
vi.mock('@/lib/tenant/organization', () => ({
  getSubjectOrganizationId: vi.fn(async () => 'org-1'),
  getActorOrganizationId: vi.fn(async () => 'org-1'),
}));
vi.mock('@/lib/tenant/withTenantScope', () => ({
  withTenantScope: vi.fn(async (_org: string, fn: (db: unknown) => unknown) =>
    fn({ user: { findFirst: tx.user.findUnique, updateMany: tx.user.updateMany } })),
}));
vi.mock('@prisma/client', () => ({ Prisma: { JsonNull: 'JSON_NULL' } }));

import { POST } from '@/app/api/admin/members/[id]/reset-assessment/route';
import { getUser } from '@/lib/auth/server';
import { isAdmin } from '@/lib/auth/roles';
import { getSubjectOrganizationId } from '@/lib/tenant/organization';

const MEMBER_ID = '550e8400-e29b-41d4-a716-446655440099';
const ADMIN_ID = '550e8400-e29b-41d4-a716-446655440002';

const params = (id: string) => ({ params: Promise.resolve({ id }) });
const req = () => new Request(`https://x.test/api/admin/members/${MEMBER_ID}/reset-assessment`, { method: 'POST' });

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
  vi.mocked(getUser).mockResolvedValue({ id: ADMIN_ID } as never);
  vi.mocked(isAdmin).mockResolvedValue(true);
  vi.mocked(getSubjectOrganizationId).mockResolvedValue('org-1');
  tx.user.findUnique.mockResolvedValue(completed);
  tx.user.updateMany.mockResolvedValue({ count: 1 });
});

describe('POST /api/admin/members/[id]/reset-assessment', () => {
  it('archives the previous result, then clears it (ops 10/9: used to delete the score)', async () => {
    const res = await POST(req() as never, params(MEMBER_ID));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    const archived = (tx.workflowDiagnostic.create.mock.calls as unknown as Array<[{ data: Record<string, unknown> }]>)[0]![0].data;
    expect(archived.workflow).toBe('member_assessment_history');
    expect(archived.entityId).toBe(MEMBER_ID);
    expect(archived.method).toBe('admin_allowed_retake');
    expect(archived.metadata).toMatchObject({
      previousScore: 26,
      previousScorePct: 27,
      previousAnswers: { 1: 'A', 2: 'A' },
      allowedBy: ADMIN_ID,
      allowedByRole: 'admin',
    });

    const cleared = tx.user.updateMany.mock.calls[0][0];
    expect(cleared.where).toEqual({ id: MEMBER_ID, assessmentCompleted: true });
    expect(cleared.data).toMatchObject({
      assessmentCompleted: false,
      assessmentScore: null,
      assessmentScorePct: null,
      assessmentAnswers: 'JSON_NULL',
    });
    expect(tx.workflowDiagnostic.create.mock.invocationCallOrder[0]).toBeLessThan(
      tx.user.updateMany.mock.invocationCallOrder[0],
    );
  });

  it('refuses a non-admin without touching history or the score', async () => {
    vi.mocked(isAdmin).mockResolvedValue(false);
    const res = await POST(req() as never, params(MEMBER_ID));
    expect(res.status).toBe(403);
    expect(tx.workflowDiagnostic.create).not.toHaveBeenCalled();
    expect(tx.user.updateMany).not.toHaveBeenCalled();
  });

  it('requires sign-in', async () => {
    vi.mocked(getUser).mockResolvedValue(null as never);
    const res = await POST(req() as never, params(MEMBER_ID));
    expect(res.status).toBe(401);
    expect(tx.user.updateMany).not.toHaveBeenCalled();
  });

  it('returns 404 when the member is not in a tenant', async () => {
    vi.mocked(getSubjectOrganizationId).mockRejectedValueOnce(new Error('no org'));
    const res = await POST(req() as never, params(MEMBER_ID));
    expect(res.status).toBe(404);
    expect(tx.workflowDiagnostic.create).not.toHaveBeenCalled();
  });

  it('returns 409 when there is nothing to retake', async () => {
    tx.user.findUnique.mockResolvedValue({ ...completed, assessmentCompleted: false });
    const res = await POST(req() as never, params(MEMBER_ID));
    expect(res.status).toBe(409);
    expect(tx.workflowDiagnostic.create).not.toHaveBeenCalled();
  });

  it('drops the extra history row if a second click already cleared the result', async () => {
    tx.user.updateMany.mockResolvedValue({ count: 0 });
    const res = await POST(req() as never, params(MEMBER_ID));
    expect(res.status).toBe(409);
    expect(tx.workflowDiagnostic.delete).toHaveBeenCalledWith({ where: { id: 'hist-1' } });
  });
});
