import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureUserInDb } from './ensureUser';
import { prisma } from '../db/prisma';

const ORG_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const DEFAULT_ORG = 'org-1';

function stubDefaultOrg(t: { after: (fn: () => void) => void }) {
  const organizationDelegate = prisma.organization as any;
  const userDelegate = prisma.user as any;
  const originalFindUnique = organizationDelegate.findUnique;
  const originalUpsert = userDelegate.upsert;

  t.after(() => {
    organizationDelegate.findUnique = originalFindUnique;
    userDelegate.upsert = originalUpsert;
  });

  organizationDelegate.findUnique = async () => ({ id: DEFAULT_ORG } as any);
  return { userDelegate };
}

test('ensureUserInDb - happy path', async (t) => {
  const { userDelegate } = stubDefaultOrg(t);

  let upsertCalled = 0;
  userDelegate.upsert = async (_args: any) => {
    upsertCalled++;
    return {} as any;
  };

  await ensureUserInDb({ id: 'user-1', email: 'test@example.com' });
  assert.equal(upsertCalled, 1);
});

test('ensureUserInDb stamps server-controlled app metadata org instead of always using default', async (t) => {
  const { userDelegate } = stubDefaultOrg(t);
  let createOrg: string | undefined;

  userDelegate.upsert = async (args: any) => {
    createOrg = args.create?.organizationId;
    return {} as any;
  };

  await ensureUserInDb({
    id: 'user-meta',
    email: 'meta@example.com',
    app_metadata: { organization_id: ORG_A },
  });

  assert.equal(createOrg, ORG_A);
});

test('ensureUserInDb stamps explicit organizationId over metadata and default', async (t) => {
  const { userDelegate } = stubDefaultOrg(t);
  let createOrg: string | undefined;

  userDelegate.upsert = async (args: any) => {
    createOrg = args.create?.organizationId;
    return {} as any;
  };

  await ensureUserInDb(
    {
      id: 'user-explicit',
      email: 'explicit@example.com',
      app_metadata: { organization_id: DEFAULT_ORG },
    },
    { organizationId: ORG_A },
  );

  assert.equal(createOrg, ORG_A);
});

test('ensureUserInDb stamps request-resolved org over default', async (t) => {
  const { userDelegate } = stubDefaultOrg(t);
  let createOrg: string | undefined;

  userDelegate.upsert = async (args: any) => {
    createOrg = args.create?.organizationId;
    return {} as any;
  };

  await ensureUserInDb(
    { id: 'user-host', email: 'host@example.com' },
    {
      headers: {
        get: (name: string) => {
          if (name === 'x-wap-org-id') return ORG_A;
          if (name === 'x-wap-host') return 'partner.example.com';
          return null;
        },
      },
    },
  );

  assert.equal(createOrg, ORG_A);
});

test('ensureUserInDb ignores user-editable metadata when choosing a tenant', async (t) => {
  const { userDelegate } = stubDefaultOrg(t);
  let createOrg: string | undefined;
  userDelegate.upsert = async (args: any) => {
    createOrg = args.create?.organizationId;
    return {} as any;
  };

  await ensureUserInDb({
    id: 'user-untrusted-meta',
    email: 'untrusted@example.com',
    user_metadata: { organization_id: ORG_A },
  });

  assert.equal(createOrg, DEFAULT_ORG);
});

test('ensureUserInDb never overwrites an existing users.organizationId', async (t) => {
  const { userDelegate } = stubDefaultOrg(t);
  let updatePayload: unknown;

  userDelegate.upsert = async (args: any) => {
    updatePayload = args.update;
    return {} as any;
  };

  await ensureUserInDb(
    {
      id: 'user-existing',
      email: 'existing@example.com',
      user_metadata: { organization_id: ORG_A },
    },
    { organizationId: ORG_A },
  );

  assert.deepEqual(updatePayload, {});
});

test('ensureUserInDb never rebinds an existing identity after an email uniqueness conflict', async (t) => {
  const { userDelegate } = stubDefaultOrg(t);

  let upsertCalls: any[] = [];
  userDelegate.upsert = async (args: any) => {
    upsertCalls.push(args);
    if (upsertCalls.length === 1) {
      throw { code: 'P2002' };
    }
    return {} as any;
  };

  await assert.rejects(ensureUserInDb({ id: 'user-2', email: 'test2@example.com' }), /Account identity conflict/);

  assert.equal(upsertCalls.length, 1);
  assert.deepEqual(upsertCalls[0].where, { id: 'user-2' });
  assert.deepEqual(upsertCalls[0].update, {});
});

test('ensureUserInDb normalizes email without changing the authenticated identity', async (t) => {
  const { userDelegate } = stubDefaultOrg(t);
  let saved: any;
  userDelegate.upsert = async (args: any) => { saved = args; return {}; };
  await ensureUserInDb({ id: 'auth-original', email: '  MixedCase@Example.com  ' });
  assert.equal(saved.create.email, 'mixedcase@example.com');
  assert.equal(saved.create.id, 'auth-original');
  assert.deepEqual(saved.update, {});
});

test('ensureUserInDb - rethrows non-P2002 errors', async (t) => {
  const { userDelegate } = stubDefaultOrg(t);

  const testError = new Error('Database connection failed');
  userDelegate.upsert = async () => {
    throw testError;
  };

  await assert.rejects(
    ensureUserInDb({ id: 'user-3', email: 'test3@example.com' }),
    testError
  );
});
