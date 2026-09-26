import test from 'node:test';
import assert from 'node:assert/strict';

import type { getSupabaseAdmin } from '@/lib/supabase-admin';
import {
  provisionIntentAppMetadata,
  stampCreatedAuthUserProvisionIntent,
  type ProvisionIntent,
} from './provisionIntent';

const cases: ProvisionIntent[] = [
  { role: 'admin', organizationId: ' org-admin ', source: 'admin_user_create' },
  { role: 'member', organizationId: 'org-member', source: 'admin_member_create' },
  { role: 'member', organizationId: 'org-coursera', source: 'coursera_reconcile' },
  { role: 'member', organizationId: 'org-walk-in', source: 'counselor_walk_in' },
  { role: 'employer', organizationId: 'org-employer', source: 'employer_signup' },
  { role: 'partner', organizationId: 'org-signup', source: 'partner_signup' },
  { role: 'counselor', organizationId: 'org-invite', source: 'invitation_accept' },
];

test('provision intent retains fixed role, resolved organization, and route source', () => {
  for (const intent of cases) {
    assert.deepEqual(provisionIntentAppMetadata(intent), {
      wap_provision_intent: {
        version: 1,
        role: intent.role,
        organization_id: intent.organizationId.trim(),
        source: intent.source,
      },
    });
  }
  assert.throws(
    () => provisionIntentAppMetadata({ ...cases[0], organizationId: '  ' }),
    /requires an organization/,
  );
});

test('successful create preserves provider metadata and stamps only its returned Auth ID', async () => {
  const updates: Array<{ id: string; appMetadata: Record<string, unknown> }> = [];
  const admin = {
    auth: { admin: { updateUserById: async (id: string, attributes: { app_metadata: Record<string, unknown> }) => {
      updates.push({ id, appMetadata: attributes.app_metadata });
      return { error: null };
    } } },
  } as unknown as ReturnType<typeof getSupabaseAdmin>;

  const stamped = await stampCreatedAuthUserProvisionIntent(admin, {
    data: { user: { id: 'new-auth-id', app_metadata: { provider: 'email', providers: ['email'] } } },
    error: null,
  } as Parameters<typeof stampCreatedAuthUserProvisionIntent>[1], cases[1]);

  assert.equal(stamped, true);
  assert.deepEqual(updates, [{
    id: 'new-auth-id',
    appMetadata: {
      provider: 'email',
      providers: ['email'],
      ...provisionIntentAppMetadata(cases[1]),
    },
  }]);
});

test('duplicate create error never overwrites an existing Auth ID', async () => {
  let updates = 0;
  const admin = {
    auth: { admin: { updateUserById: async () => { updates += 1; return { error: null }; } } },
  } as unknown as ReturnType<typeof getSupabaseAdmin>;

  const duplicate = await stampCreatedAuthUserProvisionIntent(admin, {
    data: { user: null },
    error: { message: 'User already registered' },
  } as unknown as Parameters<typeof stampCreatedAuthUserProvisionIntent>[1], cases[1]);

  assert.equal(duplicate, false);
  assert.equal(updates, 0);
});

test('metadata provider failure is reported without interrupting create recovery', async (t) => {
  const errors: unknown[][] = [];
  const original = console.error;
  console.error = (...args) => { errors.push(args); };
  t.after(() => { console.error = original; });
  const admin = {
    auth: { admin: { updateUserById: async () => ({ error: new Error('provider unavailable') }) } },
  } as unknown as ReturnType<typeof getSupabaseAdmin>;

  const stamped = await stampCreatedAuthUserProvisionIntent(admin, {
    data: { user: { id: 'new-auth-id', app_metadata: {} } }, error: null,
  } as Parameters<typeof stampCreatedAuthUserProvisionIntent>[1], cases[6]);

  assert.equal(stamped, false);
  assert.equal(errors.length, 1);
});
