import test from 'node:test';
import assert from 'node:assert/strict';

import { deleteSupabaseAuthUser, isSupabaseAuthUserMissing } from './deleteAuthUser';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

test('deleteSupabaseAuthUser deletes through a Supabase admin client', async () => {
  const deletedUserIds: string[] = [];
  const supabaseAdmin = {
    auth: {
      admin: {
        deleteUser: async (userId: string) => {
          deletedUserIds.push(userId);
          return { error: null };
        },
      },
    },
  } as unknown as ReturnType<typeof getSupabaseAdmin>;

  const result = await deleteSupabaseAuthUser('user-123', supabaseAdmin);

  assert.deepEqual(deletedUserIds, ['user-123']);
  assert.equal(result.error, null);
});

test('deleteSupabaseAuthUser returns admin delete failures to caller', async () => {
  const deleteError = new Error('service role rejected request');
  const supabaseAdmin = {
    auth: {
      admin: {
        deleteUser: async () => ({ error: deleteError }),
      },
    },
  } as unknown as ReturnType<typeof getSupabaseAdmin>;

  const result = await deleteSupabaseAuthUser('user-123', supabaseAdmin);

  assert.equal(result.error, deleteError);
});

test('isSupabaseAuthUserMissing treats only confirmed missing identities as already gone', () => {
  assert.equal(isSupabaseAuthUserMissing(null), false);
  assert.equal(isSupabaseAuthUserMissing({ status: 500, message: 'Auth unavailable' }), false);
  assert.equal(isSupabaseAuthUserMissing({ status: 404, message: 'User not found' }), true);
  assert.equal(isSupabaseAuthUserMissing({ code: 'user_not_found', message: 'User not found' }), true);
  assert.equal(isSupabaseAuthUserMissing({ status: 404, code: 'user_not_found' }), true);
});

test('isSupabaseAuthUserMissing does not read an unconfirmed 404 or "not found" as a deleted login', () => {
  // A misrouted request (wrong base URL, proxy) answers 404 with no user code.
  assert.equal(isSupabaseAuthUserMissing({ status: 404, message: 'Not Found' }), false);
  assert.equal(isSupabaseAuthUserMissing({ status: 404, message: 'Project not found' }), false);
  assert.equal(isSupabaseAuthUserMissing({ status: 500, message: 'Route not found' }), false);
  // A thrown client error carries no status: the login may still exist.
  assert.equal(isSupabaseAuthUserMissing(new Error('User not found')), false);
  assert.equal(isSupabaseAuthUserMissing({ code: 'unexpected_failure', message: 'User not found' }), false);
});

test('deleteSupabaseAuthUser returns thrown admin delete failures to caller', async () => {
  const deleteError = new Error('service role unavailable');
  const supabaseAdmin = {
    auth: {
      admin: {
        deleteUser: async () => {
          throw deleteError;
        },
      },
    },
  } as unknown as ReturnType<typeof getSupabaseAdmin>;

  const result = await deleteSupabaseAuthUser('user-123', supabaseAdmin);

  assert.equal(result.error, deleteError);
});
