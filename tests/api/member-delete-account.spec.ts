import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ───
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
  cookies: vi.fn(() =>
    Promise.resolve({
      get: vi.fn(),
      getAll: vi.fn(() => []),
      set: vi.fn(),
    })
  ),
}));

vi.mock('@/lib/auth/server', () => ({
  getUser: vi.fn(),
  resolveAuthGucContext: vi.fn(() =>
    Promise.resolve({ role: 'authenticated', userId: '550e8400-e29b-41d4-a716-446655440001' })
  ),
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    $transaction: vi.fn(async (arg: any) => { const { prisma } = await import('@/lib/db/prisma'); return typeof arg === 'function' ? arg(prisma) : Promise.all(arg); }),
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: vi.fn(),
}));
vi.mock('@/lib/auth/roles', () => ({ isAdmin: vi.fn() }));

vi.mock('@/lib/gdpr/deleteUserStorage', () => ({
  ACCOUNT_STORAGE_DELETE_FAILED:
    'Stored files could not be deleted. Account was not erased. Please try again or contact support.',
  deleteUserStorageObjects: vi.fn(),
}));
// WAP-169: the route delegates every users/profiles write to the shared
// anonymiser (covered in tests/gdpr/anonymize-member.spec.ts).
vi.mock('@/lib/member/anonymizeMember', () => ({ anonymizeMember: vi.fn() }));
vi.mock('@/lib/audit', () => ({ auditLog: vi.fn(async () => {}) }));
vi.mock('@/lib/audit/log', () => ({ logAuditEvent: vi.fn(async () => {}) }));

// ─── Imports after mocks ───
import { POST as deleteAccount } from '@/app/api/member/delete-account/route';
import { getUser } from '@/lib/auth/server';
import { prisma } from '@/lib/db/prisma';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { deleteUserStorageObjects } from '@/lib/gdpr/deleteUserStorage';
import { isAdmin } from '@/lib/auth/roles';
import { anonymizeMember } from '@/lib/member/anonymizeMember';
import { auditLog } from '@/lib/audit';
import { logAuditEvent } from '@/lib/audit/log';

const anonymized = (overrides: Partial<{ alreadyDeleted: boolean }> = {}) => ({
  userId: UUIDS.user,
  deletedAt: new Date('2026-09-20T12:00:00Z'),
  alreadyDeleted: false,
  profileRowsCleared: 1,
  ...overrides,
});

const UUIDS = {
  user: '550e8400-e29b-41d4-a716-446655440001',
};

describe('POST /api/member/delete-account', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isAdmin).mockResolvedValue(false);
    vi.mocked(deleteUserStorageObjects).mockResolvedValue({ ok: true, deleted: [] } as any);
  });

  it('protects administrator accounts from the member self-delete action', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.user } as never);
    vi.mocked(isAdmin).mockResolvedValue(true);
    const res = await deleteAccount(new Request('http://localhost'));
    expect(res.status).toBe(403);
    expect(deleteUserStorageObjects).not.toHaveBeenCalled();
    expect(anonymizeMember).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(getSupabaseAdmin).not.toHaveBeenCalled();
  });

  it('soft-deletes and anonymises the account through the shared anonymiser', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.user } as any);
    vi.mocked(anonymizeMember).mockResolvedValue(anonymized());
    vi.mocked(getSupabaseAdmin).mockReturnValue({
      auth: {
        admin: {
          deleteUser: vi.fn().mockResolvedValue({ error: null }),
        },
      },
    } as any);

    const res = await deleteAccount(new Request('http://localhost'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(anonymizeMember).toHaveBeenCalledTimes(1);
    expect(anonymizeMember).toHaveBeenCalledWith(UUIDS.user, { reason: 'member_self_delete' }, prisma);
    // The route writes no users/profiles row of its own any more.
    expect(prisma.user.update).not.toHaveBeenCalled();
    // Ordering contract (formerly lib/gdpr/erase-routes.test.ts): blobs are
    // removed before the soft-delete write.
    const [storageOrder] = vi.mocked(deleteUserStorageObjects).mock.invocationCallOrder;
    const [anonymizeOrder] = vi.mocked(anonymizeMember).mock.invocationCallOrder;
    expect(storageOrder).toBeLessThan(anonymizeOrder);
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ verb: 'deleted', object: { type: 'User', id: UUIDS.user } }),
    );
  });

  it('never writes the original email into the three-year audit log', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.user, email: 'jane@example.com' } as any);
    vi.mocked(anonymizeMember).mockResolvedValue(anonymized());
    vi.mocked(getSupabaseAdmin).mockReturnValue({
      auth: { admin: { deleteUser: vi.fn().mockResolvedValue({ error: null }) } },
    } as any);

    const res = await deleteAccount(new Request('http://localhost'));

    expect(res.status).toBe(200);
    // The former `member_self_delete` row carried `metadata.originalEmail`;
    // the anonymiser now writes the (PII-free) audit row itself.
    expect(auditLog).not.toHaveBeenCalled();
    expect(JSON.stringify(vi.mocked(logAuditEvent).mock.calls)).not.toContain('jane@example.com');
  });

  it('still completes when the account was already soft-deleted', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.user } as any);
    vi.mocked(anonymizeMember).mockResolvedValue(anonymized({ alreadyDeleted: true }));
    vi.mocked(getSupabaseAdmin).mockReturnValue({
      auth: {
        admin: {
          deleteUser: vi.fn().mockResolvedValue({ error: null }),
        },
      },
    } as any);

    const res = await deleteAccount(new Request('http://localhost'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(anonymizeMember).toHaveBeenCalledTimes(1);
  });

  it('returns an error when Supabase auth deletion fails', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.user } as any);
    vi.mocked(anonymizeMember).mockResolvedValue(anonymized());
    vi.mocked(getSupabaseAdmin).mockReturnValue({
      auth: {
        admin: {
          deleteUser: vi.fn().mockResolvedValue({ error: { message: 'Auth service unavailable' } }),
        },
      },
    } as any);

    const res = await deleteAccount(new Request('http://localhost'));

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'Failed to delete account' });
  });

  it('returns 401 for unauthenticated user', async () => {
    vi.mocked(getUser).mockResolvedValue(null as any);

    const res = await deleteAccount(new Request('http://localhost'));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('returns 500 when the anonymiser fails, and does not delete the login', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.user } as any);
    vi.mocked(anonymizeMember).mockRejectedValue(new Error('DB error'));

    const res = await deleteAccount(new Request('http://localhost'));

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Failed to delete account' });
    expect(getSupabaseAdmin).not.toHaveBeenCalled();
  });

  it('returns ok even when user not found in DB', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.user } as any);
    vi.mocked(anonymizeMember).mockResolvedValue(null);
    vi.mocked(getSupabaseAdmin).mockReturnValue({
      auth: {
        admin: {
          deleteUser: vi.fn().mockResolvedValue({ error: null }),
        },
      },
    } as any);

    const res = await deleteAccount(new Request('http://localhost'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(logAuditEvent).not.toHaveBeenCalled();
  });

  it('does not claim deleted when storage object delete fails', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.user } as any);
    vi.mocked(deleteUserStorageObjects).mockResolvedValue({
      ok: false,
      error: 'permission denied',
      deleted: [],
    } as any);

    const res = await deleteAccount(new Request('http://localhost'));

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({
      error: 'Stored files could not be deleted. Account was not erased. Please try again or contact support.',
    });
    expect(anonymizeMember).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(getSupabaseAdmin).not.toHaveBeenCalled();
  });
});
