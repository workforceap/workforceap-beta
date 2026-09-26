import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteAuthUserForErasure, disableAuthUserForSoftDelete, reenableAuthUserAfterRestore, retiredAuthEmail } from '@/lib/admin/authUserLifecycle';

vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: vi.fn() }));
const id = '10000000-0000-4000-8000-000000000001';
const otherId = '10000000-0000-4000-8000-000000000002';
const email = 'learner@example.test';
const api = { getUserById: vi.fn(), updateUserById: vi.fn(), createUser: vi.fn(), deleteUser: vi.fn() };
const admin = { auth: { admin: api } } as unknown as Parameters<typeof disableAuthUserForSoftDelete>[0];

beforeEach(() => {
  vi.resetAllMocks();
  api.getUserById.mockResolvedValue({ data: { user: { id, email } }, error: null });
  api.updateUserById.mockResolvedValue({ data: { user: { id } }, error: null });
  api.createUser.mockResolvedValue({ data: { user: { id } }, error: null });
  api.deleteUser.mockResolvedValue({ data: {}, error: null });
});

function expectNoMutations() {
  expect(api.updateUserById).not.toHaveBeenCalled();
  expect(api.createUser).not.toHaveBeenCalled();
  expect(api.deleteUser).not.toHaveBeenCalled();
}

describe('verified Supabase auth identity lifecycle', () => {
  it('confirms the selected identity was removed before allowing hard erasure', async () => {
    expect(await deleteAuthUserForErasure(admin, id)).toEqual({ ok: true, alreadyMissing: false });
    expect(api.deleteUser).toHaveBeenCalledExactlyOnceWith(id);
  });

  it('accepts only an explicit missing-identity response as already erased', async () => {
    api.getUserById.mockResolvedValueOnce({ data: { user: null }, error: { status: 404, message: 'User not found' } });
    expect(await deleteAuthUserForErasure(admin, id)).toEqual({ ok: true, alreadyMissing: true });
    expect(api.deleteUser).not.toHaveBeenCalled();
  });

  it('never interprets a provider 503 with not-found wording as confirmed absence', async () => {
    api.getUserById.mockResolvedValueOnce({ data: { user: null }, error: { status: 503, message: 'User not found in failed upstream request' } });
    expect(await deleteAuthUserForErasure(admin, id)).toMatchObject({ ok: false });
    expect(api.deleteUser).not.toHaveBeenCalled();
  });

  it('keeps soft-delete and restore closed on a 503 containing not-found wording', async () => {
    api.getUserById.mockResolvedValue({ data: { user: null }, error: { status: 503, message: 'User not found in failed upstream request' } });
    expect(await disableAuthUserForSoftDelete(admin, id, email)).toMatchObject({ ok: false });
    expect(await reenableAuthUserAfterRestore(admin, { id, email })).toMatchObject({ ok: false });
    expectNoMutations();
  });

  it.each([
    { data: { user: null }, error: null },
    { data: { user: { id: otherId } }, error: null },
    { data: { user: null }, error: { status: 503, message: 'Unavailable' } },
  ])('refuses an unconfirmed erasure target: %j', async (lookup) => {
    api.getUserById.mockResolvedValueOnce(lookup);
    expect(await deleteAuthUserForErasure(admin, id)).toMatchObject({ ok: false });
    expect(api.deleteUser).not.toHaveBeenCalled();
  });

  it('keeps the app tombstone when provider deletion fails', async () => {
    api.deleteUser.mockResolvedValueOnce({ data: {}, error: { status: 503, message: 'Unavailable' } });
    expect(await deleteAuthUserForErasure(admin, id)).toMatchObject({ ok: false });
  });
  it.each([' LEARNER@EXAMPLE.TEST ', retiredAuthEmail(id)])('retires only the selected UUID with a matching original or retired address: %s', async (actualEmail) => {
    api.getUserById.mockResolvedValueOnce({ data: { user: { id, email: actualEmail } }, error: null });
    expect(await disableAuthUserForSoftDelete(admin, id, ' Learner@Example.Test ')).toEqual({ ok: true, alreadyMissing: false });
    expect(api.getUserById).toHaveBeenCalledWith(id);
    expect(api.updateUserById).toHaveBeenCalledExactlyOnceWith(id, {
      ban_duration: '876600h', email: `deleted-${id}@deleted.invalid`, email_confirm: true,
    });
    expect(api.deleteUser).not.toHaveBeenCalled();
  });

  it.each([{ id: otherId, email }, { id, email: 'somebody-else@example.test' }, { id, email: retiredAuthEmail(otherId) }, null])('refuses a mismatched or missing selected identity: %j', async (user) => {
    api.getUserById.mockResolvedValue({ data: { user }, error: null });
    expect(await disableAuthUserForSoftDelete(admin, id, email)).toMatchObject({ ok: false });
    expect(await reenableAuthUserAfterRestore(admin, { id, email })).toMatchObject({ ok: false });
    expectNoMutations();
  });

  it('does not claim deletion or attempt recreation on a provider lookup failure', async () => {
    api.getUserById.mockResolvedValue({ data: { user: null }, error: { status: 503, message: 'Auth unavailable' } });
    expect(await disableAuthUserForSoftDelete(admin, id, email)).toEqual({ ok: false, message: 'Could not verify the selected sign-in account.' });
    expect(await reenableAuthUserAfterRestore(admin, { id, email })).toEqual({ ok: false, message: 'Could not verify the selected sign-in account.' });
    expectNoMutations();
  });

  it('treats a confirmed missing auth identity as already disabled without mutation', async () => {
    api.getUserById.mockResolvedValueOnce({ data: { user: null }, error: { status: 404, message: 'User not found' } });
    expect(await disableAuthUserForSoftDelete(admin, id, email)).toEqual({ ok: true, alreadyMissing: true });
    expectNoMutations();
  });

  it('reports retirement failure instead of claiming the address was released', async () => {
    api.updateUserById.mockResolvedValueOnce({ data: { user: null }, error: { status: 500, message: 'Retirement failed' } });
    expect(await disableAuthUserForSoftDelete(admin, id, email)).toEqual({ ok: false, message: 'Retirement failed' });
    expect(api.deleteUser).not.toHaveBeenCalled();
  });

  it.each([email, retiredAuthEmail(id)])('restores and unbans the exact selected UUID from %s', async (actualEmail) => {
    api.getUserById.mockResolvedValueOnce({ data: { user: { id, email: actualEmail } }, error: null });
    expect(await reenableAuthUserAfterRestore(admin, { id, email: ' Learner@Example.Test ' })).toEqual({ ok: true, action: 'unbanned' });
    expect(api.updateUserById).toHaveBeenCalledExactlyOnceWith(id, { email, email_confirm: true, ban_duration: 'none' });
    expect(api.createUser).not.toHaveBeenCalled();
  });

  it('leaves a restore collision as a failure and never creates or deletes another identity', async () => {
    api.getUserById.mockResolvedValueOnce({ data: { user: { id, email: retiredAuthEmail(id) } }, error: null });
    api.updateUserById.mockResolvedValueOnce({ data: { user: null }, error: { status: 422, message: 'Email already registered' } });
    expect(await reenableAuthUserAfterRestore(admin, { id, email })).toEqual({ ok: false, message: 'Email already registered' });
    expect(api.createUser).not.toHaveBeenCalled();
    expect(api.deleteUser).not.toHaveBeenCalled();
  });

  it('recreates a confirmed missing identity under the original UUID without sending email or inventing a password', async () => {
    api.getUserById.mockResolvedValueOnce({ data: { user: null }, error: { status: 404, message: 'User not found' } });
    expect(await reenableAuthUserAfterRestore(admin, { id, email: ' Learner@Example.Test ', fullName: 'Synthetic Learner', phone: '555-0100' })).toEqual({ ok: true, action: 'recreated' });
    expect(api.createUser).toHaveBeenCalledExactlyOnceWith({ id, email, email_confirm: true, user_metadata: { full_name: 'Synthetic Learner', phone: '555-0100' } });
    expect(api.updateUserById).not.toHaveBeenCalled();
    expect(api.deleteUser).not.toHaveBeenCalled();
  });

  it('fails safely when the provider rejects same-ID recreation', async () => {
    api.getUserById.mockResolvedValueOnce({ data: { user: null }, error: { status: 404, message: 'User not found' } });
    api.createUser.mockResolvedValueOnce({ data: { user: null }, error: { message: 'Email already registered' } });
    expect(await reenableAuthUserAfterRestore(admin, { id, email })).toMatchObject({ ok: false });
    expect(api.deleteUser).not.toHaveBeenCalled();
  });

  it('cleans up only the newly returned wrong UUID if the provider ignored the requested original UUID', async () => {
    api.getUserById.mockResolvedValueOnce({ data: { user: null }, error: { status: 404, message: 'User not found' } });
    api.createUser.mockResolvedValueOnce({ data: { user: { id: otherId } }, error: null });
    expect(await reenableAuthUserAfterRestore(admin, { id, email })).toMatchObject({ ok: false });
    expect(api.deleteUser).toHaveBeenCalledExactlyOnceWith(otherId);
    expect(api.deleteUser).not.toHaveBeenCalledWith(id);
  });
});
