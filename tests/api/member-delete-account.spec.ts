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

// ─── Imports after mocks ───
import { POST as deleteAccount } from '@/app/api/member/delete-account/route';
import { getUser } from '@/lib/auth/server';
import { prisma } from '@/lib/db/prisma';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { deleteUserStorageObjects } from '@/lib/gdpr/deleteUserStorage';
import { isAdmin } from '@/lib/auth/roles';

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
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(getSupabaseAdmin).not.toHaveBeenCalled();
  });

  it('soft-deletes user account for authenticated member', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.user } as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: UUIDS.user,
      email: 'test@example.com',
      deletedAt: null,
    } as any);
    vi.mocked(prisma.user.update).mockResolvedValue({ id: UUIDS.user } as any);
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
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: UUIDS.user },
        data: expect.objectContaining({
          deletedAt: expect.any(Date),
          email: expect.stringContaining('deleted'),
        }),
      })
    );
    // Ordering contract (formerly lib/gdpr/erase-routes.test.ts): blobs are
    // removed before the soft-delete write.
    const [storageOrder] = vi.mocked(deleteUserStorageObjects).mock.invocationCallOrder;
    const [updateOrder] = vi.mocked(prisma.user.update).mock.invocationCallOrder;
    expect(storageOrder).toBeLessThan(updateOrder);
  });

  it('skips email mutation if user already deleted', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.user } as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: UUIDS.user,
      email: 'already_deleted_email',
      deletedAt: new Date('2025-01-01'),
    } as any);
    vi.mocked(prisma.user.update).mockResolvedValue({ id: UUIDS.user } as any);
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
    const updateCall = vi.mocked(prisma.user.update).mock.calls[0][0] as any;
    expect(updateCall.data.email).toBe('already_deleted_email');
  });

  it('returns an error when Supabase auth deletion fails', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.user } as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: UUIDS.user,
      email: 'test@example.com',
      deletedAt: null,
    } as any);
    vi.mocked(prisma.user.update).mockResolvedValue({ id: UUIDS.user } as any);
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

  it('returns 500 on database error', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.user } as any);
    vi.mocked(prisma.user.findUnique).mockRejectedValue(new Error('DB error'));

    const res = await deleteAccount(new Request('http://localhost'));

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Failed to delete account' });
  });

  it('returns ok even when user not found in DB', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.user } as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
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
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(getSupabaseAdmin).not.toHaveBeenCalled();
  });
});
