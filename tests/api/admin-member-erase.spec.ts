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
    fn({ user: { findFirst, update, delete: remove } }),
  ),
}));

const supabaseDeleteUser = vi.fn();

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: vi.fn(() => ({ auth: { admin: { deleteUser: supabaseDeleteUser } } })),
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

import { POST } from '@/app/api/admin/members/[id]/erase/route';
import { getUser } from '@/lib/auth/server';
import { isAdmin, isSuperAdmin } from '@/lib/auth/roles';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import { deleteUserStorageObjects } from '@/lib/gdpr/deleteUserStorage';

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
    remove.mockResolvedValue({ id: MEMBER_ID });
    supabaseDeleteUser.mockResolvedValue({ error: null });
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
    expect(supabaseDeleteUser).not.toHaveBeenCalled();
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
    const [storageOrder] = vi.mocked(deleteUserStorageObjects).mock.invocationCallOrder;
    const [updateOrder] = update.mock.invocationCallOrder;
    expect(storageOrder).toBeLessThan(updateOrder);
  });

  it('removes blobs before the hard delete and the auth delete', async () => {
    const res = await POST(eraseReq(), { params: Promise.resolve({ id: MEMBER_ID }) });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, action: 'hard_delete', memberId: MEMBER_ID });
    expect(update).not.toHaveBeenCalled();
    expect(remove).toHaveBeenCalledWith({ where: { id: MEMBER_ID } });
    expect(supabaseDeleteUser).toHaveBeenCalledWith(MEMBER_ID);
    const [storageOrder] = vi.mocked(deleteUserStorageObjects).mock.invocationCallOrder;
    const [deleteOrder] = remove.mock.invocationCallOrder;
    const [authOrder] = supabaseDeleteUser.mock.invocationCallOrder;
    expect(storageOrder).toBeLessThan(deleteOrder);
    expect(deleteOrder).toBeLessThan(authOrder);
  });

  it('never touches storage or rows for an administrator target', async () => {
    findFirst.mockResolvedValue(member({ profile: { role: 'admin' } }));

    const res = await POST(eraseReq(), { params: Promise.resolve({ id: MEMBER_ID }) });

    expect(res.status).toBe(403);
    expect(deleteUserStorageObjects).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });
});
