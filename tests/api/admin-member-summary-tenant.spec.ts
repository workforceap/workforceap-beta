// @vitest-environment node
/**
 * POST /api/admin/members/[id]/summary feeds member PII to the model.
 * 401/403/429 and the unconfigured-AI 200 happen before lookup. Org
 * admins findUnique with organizationId; super-admins omit it. Deleted
 * members 404. Pin the current AI-unconfigured skip (no lookup) rather
 * than "fixing" it to 503.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  isAdmin: vi.fn(),
  isSuperAdmin: vi.fn(),
  getActorOrganizationId: vi.fn(),
  isAIConfigured: vi.fn(),
  checkAIToolRateLimit: vi.fn(),
  chatCompletion: vi.fn(),
  findUnique: vi.fn(),
  loadMemberProgramTrainingView: vi.fn(),
}));

vi.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), {
        ...init,
        headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
      }),
  },
}));

vi.mock('@/lib/db/withRequestGuc', () => ({
  withApiGuc: (handler: unknown) => handler,
}));

vi.mock('@/lib/auth/server', () => ({
  resolveAuthGucContext: vi.fn(),
  getUser: h.getUser,
}));

vi.mock('@/lib/auth/roles', () => ({
  isAdmin: h.isAdmin,
  isSuperAdmin: h.isSuperAdmin,
}));

vi.mock('@/lib/tenant/organization', () => ({
  getActorOrganizationId: h.getActorOrganizationId,
}));

vi.mock('@/lib/rate-limit', () => ({
  checkAIToolRateLimit: h.checkAIToolRateLimit,
}));

vi.mock('@/lib/ai/groq', () => ({
  isAIConfigured: h.isAIConfigured,
  chatCompletion: h.chatCompletion,
}));

vi.mock('@/lib/audit', () => ({ auditLog: vi.fn(async () => undefined) }));
vi.mock('@/lib/audit/log', () => ({ logAuditEvent: vi.fn(async () => undefined) }));

vi.mock('@/lib/member/memberProgramTrainingView', () => ({
  loadMemberProgramTrainingView: h.loadMemberProgramTrainingView,
}));

vi.mock('@/lib/db/prisma', () => {
  const prisma = {
    user: { findUnique: h.findUnique },
    $transaction: vi.fn(async (fn: (tx: { user: { findUnique: typeof h.findUnique } }) => unknown) =>
      fn({ user: { findUnique: h.findUnique } })),
  };
  return { prisma };
});

const { POST } = await import('@/app/api/admin/members/[id]/summary/route');

const ADMIN_ID = '550e8400-e29b-41d4-a716-446655440001';
const ORG_ID = '550e8400-e29b-41d4-a716-446655440002';
const MEMBER_ID = '550e8400-e29b-41d4-a716-446655440033';

function call(id = MEMBER_ID) {
  return POST(new Request(`http://localhost/api/admin/members/${id}/summary`, { method: 'POST' }) as never, {
    params: Promise.resolve({ id }),
  });
}

const memberRow = {
  fullName: 'Pat Lee',
  email: 'pat@example.test',
  deletedAt: null,
  enrolledProgram: null,
  enrolledAt: null,
  assessmentCompleted: false,
  assessmentScorePct: null,
  wioaReviewStatus: null,
  profile: null,
  courseEnrollments: [],
  courseProgress: [],
  placementRecord: null,
};

describe('POST /api/admin/members/[id]/summary tenant and AI gates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: ADMIN_ID });
    h.isAdmin.mockResolvedValue(true);
    h.isSuperAdmin.mockResolvedValue(false);
    h.getActorOrganizationId.mockResolvedValue(ORG_ID);
    h.isAIConfigured.mockReturnValue(true);
    h.checkAIToolRateLimit.mockResolvedValue({ success: true });
    h.chatCompletion.mockResolvedValue('ok');
    h.findUnique.mockResolvedValue(memberRow);
    h.loadMemberProgramTrainingView.mockResolvedValue(null);
  });

  it('returns 401 before lookup when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await call();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
    expect(h.isAdmin).not.toHaveBeenCalled();
    expect(h.findUnique).not.toHaveBeenCalled();
  });

  it('returns 403 before lookup when the caller is not an admin', async () => {
    h.isAdmin.mockResolvedValue(false);
    const res = await call();
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden: admin access required' });
    expect(h.isAIConfigured).not.toHaveBeenCalled();
    expect(h.findUnique).not.toHaveBeenCalled();
  });

  it('answers 200 Summary unavailable without lookup when AI is unconfigured', async () => {
    h.isAIConfigured.mockReturnValue(false);
    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ summary: 'Summary unavailable, try again.' });
    expect(h.checkAIToolRateLimit).not.toHaveBeenCalled();
    expect(h.getActorOrganizationId).not.toHaveBeenCalled();
    expect(h.findUnique).not.toHaveBeenCalled();
    expect(h.chatCompletion).not.toHaveBeenCalled();
  });

  it('returns 429 before lookup when the AI rate limit refuses', async () => {
    h.checkAIToolRateLimit.mockResolvedValue({ success: false });
    const res = await call();
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: 'Rate limit exceeded. Please try again later.' });
    expect(h.findUnique).not.toHaveBeenCalled();
    expect(h.chatCompletion).not.toHaveBeenCalled();
  });

  it('findUnique stamps organizationId for an org admin and omits it for a super-admin', async () => {
    const orgAdmin = await call();
    expect(orgAdmin.status).toBe(200);
    expect(h.getActorOrganizationId).toHaveBeenCalledWith(ADMIN_ID);
    expect(h.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: MEMBER_ID, organizationId: ORG_ID },
      }),
    );

    h.findUnique.mockClear();
    h.getActorOrganizationId.mockClear();
    h.isSuperAdmin.mockResolvedValue(true);
    const superAdmin = await call();
    expect(superAdmin.status).toBe(200);
    expect(h.getActorOrganizationId).not.toHaveBeenCalled();
    expect(h.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: MEMBER_ID },
      }),
    );
    expect(h.findUnique.mock.calls[0][0].where).not.toHaveProperty('organizationId');
  });

  it('404s a missing or deleted member without calling the model', async () => {
    h.findUnique.mockResolvedValueOnce(null);
    const missing = await call();
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: 'Member not found' });
    expect(h.chatCompletion).not.toHaveBeenCalled();

    h.findUnique.mockResolvedValueOnce({ ...memberRow, deletedAt: new Date('2026-11-01T00:00:00.000Z') });
    const deleted = await call();
    expect(deleted.status).toBe(404);
    expect(h.chatCompletion).not.toHaveBeenCalled();
  });

  it('returns 500 Summary unavailable when actor-org resolution throws', async () => {
    h.getActorOrganizationId.mockRejectedValue(new Error('org down'));
    const res = await call();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ summary: 'Summary unavailable, try again.' });
    expect(h.findUnique).not.toHaveBeenCalled();
  });
});
