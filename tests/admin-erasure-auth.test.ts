import { describe, expect, it, vi } from 'vitest';
import { disableAuthUserForIrreversibleErase, retiredAuthEmail } from '@/lib/admin/authUserLifecycle';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

describe('irreversible admin erasure Auth retirement', () => {
  const id = '123e4567-e89b-12d3-a456-426614174000';

  it('retires only the selected Auth id after the original email was scrubbed', async () => {
    const getUserById = vi.fn(async () => ({ data: { user: { id, email: 'private@example.com' } }, error: null }));
    const updateUserById = vi.fn(async () => ({ error: null }));
    const admin = { auth: { admin: { getUserById, updateUserById } } } as unknown as ReturnType<typeof getSupabaseAdmin>;

    expect(await disableAuthUserForIrreversibleErase(admin, id)).toEqual({ ok: true, alreadyMissing: false });
    expect(updateUserById).toHaveBeenCalledWith(id, expect.objectContaining({ email: retiredAuthEmail(id) }));
  });

  it('never edits a mismatched Auth identity', async () => {
    const updateUserById = vi.fn();
    const admin = { auth: { admin: {
      getUserById: vi.fn(async () => ({ data: { user: { id: 'different', email: 'other@example.com' } }, error: null })),
      updateUserById,
    } } } as unknown as ReturnType<typeof getSupabaseAdmin>;

    expect((await disableAuthUserForIrreversibleErase(admin, id)).ok).toBe(false);
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it('distinguishes confirmed 404 absence from provider failure', async () => {
    const admin = (status: number) => ({ auth: { admin: {
      getUserById: vi.fn(async () => ({ data: { user: null }, error: { status } })),
      updateUserById: vi.fn(),
    } } }) as unknown as ReturnType<typeof getSupabaseAdmin>;

    expect(await disableAuthUserForIrreversibleErase(admin(404), id)).toEqual({ ok: true, alreadyMissing: true });
    expect((await disableAuthUserForIrreversibleErase(admin(503), id)).ok).toBe(false);
  });
});
