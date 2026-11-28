import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';

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

const transactionClient = { __tx: true };
const transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(transactionClient));
vi.mock('@/lib/db/prisma', () => ({
  prisma: { $transaction: (fn: (tx: unknown) => Promise<unknown>) => transaction(fn) },
}));

vi.mock('@/lib/tenant/organization', () => ({
  getActorOrganizationId: vi.fn(),
}));

const findFirst = vi.fn();
const update = vi.fn();
const remove = vi.fn();
const agreementUpdateMany = vi.fn();
const queryRaw = vi.fn();
const profileUpdateMany = vi.fn();

vi.mock('@/lib/tenant/withTenantScope', () => ({
  withTenantScope: vi.fn((_orgId: string, fn: (db: unknown) => Promise<unknown>) =>
    fn({
      user: { findFirst, update, delete: remove },
      profile: { updateMany: profileUpdateMany },
      $queryRaw: queryRaw,
      enrollmentAgreementSubmission: { updateMany: agreementUpdateMany },
    }),
  ),
}));

const supabaseAdmin = { auth: { admin: {} } };
const disableAuthUserForSoftDelete = vi.fn();
const deleteSupabaseAuthUser = vi.fn();

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: vi.fn(() => supabaseAdmin),
}));

vi.mock('@/lib/admin/authUserLifecycle', () => ({
  disableAuthUserForSoftDelete: (...args: unknown[]) => disableAuthUserForSoftDelete(...args),
}));

vi.mock('@/lib/gdpr/deleteAuthUser', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/gdpr/deleteAuthUser')>();
  return {
    ...actual,
    deleteSupabaseAuthUser: (...args: unknown[]) => deleteSupabaseAuthUser(...args),
  };
});

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

import { POST } from '@/app/api/admin/members/[id]/erase/route';
import { getUser } from '@/lib/auth/server';
import { isAdmin, isSuperAdmin } from '@/lib/auth/roles';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import { deleteUserStorageObjects } from '@/lib/gdpr/deleteUserStorage';
import { withTenantScope } from '@/lib/tenant/withTenantScope';
import { ANONYMIZED_PROFILE_DATA } from '@/lib/member/anonymizeMember';

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
    subgroupsLed: [],
    subgroupsCreated: [],
    chaptersLed: [],
    billingPacketsSigned: [],
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
    profileUpdateMany.mockResolvedValue({ count: 1 });
    remove.mockResolvedValue({ id: MEMBER_ID });
    queryRaw.mockResolvedValue([{ present: false }]);
    agreementUpdateMany.mockResolvedValue({ count: 2 });
    disableAuthUserForSoftDelete.mockResolvedValue({ ok: true, alreadyMissing: false });
    deleteSupabaseAuthUser.mockResolvedValue({ error: null });
    vi.mocked(deleteUserStorageObjects).mockResolvedValue({ ok: true, deleted: [] });
  });

  it('fails closed with 502 and writes nothing when storage objects cannot be deleted', async () => {
    vi.mocked(deleteUserStorageObjects).mockResolvedValue({ ok: false, error: 'storage timeout', deleted: [] });

    const res = await POST(eraseReq(), { params: Promise.resolve({ id: MEMBER_ID }) });

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({
      error: 'Stored files could not be deleted. Account was not erased. Please try again or contact support.',
    });
    expect(update).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(disableAuthUserForSoftDelete).not.toHaveBeenCalled();
    expect(deleteSupabaseAuthUser).not.toHaveBeenCalled();
  });

  it('removes resume and certificate blobs before anonymizing an enrolled member', async () => {
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
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: MEMBER_ID }, data: expect.objectContaining({ deletedAt: expect.any(Date) }) }),
    );
    expect(remove).not.toHaveBeenCalled();
    expect(disableAuthUserForSoftDelete).toHaveBeenCalledWith(supabaseAdmin, MEMBER_ID, 'member@example.com', {
      scrubMetadata: true,
    });
    expect(deleteSupabaseAuthUser).not.toHaveBeenCalled();
    const [storageOrder] = vi.mocked(deleteUserStorageObjects).mock.invocationCallOrder;
    const [authOrder] = disableAuthUserForSoftDelete.mock.invocationCallOrder;
    const [updateOrder] = update.mock.invocationCallOrder;
    expect(storageOrder).toBeLessThan(authOrder);
    expect(authOrder).toBeLessThan(updateOrder);
  });

  it('clears profile PII and the workspace email in the same transaction as the anonymize', async () => {
    findFirst.mockResolvedValue(member({ courseEnrollments: [{ id: 'enr-1' }] }));

    const res = await POST(eraseReq(), { params: Promise.resolve({ id: MEMBER_ID }) });

    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ workspaceEmail: null, phone: null }) }),
    );
    expect(profileUpdateMany).toHaveBeenCalledExactlyOnceWith({
      where: { userId: MEMBER_ID },
      data: ANONYMIZED_PROFILE_DATA,
    });
    expect(ANONYMIZED_PROFILE_DATA).toMatchObject({ dob: null, address: null, hasDisability: null, householdIncome: null, ethnicity: null, parentGuardianEmail: null });
    expect(transaction).toHaveBeenCalledTimes(1);
    const scopedInTransaction = vi.mocked(withTenantScope).mock.calls.filter(([, , client]) => (client as unknown) === transactionClient);
    expect(scopedInTransaction).toHaveLength(1);
  });

  it('reports failure and leaves the row retryable when the profile scrub fails', async () => {
    findFirst.mockResolvedValue(member({ courseEnrollments: [{ id: 'enr-1' }] }));
    profileUpdateMany.mockRejectedValue(new Error('profile write failed'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const res = await POST(eraseReq(), { params: Promise.resolve({ id: MEMBER_ID }) });
      expect(res.status).toBe(500);
      expect(remove).not.toHaveBeenCalled();
      expect(deleteSupabaseAuthUser).not.toHaveBeenCalled();
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('fails closed with 502 and does not anonymize when Auth retirement fails', async () => {
    findFirst.mockResolvedValue(member({ courseEnrollments: [{ id: 'enr-1' }] }));
    disableAuthUserForSoftDelete.mockResolvedValue({ ok: false, message: 'Auth unavailable' });

    const res = await POST(eraseReq(), { params: Promise.resolve({ id: MEMBER_ID }) });

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({
      error: 'The account was not anonymized because its sign-in could not be disabled. Retry this action or contact support.',
      authDisabled: false,
    });
    expect(update).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(deleteSupabaseAuthUser).not.toHaveBeenCalled();
  });

  it('removes blobs, then Auth, then the application row on hard delete', async () => {
    const res = await POST(eraseReq(), { params: Promise.resolve({ id: MEMBER_ID }) });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, action: 'hard_delete', memberId: MEMBER_ID });
    expect(update).not.toHaveBeenCalled();
    expect(disableAuthUserForSoftDelete).not.toHaveBeenCalled();
    expect(deleteSupabaseAuthUser).toHaveBeenCalledWith(MEMBER_ID, supabaseAdmin);
    expect(remove).toHaveBeenCalledWith({ where: { id: MEMBER_ID } });
    const [storageOrder] = vi.mocked(deleteUserStorageObjects).mock.invocationCallOrder;
    const [authOrder] = deleteSupabaseAuthUser.mock.invocationCallOrder;
    const [deleteOrder] = remove.mock.invocationCallOrder;
    expect(storageOrder).toBeLessThan(authOrder);
    expect(authOrder).toBeLessThan(deleteOrder);
  });

  it('fails closed with 502 and keeps the application row when Auth delete fails', async () => {
    deleteSupabaseAuthUser.mockResolvedValue({ error: { status: 503, message: 'Auth unavailable' } });

    const res = await POST(eraseReq(), { params: Promise.resolve({ id: MEMBER_ID }) });

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({
      error: 'The account was not erased because its sign-in could not be deleted. Retry this action or contact support.',
      authDeleted: false,
    });
    expect(remove).not.toHaveBeenCalled();
  });

  it('hard-deletes the application row when Auth is already gone', async () => {
    deleteSupabaseAuthUser.mockResolvedValue({ error: { status: 404, message: 'User not found' } });

    const res = await POST(eraseReq(), { params: Promise.resolve({ id: MEMBER_ID }) });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, action: 'hard_delete', memberId: MEMBER_ID });
    expect(remove).toHaveBeenCalledWith({ where: { id: MEMBER_ID } });
  });

  it.each([
    { status: 404, message: 'Not Found' },
    { status: 404, message: 'Project not found' },
  ])('keeps the application row when a 404 does not confirm the login is gone: %j', async (authError) => {
    deleteSupabaseAuthUser.mockResolvedValue({ error: authError });

    const res = await POST(eraseReq(), { params: Promise.resolve({ id: MEMBER_ID }) });

    expect(res.status).toBe(502);
    expect(remove).not.toHaveBeenCalled();
  });

  it.each([true, false])('retains every agreement before account removal (enrolled: %s)', async (enrolled) => {
    findFirst.mockResolvedValue(member({ courseEnrollments: enrolled ? [{ id: 'enr-1' }] : [] }));
    queryRaw.mockResolvedValue([{ present: true }]);
    const res = await POST(eraseReq(), { params: Promise.resolve({ id: MEMBER_ID }) });
    expect(res.status).toBe(200);
    expect(agreementUpdateMany).toHaveBeenCalledWith({ where: { memberId: MEMBER_ID }, data: { memberId: null } });
    expect(vi.mocked(deleteUserStorageObjects).mock.invocationCallOrder[0])
      .toBeLessThan(agreementUpdateMany.mock.invocationCallOrder[0]);
    expect(agreementUpdateMany.mock.invocationCallOrder[0]).toBeLessThan((enrolled ? update : remove).mock.invocationCallOrder[0]);
  });

  it.each([true, false])('does not remove an account when agreement retention fails (enrolled: %s)', async (enrolled) => {
    findFirst.mockResolvedValue(member({ courseEnrollments: enrolled ? [{ id: 'enr-1' }] : [] }));
    queryRaw.mockResolvedValue([{ present: true }]);
    agreementUpdateMany.mockRejectedValue(new Error('agreement cleanup failed'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const res = await POST(eraseReq(), { params: Promise.resolve({ id: MEMBER_ID }) });
      expect(res.status).toBe(500);
      expect(update).not.toHaveBeenCalled();
      expect(remove).not.toHaveBeenCalled();
      expect(disableAuthUserForSoftDelete).not.toHaveBeenCalled();
      expect(deleteSupabaseAuthUser).not.toHaveBeenCalled();
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('refuses hard-delete before Auth when the member still leads a subgroup', async () => {
    findFirst.mockResolvedValue(member({ subgroupsLed: [{ id: 'sg-1' }] }));

    const res = await POST(eraseReq(), { params: Promise.resolve({ id: MEMBER_ID }) });

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error:
        'This account still leads a subgroup or chapter, created a subgroup, or signed a billing packet. Reassign that role before erasing the account.',
      authDeleted: false,
    });
    expect(deleteUserStorageObjects).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(disableAuthUserForSoftDelete).not.toHaveBeenCalled();
    expect(deleteSupabaseAuthUser).not.toHaveBeenCalled();
  });

  it('refuses hard-delete before Auth when the member still leads a chapter', async () => {
    findFirst.mockResolvedValue(member({ chaptersLed: [{ id: 'ch-1' }] }));

    const res = await POST(eraseReq(), { params: Promise.resolve({ id: MEMBER_ID }) });

    expect(res.status).toBe(409);
    expect(deleteUserStorageObjects).not.toHaveBeenCalled();
    expect(deleteSupabaseAuthUser).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it('still anonymizes an enrolled subgroup leader (update, not delete)', async () => {
    findFirst.mockResolvedValue(
      member({ courseEnrollments: [{ id: 'enr-1' }], subgroupsLed: [{ id: 'sg-1' }] }),
    );

    const res = await POST(eraseReq(), { params: Promise.resolve({ id: MEMBER_ID }) });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, action: 'anonymize', memberId: MEMBER_ID });
    expect(remove).not.toHaveBeenCalled();
    expect(deleteSupabaseAuthUser).not.toHaveBeenCalled();
    expect(disableAuthUserForSoftDelete).toHaveBeenCalled();
  });

  it('returns 409 when user.delete hits a Restrict FK after Auth is already gone', async () => {
    remove.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Foreign key constraint violated', {
        code: 'P2003',
        clientVersion: 'test',
        meta: { field_name: 'subgroups_leader_id_fkey' },
      }),
    );
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const res = await POST(eraseReq(), { params: Promise.resolve({ id: MEMBER_ID }) });
      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({
        error:
          'This account still leads a subgroup or chapter, created a subgroup, or signed a billing packet. Reassign that role before erasing the account.',
        authDeleted: true,
      });
      expect(deleteSupabaseAuthUser).toHaveBeenCalledWith(MEMBER_ID, supabaseAdmin);
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('never touches storage or rows for an administrator target', async () => {
    findFirst.mockResolvedValue(member({ profile: { role: 'admin' } }));

    const res = await POST(eraseReq(), { params: Promise.resolve({ id: MEMBER_ID }) });

    expect(res.status).toBe(403);
    expect(deleteUserStorageObjects).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(disableAuthUserForSoftDelete).not.toHaveBeenCalled();
    expect(deleteSupabaseAuthUser).not.toHaveBeenCalled();
  });
});
