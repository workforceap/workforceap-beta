import { describe, it, expect, vi, beforeEach } from 'vitest';

const signInWithPassword = vi.fn();
const signOut = vi.fn();

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
      getAll: vi.fn(() => []),
      set: vi.fn(),
    })
  ),
}));

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      signInWithPassword,
      signOut,
    },
  })),
}));

vi.mock('@/lib/auth/server', () => ({
  getUser: vi.fn(),
  resolveAuthGucContext: vi.fn(() => Promise.resolve({ role: 'authenticated', userId: 'user-123' })),
}));

vi.mock('@/lib/db/withRequestGuc', () => ({
  withApiGuc: (handler: (request: Request) => Promise<Response>) => handler,
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    $transaction: vi.fn(async (arg: any) => { const { prisma } = await import('@/lib/db/prisma'); return typeof arg === 'function' ? arg(prisma) : Promise.all(arg); }),
    $executeRaw: vi.fn(),
    memberEvent: { create: vi.fn() },
  },
}));

vi.mock('@/lib/supabaseCookieOptions', () => ({
  getSupabaseCookieOptions: vi.fn(() => ({ path: '/', sameSite: 'lax' })),
}));

vi.mock('@/lib/supabase/env', () => ({
  getSupabaseEnv: vi.fn(() => ({ url: 'https://supabase.test', anonKey: 'anon-key' })),
}));

vi.mock('@/lib/gdpr/deleteAuthUser', () => ({
  deleteSupabaseAuthUser: vi.fn(),
}));

vi.mock('@/lib/gdpr/deleteUserStorage', () => ({
  ACCOUNT_STORAGE_DELETE_FAILED:
    'Stored files could not be deleted. Account was not erased. Please try again or contact support.',
  deleteUserStorageObjects: vi.fn(),
}));
// WAP-169: the two raw UPDATEs are gone; the route uses the shared anonymiser
// (covered in tests/gdpr/anonymize-member.spec.ts).
vi.mock('@/lib/member/anonymizeMember', () => ({ anonymizeMember: vi.fn() }));
vi.mock('@/lib/audit', () => ({ auditLog: vi.fn(async () => {}) }));
vi.mock('@/lib/audit/log', () => ({ logAuditEvent: vi.fn(async () => {}) }));

import { POST } from '@/app/api/gdpr/delete/route';
import { getUser } from '@/lib/auth/server';
import { prisma } from '@/lib/db/prisma';
import { deleteSupabaseAuthUser } from '@/lib/gdpr/deleteAuthUser';
import { deleteUserStorageObjects } from '@/lib/gdpr/deleteUserStorage';
import { anonymizeMember } from '@/lib/member/anonymizeMember';

describe('POST /api/gdpr/delete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUser).mockResolvedValue({
      id: 'user-123',
      email: 'jane@example.com',
    } as any);
    signInWithPassword.mockResolvedValue({ error: null });
    signOut.mockResolvedValue({ error: null });
    vi.mocked(anonymizeMember).mockResolvedValue({
      userId: 'user-123',
      deletedAt: new Date('2026-09-20T12:00:00Z'),
      alreadyDeleted: false,
      profileRowsCleared: 1,
    });
    vi.mocked(deleteSupabaseAuthUser).mockResolvedValue({ error: null } as any);
    vi.mocked(deleteUserStorageObjects).mockResolvedValue({ ok: true, deleted: [] } as any);
  });

  it('anonymizes the member through the shared anonymiser before deleting the auth user', async () => {
    const res = await POST(
      new Request('http://localhost:3000/api/gdpr/delete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password: 'correct-password' }),
      })
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });

    expect(anonymizeMember).toHaveBeenCalledTimes(1);
    expect(anonymizeMember).toHaveBeenCalledWith('user-123', { reason: 'gdpr_account_delete' }, prisma);
    // No hand-rolled SQL remains on this path.
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
    expect(deleteUserStorageObjects).toHaveBeenCalledWith('user-123');
    expect(deleteSupabaseAuthUser).toHaveBeenCalledWith('user-123');
    // Ordering contract (formerly lib/gdpr/erase-routes.test.ts): storage
    // objects go first, then the anonymizing writes, then the auth delete.
    const [storageOrder] = vi.mocked(deleteUserStorageObjects).mock.invocationCallOrder;
    const [anonymizeOrder] = vi.mocked(anonymizeMember).mock.invocationCallOrder;
    const [authDeleteOrder] = vi.mocked(deleteSupabaseAuthUser).mock.invocationCallOrder;
    expect(storageOrder).toBeLessThan(anonymizeOrder);
    expect(anonymizeOrder).toBeLessThan(authDeleteOrder);
    // The deletion marker is a typed Prisma write (the former raw INSERT bound
    // the metadata as text into the jsonb column and failed with 42804).
    expect(prisma.memberEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-123',
        eventName: 'account_deleted',
        entityType: 'gdpr',
        metadata: expect.objectContaining({ reason: 'user_requested', deletedAt: expect.any(String) }),
      }),
    });
  });

  it('does not claim erased when storage object delete fails', async () => {
    vi.mocked(deleteUserStorageObjects).mockResolvedValue({
      ok: false,
      error: 'permission denied',
      deleted: [],
    } as any);

    const res = await POST(
      new Request('http://localhost:3000/api/gdpr/delete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password: 'correct-password' }),
      })
    );

    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({
      error: 'Stored files could not be deleted. Account was not erased. Please try again or contact support.',
    });
    expect(anonymizeMember).not.toHaveBeenCalled();
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
    expect(deleteSupabaseAuthUser).not.toHaveBeenCalled();
  });

  it('does not delete the login when the anonymiser fails', async () => {
    vi.mocked(anonymizeMember).mockRejectedValue(new Error('profiles locked'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await POST(
      new Request('http://localhost:3000/api/gdpr/delete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password: 'correct-password' }),
      })
    );

    expect(res.status).toBe(500);
    expect(deleteSupabaseAuthUser).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
