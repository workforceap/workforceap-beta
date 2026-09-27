import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Behavioural contract for POST /api/admin/members/[id]/erase (formerly
 * asserted by reading the route source in lib/gdpr/erase-routes.test.ts):
 * storage objects are deleted first and the route fails closed with 502
 * before any anonymize / hard-delete write when blobs remain.
 */

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
  withApiGuc: (handler: (request: Request, context: unknown) => Promise<Response>) => handler,
}));

vi.mock('@/lib/auth/server', () => ({
  getUser: vi.fn(),
  resolveAuthGucContext: vi.fn(async () => ({ userId: null, orgId: null, role: 'anonymous' })),
}));

vi.mock('@/lib/auth/roles', () => ({
  isAdmin: vi.fn(),
  isSuperAdmin: vi.fn(),
}));

vi.mock('@/lib/db/prisma', () => ({ prisma: {} }));

vi.mock('@/lib/tenant/organization', () => ({
  getActorOrganizationId: vi.fn(),
}));

const findFirst = vi.fn();
const update = vi.fn();
const remove = vi.fn();

vi.mock('@/lib/tenant/withTenantScope', () => ({
  withTenantScope: vi.fn((_orgId: string, fn: (db: unknown) => Promise<unknown>) =>
    fn({ user: { findFirst, update, deleteMany: remove } }),
  ),
}));

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: vi.fn(() => ({ syntheticAdmin: true })),
}));
vi.mock('@/lib/admin/authUserLifecycle', () => ({
  deleteAuthUserForErasure: vi.fn(),
  disableAuthUserForIrreversibleErase: vi.fn(),
}));

vi.mock('@/lib/admin/logCronRun', () => ({
  logCronRun: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/audit', () => ({
  auditLog: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/audit/log', () => ({
  auditRequestMeta: vi.fn(() => ({})),
  logAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/gdpr/deleteUserStorage', () => ({
  ACCOUNT_STORAGE_DELETE_FAILED:
    'Stored files could not be deleted. Account was not erased. Please try again or contact support.',
  MEMBER_RESUME_BUCKET: 'member-resumes',
  MEMBER_FILES_BUCKET: 'member-files',
  deleteUserStorageObjects: vi.fn(),
}));

vi.mock('@/lib/billing/erasureGuard', () => ({
  beginBillingDeletion: vi.fn(),
  releaseBillingDeletion: vi.fn().mockResolvedValue(undefined),
  completeBillingDeletion: vi.fn(),
  BILLING_SEND_IN_PROGRESS_ERROR: 'A billing packet is being sent for this member. Finish or reconcile that send before deleting the account.',
}));
vi.mock('@/lib/member/anonymizeMember', () => ({ anonymizeMember: vi.fn(async () => ({ userId: 'member-1', deletedAt: new Date(), profileRowsCleared: 1 })) }));

import { POST } from '@/app/api/admin/members/[id]/erase/route';
import { getUser } from '@/lib/auth/server';
import { isAdmin, isSuperAdmin } from '@/lib/auth/roles';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import { deleteUserStorageObjects } from '@/lib/gdpr/deleteUserStorage';
import { beginBillingDeletion, releaseBillingDeletion, completeBillingDeletion } from '@/lib/billing/erasureGuard';
import { anonymizeMember } from '@/lib/member/anonymizeMember';
import { deleteAuthUserForErasure, disableAuthUserForIrreversibleErase } from '@/lib/admin/authUserLifecycle';

const MEMBER_ID = 'member-1';

function eraseReq(body?: unknown) {
  return new Request(`http://localhost:3000/api/admin/members/${MEMBER_ID}/erase`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function member(overrides: Record<string, unknown> = {}) {
  return {
    id: MEMBER_ID,
    email: 'member@example.com',
    deletedAt: null,
    profile: { role: 'member', resumeOriginalPath: 'member-1/resume.pdf', resumeEnhancedPath: null },
    userRoles: [],
    userCertifications: [{ proofUrl: 'cert-files/member-1/cert.pdf' }],
    courseEnrollments: [],
    trainingBillingPackets: [],
    ...overrides,
  };
}

describe('POST /api/admin/members/[id]/erase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUser).mockResolvedValue({ id: 'admin-1', email: 'admin@example.com' } as never);
    vi.mocked(isAdmin).mockResolvedValue(true);
    vi.mocked(isSuperAdmin).mockResolvedValue(false);
    vi.mocked(getActorOrganizationId).mockResolvedValue('org-1');
    findFirst.mockResolvedValue(member());
    update.mockResolvedValue({ id: MEMBER_ID });
    remove.mockResolvedValue({ count: 1 });
    vi.mocked(deleteAuthUserForErasure).mockResolvedValue({ ok: true, alreadyMissing: false });
    vi.mocked(disableAuthUserForIrreversibleErase).mockResolvedValue({ ok: true, alreadyMissing: false });
    vi.mocked(deleteUserStorageObjects).mockResolvedValue({ ok: true, deleted: [] });
    vi.mocked(beginBillingDeletion).mockResolvedValue({ ok: true, pendingAt: new Date(), operationId: 'operation-1' });
  });

  it('refuses erasure before file deletion while a billing delivery is claimed', async () => {
    vi.mocked(beginBillingDeletion).mockResolvedValue({ ok: false, reason: 'unresolved_send' });

    const res = await POST(eraseReq(), { params: Promise.resolve({ id: MEMBER_ID }) });

    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('billing_send_unresolved');
    expect(deleteUserStorageObjects).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it('does not touch Storage or Auth if the member disappears before the tombstone commits', async () => {
    vi.mocked(anonymizeMember).mockResolvedValueOnce(null);

    const res = await POST(eraseReq(), { params: Promise.resolve({ id: MEMBER_ID }) });

    expect(res.status).toBe(409);
    expect(deleteUserStorageObjects).not.toHaveBeenCalled();
    expect(deleteAuthUserForErasure).not.toHaveBeenCalled();
    expect(releaseBillingDeletion).toHaveBeenCalledWith(MEMBER_ID, 'operation-1');
  });

  it('anonymizes before a failed Storage cleanup and leaves the deletion barrier in place', async () => {
    vi.mocked(deleteUserStorageObjects).mockResolvedValue({ ok: false, error: 'storage timeout', deleted: [] });

    const res = await POST(eraseReq(), { params: Promise.resolve({ id: MEMBER_ID }) });

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({
      error: 'Account data was anonymized, but stored files remain. Retry erasure or contact support.',
      billingDeletionPending: true,
    });
    expect(releaseBillingDeletion).toHaveBeenCalledWith(MEMBER_ID, 'operation-1');
    expect(anonymizeMember).toHaveBeenCalledOnce();
    expect(vi.mocked(anonymizeMember).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(deleteUserStorageObjects).mock.invocationCallOrder[0],
    );
    expect(update).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(deleteAuthUserForErasure).not.toHaveBeenCalled();
  });

  it('anonymizes an enrolled member before removing resume and certificate blobs', async () => {
    findFirst.mockResolvedValue(member({ courseEnrollments: [{ id: 'enr-1' }] }));

    const res = await POST(eraseReq(), { params: Promise.resolve({ id: MEMBER_ID }) });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, action: 'anonymize', memberId: MEMBER_ID });
    expect(deleteUserStorageObjects).toHaveBeenCalledWith(MEMBER_ID, {
      extraPaths: [
        { bucket: 'member-resumes', path: 'member-1/resume.pdf' },
        { bucket: 'member-files', path: 'cert-files/member-1/cert.pdf' },
      ],
    });
    expect(anonymizeMember).toHaveBeenCalledWith(MEMBER_ID, { reason: 'admin_erase', actorUserId: 'admin-1' }, expect.anything());
    expect(disableAuthUserForIrreversibleErase).toHaveBeenCalledWith(expect.anything(), MEMBER_ID);
    expect(completeBillingDeletion).toHaveBeenCalledWith(MEMBER_ID, 'operation-1');
    expect(remove).not.toHaveBeenCalled();
    const [storageOrder] = vi.mocked(deleteUserStorageObjects).mock.invocationCallOrder;
    const [updateOrder] = vi.mocked(anonymizeMember).mock.invocationCallOrder;
    expect(updateOrder).toBeLessThan(storageOrder);
  });

  it('keeps a deleted tombstone until Auth removal is confirmed, then hard-deletes by owner', async () => {
    const res = await POST(eraseReq(), { params: Promise.resolve({ id: MEMBER_ID }) });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, action: 'hard_delete', memberId: MEMBER_ID });
    expect(update).not.toHaveBeenCalled();
    expect(anonymizeMember).toHaveBeenCalledWith(MEMBER_ID, { reason: 'admin_erase', actorUserId: 'admin-1' }, expect.anything());
    expect(deleteAuthUserForErasure).toHaveBeenCalledWith(expect.anything(), MEMBER_ID);
    expect(remove).toHaveBeenCalledWith({ where: { id: MEMBER_ID, billingDeletionOperationId: 'operation-1' } });
    const [storageOrder] = vi.mocked(deleteUserStorageObjects).mock.invocationCallOrder;
    const [tombstoneOrder] = vi.mocked(anonymizeMember).mock.invocationCallOrder;
    const [deleteOrder] = remove.mock.invocationCallOrder;
    const [authOrder] = vi.mocked(deleteAuthUserForErasure).mock.invocationCallOrder;
    expect(tombstoneOrder).toBeLessThan(storageOrder);
    expect(tombstoneOrder).toBeLessThan(authOrder);
    expect(authOrder).toBeLessThan(deleteOrder);
  });

  it.each(['error', 'exception'])('retains the deleted app tombstone when hard-delete Auth returns %s', async (mode) => {
    if (mode === 'error') vi.mocked(deleteAuthUserForErasure).mockResolvedValueOnce({ ok: false, message: 'provider unavailable' });
    else vi.mocked(deleteAuthUserForErasure).mockRejectedValueOnce(new Error('network timeout'));

    const res = await POST(eraseReq(), { params: Promise.resolve({ id: MEMBER_ID }) });

    expect(res.status).toBe(mode === 'error' ? 502 : 503);
    expect((await res.json()).reconciliationRequired).toBe(true);
    expect(anonymizeMember).toHaveBeenCalledOnce();
    expect(remove).not.toHaveBeenCalled();
    // The operation token is released after the uncertain Auth outcome, but
    // the pending marker remains so restore and billing claims stay blocked.
    expect(releaseBillingDeletion).toHaveBeenCalledWith(MEMBER_ID, 'operation-1');
  });

  it('retains the anonymized tombstone and pending marker when Auth disable is unconfirmed', async () => {
    findFirst.mockResolvedValue(member({ courseEnrollments: [{ id: 'enr-1' }] }));
    vi.mocked(disableAuthUserForIrreversibleErase).mockResolvedValueOnce({ ok: false, message: 'provider unavailable' });

    const res = await POST(eraseReq(), { params: Promise.resolve({ id: MEMBER_ID }) });

    expect(res.status).toBe(502);
    expect((await res.json()).reconciliationRequired).toBe(true);
    expect(anonymizeMember).toHaveBeenCalledOnce();
    expect(completeBillingDeletion).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(releaseBillingDeletion).toHaveBeenCalledWith(MEMBER_ID, 'operation-1');
  });

  it.each([false, true])('erases the member while the database detaches issued billing records (force=%s)', async (force) => {
    vi.mocked(isSuperAdmin).mockResolvedValue(true);
    findFirst.mockResolvedValue(member({ trainingBillingPackets: [{ id: 'packet-1' }] }));

    const res = await POST(eraseReq({ force }), { params: Promise.resolve({ id: MEMBER_ID }) });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, action: 'hard_delete', memberId: MEMBER_ID });
    expect(deleteUserStorageObjects).toHaveBeenCalledOnce();
    expect(update).not.toHaveBeenCalled();
    expect(remove).toHaveBeenCalledWith({ where: { id: MEMBER_ID, billingDeletionOperationId: 'operation-1' } });
    expect(deleteAuthUserForErasure).toHaveBeenCalledWith(expect.anything(), MEMBER_ID);
  });

  it('never touches storage or rows for an administrator target', async () => {
    findFirst.mockResolvedValue(member({ profile: { role: 'admin' } }));

    const res = await POST(eraseReq(), { params: Promise.resolve({ id: MEMBER_ID }) });

    expect(res.status).toBe(403);
    expect(deleteUserStorageObjects).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it('rechecks the target role after claiming deletion ownership', async () => {
    findFirst.mockResolvedValueOnce(member()).mockResolvedValueOnce(member({
      profile: { role: 'admin' },
    }));

    const res = await POST(eraseReq(), { params: Promise.resolve({ id: MEMBER_ID }) });

    expect(res.status).toBe(403);
    expect(findFirst).toHaveBeenCalledTimes(2);
    expect(beginBillingDeletion).toHaveBeenCalledWith(MEMBER_ID, 'org-1');
    expect(releaseBillingDeletion).toHaveBeenCalledWith(MEMBER_ID, 'operation-1');
    expect(deleteUserStorageObjects).not.toHaveBeenCalled();
    expect(anonymizeMember).not.toHaveBeenCalled();
    expect(deleteAuthUserForErasure).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });
});
