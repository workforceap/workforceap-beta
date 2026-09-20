/**
 * Counselor approvals (Mike, 2026-09-19): counselors may approve / deny /
 * request info on applications of members assigned to them. Admin path is
 * unchanged; plain members still get 403; out-of-caseload ids 404 without
 * touching the application.
 */
import { Prisma } from '@prisma/client';
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
vi.mock('@/lib/rate-limit', () => ({
  checkAuthRateLimit: vi.fn(() => Promise.resolve({ success: true })),
}));
vi.mock('@/lib/tenant/organization', () => ({
  getActorOrganizationId: vi.fn(() => Promise.resolve('org-1')),
}));
vi.mock('@/lib/audit/log', () => ({
  auditRequestMeta: vi.fn(() => ({ ip: 'test' })),
  logAuditEvent: vi.fn(() => Promise.resolve()),
}));
vi.mock('@/lib/observability/captureApiError', () => ({
  captureApiError: vi.fn(),
  captureApiResponseError: vi.fn(),
}));
vi.mock('@/lib/admin/applicationReview', () => ({
  changeApplicationStatus: vi.fn(),
}));
vi.mock('@/lib/db/prisma', () => ({
  prisma: { application: { findFirst: vi.fn() } },
}));

import { PATCH as patchStatus } from '@/app/api/admin/members/[id]/status/route';
import { POST as bulkReview } from '@/app/api/admin/applications/bulk-review/route';
import { getUser } from '@/lib/auth/server';
import { isAdmin, isCounselor, isSuperAdmin } from '@/lib/auth/roles';
import { assertStaffCanAccessMemberRecord } from '@/lib/counselor/staffMemberAccess';
import { changeApplicationStatus } from '@/lib/admin/applicationReview';
import { prisma } from '@/lib/db/prisma';

const COUNSELOR = 'c0c0c0c0-0000-4000-8000-000000000001';
const ADMIN = 'a0a0a0a0-0000-4000-8000-000000000001';
const MEMBER_IN_SCOPE = 'f5636f0b-da40-43fe-9ed9-21db789ca076';
const MEMBER_OUT_OF_SCOPE = 'f5636f0b-da40-43fe-9ed9-21db789ca099';
const APP_IN_SCOPE = 'aaaaaaaa-0000-4000-8000-000000000001';
const APP_OUT_OF_SCOPE = 'aaaaaaaa-0000-4000-8000-000000000002';

const APPLICATION_OWNER: Record<string, string> = {
  [APP_IN_SCOPE]: MEMBER_IN_SCOPE,
  [APP_OUT_OF_SCOPE]: MEMBER_OUT_OF_SCOPE,
};

function statusRequest(applicationId: string, body: unknown) {
  return new Request(`http://localhost/api/admin/members/${applicationId}/status`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '10.0.0.1' },
    body: JSON.stringify(body),
  }) as any;
}

function bulkRequest(body: unknown) {
  return new Request('http://localhost/api/admin/applications/bulk-review', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '10.0.0.1' },
    body: JSON.stringify(body),
  }) as any;
}

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

function asMember() {
  vi.mocked(getUser).mockResolvedValue({ id: 'member-user' } as never);
  vi.mocked(isAdmin).mockResolvedValue(false);
  vi.mocked(isSuperAdmin).mockResolvedValue(false);
  vi.mocked(isCounselor).mockResolvedValue(false);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.application.findFirst).mockImplementation((async (args: any) => {
    const owner = APPLICATION_OWNER[args?.where?.id];
    return owner ? { userId: owner } : null;
  }) as never);
  vi.mocked(changeApplicationStatus).mockImplementation(async (args) => ({
    ok: true,
    applicationId: args.applicationId,
    previousStatus: 'PENDING',
    newStatus: args.status,
  }));
});

describe('PATCH /api/admin/members/[id]/status — counselor approvals', () => {
  it('lets an assigned counselor approve an application in their caseload', async () => {
    asCounselor();
    const res = await patchStatus(statusRequest(APP_IN_SCOPE, { status: 'APPROVED', notes: 'Intake complete' }), paramsFor(APP_IN_SCOPE));
    expect(res.status).toBe(200);
    expect(assertStaffCanAccessMemberRecord).toHaveBeenCalledWith(COUNSELOR, MEMBER_IN_SCOPE);
    expect(changeApplicationStatus).toHaveBeenCalledTimes(1);
    expect(changeApplicationStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        applicationId: APP_IN_SCOPE,
        status: 'APPROVED',
        notes: 'Intake complete',
        orgId: 'org-1',
        actorUserId: COUNSELOR,
        actorRole: 'counselor',
      }),
    );
  });

  it('refuses a counselor acting on a member outside their caseload (404, nothing changed)', async () => {
    asCounselor();
    const res = await patchStatus(statusRequest(APP_OUT_OF_SCOPE, { status: 'APPROVED' }), paramsFor(APP_OUT_OF_SCOPE));
    expect(res.status).toBe(404);
    expect(changeApplicationStatus).not.toHaveBeenCalled();
  });

  it('refuses a counselor when the application is not in their org (404, nothing changed)', async () => {
    asCounselor();
    vi.mocked(prisma.application.findFirst).mockResolvedValue(null as never);
    const res = await patchStatus(statusRequest(APP_IN_SCOPE, { status: 'DENIED', notes: 'Outside our service area.' }), paramsFor(APP_IN_SCOPE));
    expect(res.status).toBe(404);
    expect(assertStaffCanAccessMemberRecord).not.toHaveBeenCalled();
    expect(changeApplicationStatus).not.toHaveBeenCalled();
  });

  it('still returns 403 for a plain member', async () => {
    asMember();
    const res = await patchStatus(statusRequest(APP_IN_SCOPE, { status: 'APPROVED' }), paramsFor(APP_IN_SCOPE));
    expect(res.status).toBe(403);
    expect(changeApplicationStatus).not.toHaveBeenCalled();
  });

  it('rejects a denial without a written reason before calling the review core (WAP-184 G-3)', async () => {
    asAdmin();
    for (const body of [{ status: 'DENIED' }, { status: 'DENIED', notes: '' }, { status: 'DENIED', notes: '   ' }]) {
      const res = await patchStatus(statusRequest(APP_IN_SCOPE, body), paramsFor(APP_IN_SCOPE));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/written reason/i);
    }
    expect(changeApplicationStatus).not.toHaveBeenCalled();
  });
  it('surfaces the review core\'s own denial-reason refusal as 400, not 404', async () => {
    asAdmin();
    vi.mocked(changeApplicationStatus).mockResolvedValueOnce({ ok: false, applicationId: APP_IN_SCOPE, error: 'A written reason is required when recording a denial or not-eligible decision.', status: 400 });
    const res = await patchStatus(statusRequest(APP_IN_SCOPE, { status: 'DENIED', notes: 'placeholder' }), paramsFor(APP_IN_SCOPE));
    expect(res.status).toBe(400);
  });
  it('keeps the admin path unchanged (org-scoped, no caseload check)', async () => {
    asAdmin();
    const res = await patchStatus(statusRequest(APP_OUT_OF_SCOPE, { status: 'APPROVED' }), paramsFor(APP_OUT_OF_SCOPE));
    expect(res.status).toBe(200);
    expect(assertStaffCanAccessMemberRecord).not.toHaveBeenCalled();
    expect(prisma.application.findFirst).not.toHaveBeenCalled();
    expect(changeApplicationStatus).toHaveBeenCalledWith(
      expect.objectContaining({ applicationId: APP_OUT_OF_SCOPE, actorUserId: ADMIN, actorRole: 'admin', orgId: 'org-1' }),
    );
  });

  it('records super_admin as the actor role for super admins', async () => {
    asAdmin();
    vi.mocked(isSuperAdmin).mockResolvedValue(true);
    const res = await patchStatus(statusRequest(APP_IN_SCOPE, { status: 'NEEDS_INFO' }), paramsFor(APP_IN_SCOPE));
    expect(res.status).toBe(200);
    expect(changeApplicationStatus).toHaveBeenCalledWith(expect.objectContaining({ actorRole: 'super_admin' }));
  });
});

describe('POST /api/admin/applications/bulk-review — counselor approvals', () => {
  it('processes the counselor\'s own members and reports the rest as not found', async () => {
    asCounselor();
    const res = await bulkReview(bulkRequest({ applicationIds: [APP_IN_SCOPE, APP_OUT_OF_SCOPE], status: 'DENIED', notes: 'Program prerequisites not met.' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.processedCount).toBe(1);
    expect(body.failedCount).toBe(1);
    expect(body.failures).toEqual([{ ok: false, applicationId: APP_OUT_OF_SCOPE, error: 'Application not found' }]);
    expect(changeApplicationStatus).toHaveBeenCalledTimes(1);
    expect(changeApplicationStatus).toHaveBeenCalledWith(
      expect.objectContaining({ applicationId: APP_IN_SCOPE, actorRole: 'counselor', actorUserId: COUNSELOR }),
    );
  });

  it('still returns 403 for a plain member', async () => {
    asMember();
    const res = await bulkReview(bulkRequest({ applicationIds: [APP_IN_SCOPE], status: 'DENIED' }));
    expect(res.status).toBe(403);
    expect(changeApplicationStatus).not.toHaveBeenCalled();
  });

  it('rejects a bulk denial without a written reason before processing any application (WAP-184 G-3)', async () => {
    asAdmin();
    const res = await bulkReview(bulkRequest({ applicationIds: [APP_IN_SCOPE, APP_OUT_OF_SCOPE], status: 'DENIED', notes: '  ' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/written reason/i);
    expect(changeApplicationStatus).not.toHaveBeenCalled();
  });
  it('keeps the admin path unchanged', async () => {
    asAdmin();
    const res = await bulkReview(bulkRequest({ applicationIds: [APP_IN_SCOPE, APP_OUT_OF_SCOPE], status: 'APPROVED', verified: true }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.processedCount).toBe(2);
    expect(assertStaffCanAccessMemberRecord).not.toHaveBeenCalled();
    expect(changeApplicationStatus).toHaveBeenCalledTimes(2);
    expect(changeApplicationStatus).toHaveBeenCalledWith(expect.objectContaining({ actorRole: 'admin' }));
  });

  it('bulk-approve attestation copy talks about intake, not eligibility', async () => {
    asAdmin();
    const res = await bulkReview(bulkRequest({ applicationIds: [APP_IN_SCOPE], status: 'APPROVED' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/intake/i);
    expect(body.error).not.toMatch(/eligib/i);
  });
});


it.each([
  [new Error('APPLICATION_REVIEW_CONFLICT'), 409],
  [new Prisma.PrismaClientKnownRequestError('retry', { code: 'P2034', clientVersion: 'test' }), 409],
  [new Error('APPLICATION_REVIEW_TRANSACTION_UNAVAILABLE'), 503],
] as const)('maps a known review failure to its actionable status', async (error, status) => {
  asAdmin();
  vi.mocked(changeApplicationStatus).mockRejectedValueOnce(error);
  const response = await patchStatus(statusRequest(APP_IN_SCOPE, { status: 'APPROVED' }), paramsFor(APP_IN_SCOPE));
  expect(response.status).toBe(status);
});

it('returns committed IDs and per-item failures while continuing the bulk batch', async () => {
  asAdmin();
  const third = 'third-app';
  vi.mocked(changeApplicationStatus)
    .mockResolvedValueOnce({ ok: true, applicationId: APP_IN_SCOPE, previousStatus: 'PENDING', newStatus: 'APPROVED' })
    .mockRejectedValueOnce(new Error('APPLICATION_REVIEW_CONFLICT'))
    .mockResolvedValueOnce({ ok: true, applicationId: third, previousStatus: 'PENDING', newStatus: 'APPROVED' });
  const response = await bulkReview(bulkRequest({ applicationIds: [APP_IN_SCOPE, APP_OUT_OF_SCOPE, third], status: 'APPROVED', verified: true }));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ success: false, processedCount: 2, processedApplicationIds: [APP_IN_SCOPE, third], failedCount: 1,
    failures: [{ ok: false, applicationId: APP_OUT_OF_SCOPE, status: 409 }] });
  expect(changeApplicationStatus).toHaveBeenCalledTimes(3);
});

it('preserves successful results if a later per-item permission lookup fails', async () => {
  asCounselor();
  vi.mocked(prisma.application.findFirst).mockResolvedValueOnce({ userId: MEMBER_IN_SCOPE } as never).mockRejectedValueOnce(new Error('lookup unavailable'));
  const response = await bulkReview(bulkRequest({ applicationIds: [APP_IN_SCOPE, APP_OUT_OF_SCOPE], status: 'DENIED', notes: 'Program prerequisites not met.' }));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ processedCount: 1, processedApplicationIds: [APP_IN_SCOPE], failedCount: 1,
    failures: [{ applicationId: APP_OUT_OF_SCOPE, status: 500 }] });
});
