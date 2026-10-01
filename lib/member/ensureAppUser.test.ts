import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureAppUserProvisioned } from './ensureAppUser';
import { prisma } from '../db/prisma';

const ORG_A = 'org-custom-1';
const ORG_B = 'org-custom-2';
const DEFAULT_ORG = 'org-default';

function installProvisionMocks(t: { after: (fn: () => void) => void }) {
  const userDelegate = prisma.user as {
    findUnique: (...args: unknown[]) => unknown;
  };
  const originalFindUnique = userDelegate.findUnique;
  const originalTransaction = prisma.$transaction.bind(prisma);

  const state = {
    findUniqueResult: null as { id: string; organizationId: string; profile: { userId: string } | null } | null,
    postConflictReadback: undefined as { id: string; organizationId: string; profile: { userId: string } | null } | null | undefined,
    findUniqueCalls: [] as Array<{ where: { id: string } }>,
    upsertError: null as { code: string; message: string } | null,
    accountRoles: [] as string[],
    hasEmployer: false,
    hasPartner: false,
    hasCounselor: false,
    memberGrants: 0,
    profileCreates: [] as Array<{ userId: string; role: string }>,
    upserts: [] as Array<{
      where: Record<string, unknown>;
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    }>,
  };

  userDelegate.findUnique = async (...args: unknown[]) => {
    state.findUniqueCalls.push(args[0] as { where: { id: string } });
    return state.findUniqueCalls.length > 1 && state.postConflictReadback !== undefined
      ? state.postConflictReadback
      : state.findUniqueResult;
  };
  type TxCallback = (tx: {
    user: { upsert: (args: unknown) => Promise<unknown> };
    role: { findUnique: () => Promise<{ id: string }>; create: () => Promise<{ id: string }> };
    userRole: { createMany: () => Promise<{ count: number }> };
    profile: { upsert: () => Promise<unknown> };
  }) => unknown;
  (prisma as { $transaction: typeof prisma.$transaction }).$transaction = (async (
    fn: TxCallback,
  ) => {
    const tx = {
      user: {
        upsert: async (args: {
          where: Record<string, unknown>;
          create: Record<string, unknown>;
          update: Record<string, unknown>;
        }) => {
          state.upserts.push(args);
          if (state.upsertError) throw state.upsertError;
          return {};
        },
        findUniqueOrThrow: async () => ({
          userRoles: state.accountRoles.map((name) => ({ role: { name } })),
          employer: state.hasEmployer ? { id: 'employer-1' } : null,
          partnerUser: state.hasPartner ? { id: 'partner-user-1' } : null,
          counselorProfile: state.hasCounselor ? { id: 'counselor-1' } : null,
        }),
      },
      role: {
        findUnique: async () => ({ id: 'role-member' }),
        create: async () => ({ id: 'role-member' }),
      },
      userRole: {
        createMany: async () => { state.memberGrants += 1; return { count: 1 }; },
      },
      profile: {
        upsert: async (args: { create: { userId: string; role: string } }) => {
          state.profileCreates.push(args.create);
          return {};
        },
      },
    };
    return fn(tx as unknown as Parameters<TxCallback>[0]);
  }) as unknown as typeof prisma.$transaction;

  t.after(() => {
    userDelegate.findUnique = originalFindUnique;
    prisma.$transaction = originalTransaction;
  });

  return state;
}

test('ensureAppUserProvisioned is a no-op when user + profile already exist', async (t) => {
  const state = installProvisionMocks(t);
  state.findUniqueResult = { id: 'u1', organizationId: ORG_A, profile: { userId: 'u1' } };

  await ensureAppUserProvisioned(
    { id: 'u1', email: 'a@b.c' },
    { organizationId: ORG_A },
  );

  assert.equal(state.upserts.length, 0);
  assert.equal(state.memberGrants, 0);
});

test('orphan provision writes the injected org, not a hardcoded default', async (t) => {
  const state = installProvisionMocks(t);
  state.findUniqueResult = null;

  await ensureAppUserProvisioned(
    { id: 'u-orphan', email: 'orphan@example.com', user_metadata: { full_name: 'Orphan' } },
    { organizationId: ORG_A },
  );

  assert.equal(state.upserts.length, 1);
  assert.equal(state.upserts[0].create.organizationId, ORG_A);
  assert.deepEqual(state.upserts[0].update, {});
  assert.equal(state.memberGrants, 1);
  assert.deepEqual(state.profileCreates, [{ userId: 'u-orphan', role: 'member' }]);
});

test('orphan provision uses app metadata rather than user-editable metadata', async (t) => {
  const state = installProvisionMocks(t);

  await ensureAppUserProvisioned(
    {
      id: 'u-auth-orphan',
      email: 'orphan@example.com',
      user_metadata: { organization_id: ORG_B },
      app_metadata: { organization_id: ORG_A },
    },
    { headers: { get: () => null } },
  );

  assert.equal(state.upserts[0].create.organizationId, ORG_A);
  assert.equal(state.memberGrants, 1);
});

test('read-only portal audit never provisions an orphaned user', async (t) => {
  const state = installProvisionMocks(t);
  state.findUniqueResult = null;

  await ensureAppUserProvisioned(
    { id: 'u-audit', email: 'audit@example.com' },
    { organizationId: ORG_A, readOnlyAudit: true },
  );

  assert.equal(state.upserts.length, 0);
  assert.equal(state.memberGrants, 0);
  assert.equal(state.profileCreates.length, 0);
});

test('existing user without profile is not moved to another org', async (t) => {
  const state = installProvisionMocks(t);
  state.findUniqueResult = { id: 'u1', organizationId: ORG_A, profile: null };

  await ensureAppUserProvisioned(
    { id: 'u1', email: 'a@b.c' },
    { organizationId: DEFAULT_ORG },
  );

  assert.equal(state.upserts.length, 1);
  assert.deepEqual(state.upserts[0].update, {});
  assert.equal(state.upserts[0].create.organizationId, ORG_A);
  assert.equal(state.memberGrants, 1);
});

test('existing non-member role with missing profile is restored without a member grant', async (t) => {
  const state = installProvisionMocks(t);
  state.findUniqueResult = { id: 'u-staff', organizationId: ORG_A, profile: null };
  state.accountRoles = ['member', 'admin'];

  await ensureAppUserProvisioned({ id: 'u-staff', email: 'staff@example.com' }, { organizationId: DEFAULT_ORG });

  assert.equal(state.memberGrants, 0);
  assert.deepEqual(state.profileCreates, [{ userId: 'u-staff', role: 'admin' }]);
  assert.deepEqual(state.upserts[0].update, {});
});

test('existing employer association without a role row does not become a member', async (t) => {
  const state = installProvisionMocks(t);
  state.findUniqueResult = { id: 'u-employer', organizationId: ORG_A, profile: null };
  state.hasEmployer = true;

  await ensureAppUserProvisioned({ id: 'u-employer', email: 'employer@example.com' }, { organizationId: DEFAULT_ORG });

  assert.equal(state.memberGrants, 0);
  assert.deepEqual(state.profileCreates, [{ userId: 'u-employer', role: 'employer' }]);
});

test('existing counselor association without a role row does not become a member', async (t) => {
  const state = installProvisionMocks(t);
  state.findUniqueResult = { id: 'u-counselor', organizationId: ORG_A, profile: null };
  state.hasCounselor = true;

  await ensureAppUserProvisioned({ id: 'u-counselor', email: 'counselor@example.com' });

  assert.equal(state.memberGrants, 0);
  assert.deepEqual(state.profileCreates, [{ userId: 'u-counselor', role: 'counselor' }]);
});

test('email P2002 with no rows for this Auth ID reports a sanitized identity conflict', async (t) => {
  const state = installProvisionMocks(t);
  state.upsertError = { code: 'P2002', message: 'Unique email belongs to another Auth ID' };
  state.postConflictReadback = null;

  await assert.rejects(
    ensureAppUserProvisioned({ id: 'u-collision', email: 'synthetic@example.test' }, { organizationId: ORG_A }),
    { message: 'APP_USER_PROVISION_IDENTITY_CONFLICT' },
  );
  assert.equal(state.findUniqueCalls.length, 2);
  assert.deepEqual(state.findUniqueCalls[1].where, { id: 'u-collision' });
  assert.equal(state.profileCreates.length, 0);
});

test('concurrent P2002 succeeds only after this Auth ID has both app rows', async (t) => {
  const state = installProvisionMocks(t);
  state.upsertError = { code: 'P2002', message: 'Unique user ID from a concurrent request' };
  state.postConflictReadback = {
    id: 'u-race', organizationId: ORG_A, profile: { userId: 'u-race' },
  };

  await ensureAppUserProvisioned({ id: 'u-race', email: 'synthetic@example.test' }, { organizationId: ORG_A });
  assert.equal(state.findUniqueCalls.length, 2);
  assert.deepEqual(state.findUniqueCalls[1].where, { id: 'u-race' });
});

test('P2002 with this Auth ID but no profile is not reported as provisioned', async (t) => {
  const state = installProvisionMocks(t);
  state.upsertError = { code: 'P2002', message: 'Unique constraint failed' };
  state.postConflictReadback = { id: 'u-incomplete', organizationId: ORG_A, profile: null };

  await assert.rejects(
    ensureAppUserProvisioned({ id: 'u-incomplete', email: 'synthetic@example.test' }, { organizationId: ORG_A }),
    { message: 'APP_USER_PROVISION_IDENTITY_CONFLICT' },
  );
  assert.equal(state.findUniqueCalls.length, 2);
});
