/**
 * Counselor approvals (Mike, 2026-09-19): counselors may mark a member's WIOA
 * intake verified / not verified for members assigned to them. They may not
 * record `not_eligible` — the eligibility determination belongs to the
 * workforce board. Admin path unchanged; members still 403.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), {
        ...init,
        headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
      }),
  },
}));
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({ get: vi.fn(), getAll: vi.fn(() => []), set: vi.fn() })),
}));
vi.mock('@/lib/auth/server', () => ({
  getUser: vi.fn(),
  resolveAuthGucContext: vi.fn(() => Promise.resolve({ role: 'authenticated', userId: 'test-user' })),
}));
vi.mock('@/lib/auth/roles', () => ({
  isAdmin: vi.fn(() => Promise.resolve(false)),
  isSuperAdmin: vi.fn(() => Promise.resolve(false)),
  isCounselor: vi.fn(() => Promise.resolve(false)),
}));
vi.mock('@/lib/counselor/staffMemberAccess', () => ({
  assertStaffCanAccessMemberRecord: vi.fn(() => Promise.resolve(false)),
}));
vi.mock('@/lib/tenant/organization', () => ({
  getActorOrganizationId: vi.fn(() => Promise.resolve('org-1')),
}));
vi.mock('@/lib/tenant/withTenantScope', () => ({
  withTenantScope: vi.fn(async (_orgId: string | null, fn: (db: unknown) => Promise<unknown>) => {
    const { prisma } = await import('@/lib/db/prisma');
    return fn(prisma);
  }),
}));
vi.mock('@/lib/wioa/reviewSnapshot', () => ({
  recordWioaReviewSnapshot: vi.fn(() => Promise.resolve()),
}));
vi.mock('@/lib/audit/log', () => ({
  auditRequestMeta: vi.fn(() => ({ ip: 'test' })),
  logAuditEvent: vi.fn(() => Promise.resolve()),
}));
vi.mock('@/lib/audit', () => ({ auditLog: vi.fn(() => Promise.resolve()) }));
vi.mock('@/lib/db/transactionPolicy', () => ({ interactiveTransactionsGuaranteed: vi.fn(() => true) }));
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    $queryRaw: vi.fn(async () => [{ id: 'member' }]),
    counselorAssignment: { findFirst: vi.fn(async () => ({ id: 'assignment' })) },
    user: {
      findFirst: vi.fn(),
      updateMany: vi.fn(() => Promise.resolve({ count: 1 })),
    },
    $transaction: vi.fn(async (callback) => {
      const { prisma } = await import('@/lib/db/prisma');
      return callback(prisma);
    }),
  },
}));

import { interactiveTransactionsGuaranteed } from '@/lib/db/transactionPolicy';
import { PATCH } from '@/app/api/admin/members/[id]/wioa-review/route';
import { getUser } from '@/lib/auth/server';
import { isAdmin, isCounselor, isSuperAdmin } from '@/lib/auth/roles';
import { assertStaffCanAccessMemberRecord } from '@/lib/counselor/staffMemberAccess';
import { logAuditEvent } from '@/lib/audit/log';
import { recordWioaReviewSnapshot } from '@/lib/wioa/reviewSnapshot';
import { prisma } from '@/lib/db/prisma';

const COUNSELOR = 'c0c0c0c0-0000-4000-8000-000000000001';
const ADMIN = 'a0a0a0a0-0000-4000-8000-000000000001';
const MEMBER_IN_SCOPE = 'f5636f0b-da40-43fe-9ed9-21db789ca076';
const MEMBER_OUT_OF_SCOPE = 'f5636f0b-da40-43fe-9ed9-21db789ca099';
const screening = {
  version: 1, signal: 'likely', reasons: [], submittedAt: '2026-09-01T00:00:00Z',
  answers: {
    ageBracket: '25_54', countyOrZip: '30301', primaryBarrier: 'none',
    dislocatedWorker: false, lowIncomeSelfReport: false,
    trainingInterest: true, completedIntakeSelfReport: true,
  },
};

const req = (memberId: string, body: Record<string, unknown>, includeRevision = true) =>
  new Request(`http://localhost/api/admin/members/${memberId}/wioa-review`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(includeRevision ? { expectedSubmittedAt: screening.submittedAt, expectedReviewedAt: null, ...body } : body),
  }) as any;
const paramsFor = (id: string) => ({ params: Promise.resolve({ id }) });

function asCounselor() {
  vi.mocked(getUser).mockResolvedValue({ id: COUNSELOR } as never);
  vi.mocked(isAdmin).mockResolvedValue(false);
  vi.mocked(isSuperAdmin).mockResolvedValue(false);
  vi.mocked(isCounselor).mockResolvedValue(true);
  vi.mocked(assertStaffCanAccessMemberRecord).mockImplementation(async (_staffId, memberId) => memberId === MEMBER_IN_SCOPE);
}

function asAdmin() {
  vi.mocked(getUser).mockResolvedValue({ id: ADMIN } as never);
  vi.mocked(isAdmin).mockResolvedValue(true);
  vi.mocked(isSuperAdmin).mockResolvedValue(false);
  vi.mocked(isCounselor).mockResolvedValue(false);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(interactiveTransactionsGuaranteed).mockReturnValue(true);
  vi.mocked(prisma.$queryRaw).mockResolvedValue([{ id: MEMBER_IN_SCOPE }]);
  vi.mocked(prisma.counselorAssignment.findFirst).mockResolvedValue({ id: 'assignment' } as never);
  vi.mocked(recordWioaReviewSnapshot).mockResolvedValue();
  vi.mocked(prisma.user.updateMany).mockResolvedValue({ count: 1 });
  vi.mocked(prisma.user.findFirst).mockImplementation((async (args: any) => ({
    id: args?.where?.id,
    wioaReviewStatus: 'pending', wioaReviewNotes: null, wioaReviewedAt: null,
    wioaQualificationJson: screening,
  })) as never);
});

describe('PATCH /api/admin/members/[id]/wioa-review — counselor intake verification', () => {
  it('lets an assigned counselor mark intake verified for a member in their caseload', async () => {
    asCounselor();
    const res = await PATCH(req(MEMBER_IN_SCOPE, { status: 'verified', notes: 'Intake complete, documents on file' }), paramsFor(MEMBER_IN_SCOPE));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.wioaReviewStatus).toBe('verified');
    expect(body.wioaReviewedByUserId).toBe(COUNSELOR);
    expect(assertStaffCanAccessMemberRecord).toHaveBeenCalledWith(COUNSELOR, MEMBER_IN_SCOPE);
    expect(prisma.user.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: MEMBER_IN_SCOPE, organizationId: 'org-1', deletedAt: null }),
        data: expect.objectContaining({ wioaReviewStatus: 'verified', wioaReviewedByUserId: COUNSELOR }),
      }),
    );
    expect(recordWioaReviewSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ userId: MEMBER_IN_SCOPE, decision: 'verified', actorUserId: COUNSELOR, source: 'wioa_review' }),
      prisma,
    );
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ user: { id: COUNSELOR, role: 'counselor' }, verb: 'wioa_review' }),
    );
  });

  it('lets a counselor set intake back to not-yet-verified (pending)', async () => {
    asCounselor();
    const res = await PATCH(req(MEMBER_IN_SCOPE, { status: 'pending' }), paramsFor(MEMBER_IN_SCOPE));
    expect(res.status).toBe(200);
    expect(prisma.user.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ wioaReviewStatus: 'pending' }) }),
    );
  });

  it('refuses a counselor acting on a member outside their caseload (404, nothing changed)', async () => {
    asCounselor();
    const res = await PATCH(req(MEMBER_OUT_OF_SCOPE, { status: 'verified' }), paramsFor(MEMBER_OUT_OF_SCOPE));
    expect(res.status).toBe(404);
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
    expect(recordWioaReviewSnapshot).not.toHaveBeenCalled();
  });

  it('does not let a counselor record an eligibility determination (not_eligible)', async () => {
    asCounselor();
    const res = await PATCH(req(MEMBER_IN_SCOPE, { status: 'not_eligible' }), paramsFor(MEMBER_IN_SCOPE));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/workforce board/i);
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });

  it('still returns 403 for a plain member', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'member-user' } as never);
    vi.mocked(isAdmin).mockResolvedValue(false);
    vi.mocked(isSuperAdmin).mockResolvedValue(false);
    vi.mocked(isCounselor).mockResolvedValue(false);
    const res = await PATCH(req(MEMBER_IN_SCOPE, { status: 'verified' }), paramsFor(MEMBER_IN_SCOPE));
    expect(res.status).toBe(403);
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });

  it('requires a written reason before an admin records not_eligible (WAP-184 G-3)', async () => {
    asAdmin();
    for (const notes of [undefined, null, '', '   ']) {
      const res = await PATCH(req(MEMBER_IN_SCOPE, { status: 'not_eligible', notes }), paramsFor(MEMBER_IN_SCOPE));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/written reason/i);
    }
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
    expect(recordWioaReviewSnapshot).not.toHaveBeenCalled();
    const ok = await PATCH(req(MEMBER_IN_SCOPE, { status: 'not_eligible', notes: 'Not a dislocated worker; referred to AJC.' }), paramsFor(MEMBER_IN_SCOPE));
    expect(ok.status).toBe(200);
    expect(recordWioaReviewSnapshot).toHaveBeenCalledWith(expect.objectContaining({ decision: 'not_eligible', notes: 'Not a dislocated worker; referred to AJC.' }), expect.anything());
  });
  it('keeps the admin path unchanged (org-scoped, any status, no caseload check)', async () => {
    asAdmin();
    const res = await PATCH(req(MEMBER_OUT_OF_SCOPE, { status: 'not_eligible', notes: 'Board said no' }), paramsFor(MEMBER_OUT_OF_SCOPE));
    expect(res.status).toBe(200);
    expect(assertStaffCanAccessMemberRecord).not.toHaveBeenCalled();
    expect(prisma.user.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ wioaReviewStatus: 'not_eligible', wioaReviewedByUserId: ADMIN }) }),
    );
    expect(logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ user: { id: ADMIN, role: 'admin' } }));
  });

  it('does not acknowledge a review when its evidence fails', async () => {
    asCounselor();
    vi.mocked(recordWioaReviewSnapshot).mockRejectedValueOnce(new Error('snapshot unavailable'));
    const res = await PATCH(req(MEMBER_IN_SCOPE, { status: 'verified' }), paramsFor(MEMBER_IN_SCOPE));
    expect(res.status).toBe(500);
    expect(logAuditEvent).not.toHaveBeenCalled();
    expect(prisma.$transaction).toHaveBeenCalledOnce();
  });

  it('returns a conflict when the scoped member changed and records no evidence', async () => {
    asCounselor();
    vi.mocked(prisma.user.updateMany).mockResolvedValueOnce({ count: 0 });
    const res = await PATCH(req(MEMBER_IN_SCOPE, { status: 'verified' }), paramsFor(MEMBER_IN_SCOPE));
    expect(res.status).toBe(409);
    expect(recordWioaReviewSnapshot).not.toHaveBeenCalled();
  });
});


it('rejects changed screening answers even if both submissions are pending with no notes', async () => {
  asCounselor();
  const previous = screening;
  const resubmitted = { ...screening, answers: { ...screening.answers, lowIncomeSelfReport: true }, submittedAt: '2026-09-19T00:00:00Z' };
  let currentAnswers = previous;
  vi.mocked(prisma.user.findFirst).mockResolvedValueOnce({ id: MEMBER_IN_SCOPE, wioaQualificationJson: previous, wioaReviewStatus: 'pending', wioaReviewNotes: null, wioaReviewedAt: null } as never);
  vi.mocked(prisma.$queryRaw).mockImplementationOnce((async () => {
    currentAnswers = resubmitted;
    return [{ id: MEMBER_IN_SCOPE }];
  }) as typeof prisma.$queryRaw);
  vi.mocked(prisma.user.updateMany).mockImplementationOnce((async (args) => {
    const captured = (args.where?.wioaQualificationJson as { equals: unknown }).equals;
    return { count: JSON.stringify(captured) === JSON.stringify(currentAnswers) ? 1 : 0 };
  }) as typeof prisma.user.updateMany);
  const response = await PATCH(req(MEMBER_IN_SCOPE, { status: 'verified' }), paramsFor(MEMBER_IN_SCOPE));
  expect(response.status).toBe(409);
  expect(prisma.user.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ wioaQualificationJson: { equals: previous }, wioaReviewedAt: null }) }));
  expect(recordWioaReviewSnapshot).not.toHaveBeenCalled();
  expect(logAuditEvent).not.toHaveBeenCalled();
});

it('rechecks counselor assignment after locking instead of trusting the preflight', async () => {
  asCounselor();
  vi.mocked(prisma.counselorAssignment.findFirst).mockResolvedValueOnce(null);
  const response = await PATCH(req(MEMBER_IN_SCOPE, { status: 'verified' }), paramsFor(MEMBER_IN_SCOPE));
  expect(response.status).toBe(404);
  expect(prisma.user.updateMany).not.toHaveBeenCalled();
  expect(recordWioaReviewSnapshot).not.toHaveBeenCalled();
});

it('returns 503 without writes when real transactions are unavailable', async () => {
  asCounselor();
  vi.mocked(interactiveTransactionsGuaranteed).mockReturnValueOnce(false);
  const response = await PATCH(req(MEMBER_IN_SCOPE, { status: 'verified' }), paramsFor(MEMBER_IN_SCOPE));
  expect(response.status).toBe(503);
  expect(prisma.$transaction).not.toHaveBeenCalled();
});

describe('loaded review revisions', () => {
  it.each(['counselor', 'admin'])('rejects a stale %s panel when a new screening was saved before the request', async (role) => {
    if (role === 'counselor') asCounselor(); else asAdmin();
    vi.mocked(prisma.user.findFirst).mockResolvedValueOnce({
      id: MEMBER_IN_SCOPE, wioaReviewStatus: 'pending', wioaReviewNotes: null, wioaReviewedAt: null,
      wioaQualificationJson: { ...screening, submittedAt: '2026-09-19T12:00:00Z' },
    } as never);
    const response = await PATCH(req(MEMBER_IN_SCOPE, { status: 'verified' }), paramsFor(MEMBER_IN_SCOPE));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: expect.stringContaining('Reload and review') });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(recordWioaReviewSnapshot).not.toHaveBeenCalled();
  });

  it.each([
    { expectedSubmittedAt: screening.submittedAt },
    { expectedReviewedAt: null },
    { expectedSubmittedAt: 'not-a-date', expectedReviewedAt: null },
    { expectedSubmittedAt: screening.submittedAt, expectedReviewedAt: 'not-a-date' },
    {},
  ])('rejects omitted or invalid revision fields without accepting a legacy client', async (revision) => {
    asCounselor();
    const response = await PATCH(req(MEMBER_IN_SCOPE, { status: 'verified', ...revision }, false), paramsFor(MEMBER_IN_SCOPE));
    expect(response.status).toBe(409);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each([undefined, 'invalid'])('does not silently accept a stored screening without a valid submission timestamp', async (submittedAt) => {
    asCounselor();
    vi.mocked(prisma.user.findFirst).mockResolvedValueOnce({
      id: MEMBER_IN_SCOPE, wioaReviewStatus: 'pending', wioaReviewNotes: null, wioaReviewedAt: null,
      wioaQualificationJson: { ...screening, submittedAt },
    } as never);
    const response = await PATCH(req(MEMBER_IN_SCOPE, { status: 'verified' }), paramsFor(MEMBER_IN_SCOPE));
    expect(response.status).toBe(409);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a review changed since load even when the screening is unchanged', async () => {
    asCounselor();
    vi.mocked(prisma.user.findFirst).mockResolvedValueOnce({
      id: MEMBER_IN_SCOPE, wioaReviewStatus: 'pending', wioaReviewNotes: null,
      wioaReviewedAt: new Date('2026-09-19T12:00:00Z'), wioaQualificationJson: screening,
    } as never);
    const response = await PATCH(req(MEMBER_IN_SCOPE, { status: 'verified' }), paramsFor(MEMBER_IN_SCOPE));
    expect(response.status).toBe(409);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('accepts the exact loaded revision and carries its prior review timestamp into the write guard', async () => {
    asCounselor();
    const reviewedAt = new Date('2026-09-19T12:00:00Z');
    vi.mocked(prisma.user.findFirst).mockResolvedValueOnce({
      id: MEMBER_IN_SCOPE, wioaReviewStatus: 'pending', wioaReviewNotes: null,
      wioaReviewedAt: reviewedAt, wioaQualificationJson: screening,
    } as never);
    const response = await PATCH(req(MEMBER_IN_SCOPE, { status: 'verified', expectedReviewedAt: reviewedAt.toISOString() }), paramsFor(MEMBER_IN_SCOPE));
    expect(response.status).toBe(200);
    expect(prisma.user.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ wioaReviewedAt: reviewedAt }) }));
  });
});
