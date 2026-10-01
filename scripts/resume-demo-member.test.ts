/**
 * MOCKED unit tests for the disposable DEMO acceptance member. No Supabase,
 * database or network is touched: every dependency is an in-memory fake.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import type { PrismaClient } from '@prisma/client';
import {
  cleanupFixture,
  createFixture,
  generatePassword,
  isAuthNotFound,
  liveDeps,
  resolveCleanupInput,
  syntheticIdentity,
  type FixtureDeps,
  type FixtureState,
} from './resume-demo-member';
import { readPortalQaTarget } from './lib/portal-qa-guard.cjs';
import guard from './lib/supabase-project-guard.cjs';

const { DEMO_REF, PROD_REF } = guard as { DEMO_REF: string; PROD_REF: string };
const TARGET = { organizationId: 'qa-org', organizationSlug: 'portal-qa-test', databaseUrl: 'postgresql://unused' };
const OTHER_ID = '11111111-1111-4111-8111-111111111111';
const NEW_ID = '22222222-2222-4222-8222-222222222222';

type FakeOrganization = { id: string; slug: string; active: boolean };

function fakeDeps(organizations: FakeOrganization[] = [{ id: 'qa-org', slug: 'portal-qa-test', active: true }]) {
  const calls: string[] = [];
  const erasureClaims: string[] = [];
  const users = new Map<string, { id: string; email: string; organizationId: string; resumeOriginalPath: string | null; resumeEnhancedPath: string | null }>([
    [OTHER_ID, { id: OTHER_ID, email: 'member-test@workforceap.org', organizationId: 'qa-org', resumeOriginalPath: `${OTHER_ID}/resume-original.pdf`, resumeEnhancedPath: null }],
  ]);
  const authUsers = new Map<string, { id: string; email: string | null; appMetadata: Record<string, unknown> }>([
    [OTHER_ID, { id: OTHER_ID, email: 'member-test@workforceap.org', appMetadata: { portal_qa_fixture: true } }],
  ]);
  // bucket/path keys; one foreign object per bucket that cleanup must never touch.
  const objects = new Set<string>([
    `member-resumes/${OTHER_ID}/resume-original.pdf`,
    `member-files/cert-files/${OTHER_ID}/proof.pdf`,
  ]);
  const removeErrors = new Map<string, string>();
  const storage = {
    storage: {
      from: (bucket: string) => ({
        list: async (dir?: string) => {
          const prefix = `${bucket}/${dir}/`;
          const names = new Map<string, boolean>();
          for (const key of objects) {
            if (!key.startsWith(prefix)) continue;
            const rest = key.slice(prefix.length);
            const [head, ...tail] = rest.split('/');
            names.set(head, tail.length > 0 || names.get(head) === true);
          }
          return { data: [...names].map(([name, folder]) => ({ name, id: folder ? null : `id-${name}` })), error: null };
        },
        remove: async (paths: string[]) => {
          calls.push(`remove:${bucket}:${paths.join(',')}`);
          const failure = removeErrors.get(bucket);
          if (failure) return { data: null, error: { message: failure } };
          for (const path of paths) objects.delete(`${bucket}/${path}`);
          return { data: null, error: null };
        },
      }),
    },
  };
  const deps: FixtureDeps = {
    findOrganization: async (id) => organizations.find((org) => org.id === id) ?? null,
    countActivePortalQaOrganizations: async () =>
      organizations.filter((org) => org.active && org.slug.startsWith('portal-qa-')).length,
    findUserIdByEmail: async (email) => [...users.values()].find((user) => user.email === email)?.id ?? null,
    findUserById: async (id) => users.get(id) ?? null,
    createMember: async ({ id, organizationId, email }) => {
      calls.push(`createMember:${id}`);
      users.set(id, { id, email, organizationId, resumeOriginalPath: null, resumeEnhancedPath: null });
    },
    deleteUser: async (id) => { calls.push(`deleteUser:${id}`); users.delete(id); },
    createAuthUser: async ({ email, appMetadata }) => {
      calls.push(`createAuthUser:${email}`);
      authUsers.set(NEW_ID, { id: NEW_ID, email, appMetadata });
      return NEW_ID;
    },
    getAuthUser: async (id) => authUsers.get(id) ?? null,
    deleteAuthUser: async (id) => { calls.push(`deleteAuthUser:${id}`); authUsers.delete(id); },
    storage,
    sleep: async () => {},
    claimAgreementErasure: async (id) => { erasureClaims.push(id); },
  };
  return { deps, calls, users, authUsers, objects, removeErrors, erasureClaims };
}

test('[mock] the DEMO target guard refuses production and needs no role passwords', () => {
  const env: NodeJS.ProcessEnv = {
    NODE_ENV: 'test',
    PORTAL_QA_TARGET: 'demo',
    NEXT_PUBLIC_SUPABASE_URL: `https://${DEMO_REF}.supabase.co`,
    POSTGRES_PRISMA_URL: `postgresql://postgres:example@db.${DEMO_REF}.supabase.co:5432/postgres`,
    SUPABASE_SERVICE_ROLE_KEY: 'test-only-admin-key',
    PORTAL_QA_ORGANIZATION_ID: 'qa-org',
    PORTAL_QA_ORGANIZATION_SLUG: 'portal-qa-test',
  };
  assert.equal(readPortalQaTarget(env).organizationId, 'qa-org');
  assert.throws(() => readPortalQaTarget({ ...env, NEXT_PUBLIC_SUPABASE_URL: `https://${PROD_REF}.supabase.co` }));
  assert.throws(() => readPortalQaTarget({ ...env, VERCEL_ENV: 'production' }));
});

test('[mock] identity is unmistakably synthetic and the password is per-run random', () => {
  assert.equal(syntheticIdentity('123456789', '2').email, 'resume-qa-123456789-2@example.com');
  assert.throws(() => syntheticIdentity('abc', '1'));
  const password = generatePassword();
  assert.equal(password.length, 32);
  assert.notEqual(password, generatePassword());
});

test('[mock] create writes the marker before the Auth call, records the Auth ID before the database write, and touches no other account', async () => {
  const { deps, calls, users } = fakeDeps();
  let recorded: FixtureState | null = null;
  const state = await createFixture(TARGET, syntheticIdentity('42', '1'), 'x'.repeat(32), deps, (s) => { recorded = s; }, (marker) => {
    calls.push(`marker:${marker.email}`);
  });
  assert.deepEqual(recorded, state);
  assert.equal(state.userId, NEW_ID);
  assert.deepEqual(calls, ['marker:resume-qa-42-1@example.com', 'createAuthUser:resume-qa-42-1@example.com', `createMember:${NEW_ID}`]);
  assert.equal(users.get(OTHER_ID)?.email, 'member-test@workforceap.org');
});

test('[mock] create refuses a wrong organization and an existing member for the run', async () => {
  const { deps, calls } = fakeDeps();
  await assert.rejects(() => createFixture({ ...TARGET, organizationSlug: 'workforceap' }, syntheticIdentity('42', '1'), 'p', deps, () => {}));
  await createFixture(TARGET, syntheticIdentity('42', '1'), 'p', deps, () => {});
  await assert.rejects(() => createFixture(TARGET, syntheticIdentity('42', '1'), 'p', deps, () => {}));
  assert.equal(calls.filter((call) => call.startsWith('createAuthUser')).length, 1);
});

test('[mock] cleanup removes only the recorded member, its own objects, DB row and Auth user', async () => {
  const { deps, calls, users, authUsers, objects, erasureClaims } = fakeDeps();
  const state = await createFixture(TARGET, syntheticIdentity('42', '1'), 'p', deps, () => {});
  objects.add(`member-resumes/${NEW_ID}/resume-original-a.pdf`);
  objects.add(`member-resumes/${NEW_ID}/resume-enhanced-b.txt`);
  calls.length = 0;

  const result = await cleanupFixture(TARGET, state, deps);
  assert.deepEqual(erasureClaims, [NEW_ID]);

  assert.deepEqual(result, {
    storage: { before: { 'member-resumes': 2, 'member-files': 0 }, removed: 2, after: { 'member-resumes': 0, 'member-files': 0 } },
    authAbsenceVerified: true,
    prismaUserAbsenceVerified: true,
    authUserDeleted: true,
    databaseUserDeleted: true,
  });
  assert.deepEqual(calls, [
    `remove:member-resumes:${NEW_ID}/resume-original-a.pdf,${NEW_ID}/resume-enhanced-b.txt`,
    `deleteAuthUser:${NEW_ID}`,
    `deleteUser:${NEW_ID}`,
  ]);
  assert.ok(users.has(OTHER_ID) && authUsers.has(OTHER_ID));
  assert.ok(objects.has(`member-resumes/${OTHER_ID}/resume-original.pdf`) && objects.has(`member-files/cert-files/${OTHER_ID}/proof.pdf`));
});

test('[mock] live cleanup wires the real erasure fence to the validated DEMO client, including DATABASE_URL fallback', async () => {
  const env: NodeJS.ProcessEnv = {
    NODE_ENV: 'test', PORTAL_QA_TARGET: 'demo',
    NEXT_PUBLIC_SUPABASE_URL: `https://${DEMO_REF}.supabase.co`,
    DATABASE_URL: `postgresql://postgres:example@db.${DEMO_REF}.supabase.co:5432/postgres`,
    SUPABASE_SERVICE_ROLE_KEY: 'test-only-admin-key',
    PORTAL_QA_ORGANIZATION_ID: 'qa-org', PORTAL_QA_ORGANIZATION_SLUG: 'portal-qa-test',
  };
  const { databaseUrl, ...targetOrganization } = readPortalQaTarget(env);
  assert.ok(databaseUrl);
  const target = { ...targetOrganization, databaseUrl };
  const queries: Array<{ sql: string; values: unknown[] }> = [];
  let constructedUrl: string | undefined;
  let disconnected = false;
  let claimed = true;
  const client = {
    $queryRaw: async (sql: TemplateStringsArray, ...values: unknown[]) => {
      queries.push({ sql: sql.join('?'), values });
      return sql.join('?').includes('to_regclass')
        ? [{ submissions: 'enrollment_agreement_submissions', locks: 'enrollment_agreement_operation_locks' }]
        : [{ memberExists: true, claimed }];
    },
    $disconnect: async () => { disconnected = true; },
  } as unknown as PrismaClient;
  const { deps, close } = liveDeps(target, env, {
    createPrismaClient: (databaseUrl) => { constructedUrl = databaseUrl; return client; },
  });
  try {
    assert.equal(constructedUrl, target.databaseUrl);
    assert.equal(constructedUrl, env.DATABASE_URL);
    assert.ok(deps.claimAgreementErasure);
    await deps.claimAgreementErasure(NEW_ID);
    assert.equal(queries.length, 2);
    assert.match(queries[0].sql, /to_regclass/);
    assert.match(queries[1].sql, /INSERT INTO enrollment_agreement_operation_locks/);
    assert.equal(queries[1].values[0], NEW_ID);

    // This is the real claim logic, not a stub that silently accepts uploads.
    claimed = false;
    await assert.rejects(() => deps.claimAgreementErasure!(NEW_ID), { code: 'AGREEMENT_UPLOAD_IN_PROGRESS' });
    assert.equal(queries.length, 4);
  } finally {
    await close();
  }
  assert.equal(disconnected, true);
});

test('[mock] a blocked erasure fence preserves storage, Auth and database records', async () => {
  const { deps, calls, users, authUsers, objects } = fakeDeps();
  const state = await createFixture(TARGET, syntheticIdentity('42', '1'), 'p', deps, () => {});
  objects.add(`member-resumes/${NEW_ID}/resume-original.pdf`);
  objects.add(`member-files/enrollment-agreements/${NEW_ID}/agreement.pdf`);
  calls.length = 0;
  let claimedId: string | undefined;
  deps.claimAgreementErasure = async (id) => {
    claimedId = id;
    throw new Error('An enrollment upload still owns its fence.');
  };

  await assert.rejects(() => cleanupFixture(TARGET, state, deps), /storage cleanup failed/);
  assert.equal(claimedId, NEW_ID);
  assert.deepEqual(calls, []);
  assert.ok(users.has(NEW_ID) && authUsers.has(NEW_ID));
  assert.ok(objects.has(`member-resumes/${NEW_ID}/resume-original.pdf`));
  assert.ok(objects.has(`member-files/enrollment-agreements/${NEW_ID}/agreement.pdf`));
});

test('[mock] cleanup refuses state that points at any non-synthetic account', async () => {
  const { deps, calls } = fakeDeps();
  const forged: FixtureState[] = [
    { userId: OTHER_ID, email: 'member-test@workforceap.org', organizationId: 'qa-org', runId: '42-1' },
    { userId: OTHER_ID, email: 'resume-qa-42-1@example.com', organizationId: 'qa-org', runId: '42-1' },
    { userId: NEW_ID, email: 'resume-qa-42-1@example.com', organizationId: 'another-org', runId: '42-1' },
    { userId: 'not-a-uuid', email: 'resume-qa-42-1@example.com', organizationId: 'qa-org', runId: '42-1' },
  ];
  for (const state of forged) await assert.rejects(() => cleanupFixture(TARGET, state, deps));
  assert.deepEqual(calls, []);
});

test('[mock] cleanup after a failed database write still removes the recorded Auth user', async () => {
  const { deps, calls, authUsers } = fakeDeps();
  let recorded: FixtureState | null = null;
  const failing = { ...deps, createMember: async () => { throw new Error('db down'); } };
  await assert.rejects(() => createFixture(TARGET, syntheticIdentity('7', '1'), 'p', failing, (s) => { recorded = s; }));
  assert.ok(recorded);
  calls.length = 0;
  const result = await cleanupFixture(TARGET, recorded!, deps);
  assert.deepEqual(result, {
    storage: { before: { 'member-resumes': 0, 'member-files': 0 }, removed: 0, after: { 'member-resumes': 0, 'member-files': 0 } },
    authAbsenceVerified: true,
    prismaUserAbsenceVerified: true,
    authUserDeleted: true,
    databaseUserDeleted: false,
  });
  assert.deepEqual(calls, [`deleteAuthUser:${NEW_ID}`]);
  assert.ok(authUsers.has(OTHER_ID));
});

test('[mock] create fails closed unless the inputs name the only active portal-qa org; cleanup needs the exact org', async () => {
  const cases: Array<[string, FakeOrganization[]]> = [
    ['missing', []],
    ['wrong slug', [{ id: 'qa-org', slug: 'portal-qa-other', active: true }]],
    ['inactive', [{ id: 'qa-org', slug: 'portal-qa-test', active: false }]],
    ['duplicate portal-qa orgs', [
      { id: 'qa-org', slug: 'portal-qa-test', active: true },
      { id: 'qa-org-2', slug: 'portal-qa-second', active: true },
    ]],
  ];
  const state: FixtureState = { userId: NEW_ID, email: 'resume-qa-42-1@example.com', organizationId: 'qa-org', runId: '42-1' };
  for (const [label, organizations] of cases) {
    const { deps, calls } = fakeDeps(organizations);
    await assert.rejects(() => createFixture(TARGET, syntheticIdentity('42', '1'), 'p', deps, () => {}), Error, label);
    if (label !== 'duplicate portal-qa orgs') {
      await assert.rejects(() => cleanupFixture(TARGET, state, deps), Error, label);
    }
    assert.deepEqual(calls, [], label);
  }
  // An inactive second portal-qa org does not block the run.
  const { deps } = fakeDeps([
    { id: 'qa-org', slug: 'portal-qa-test', active: true },
    { id: 'old', slug: 'portal-qa-retired', active: false },
  ]);
  await createFixture(TARGET, syntheticIdentity('42', '1'), 'p', deps, () => {});
});

test('[mock] a storage remove error is surfaced and keeps the database and Auth rows for a retry', async () => {
  const { deps, calls, users, authUsers, objects, removeErrors } = fakeDeps();
  const state = await createFixture(TARGET, syntheticIdentity('42', '1'), 'p', deps, () => {});
  objects.add(`member-resumes/${NEW_ID}/resume-original-a.pdf`);
  removeErrors.set('member-resumes', 'permission denied');
  calls.length = 0;

  await assert.rejects(() => cleanupFixture(TARGET, state, deps), /storage cleanup failed/);

  assert.deepEqual(calls, [`remove:member-resumes:${NEW_ID}/resume-original-a.pdf`]);
  assert.ok(users.has(NEW_ID) && authUsers.has(NEW_ID));
  assert.ok(objects.has(`member-resumes/${NEW_ID}/resume-original-a.pdf`));
});

test('[mock] only an explicit user_not_found code counts as an absent Auth user', () => {
  assert.equal(isAuthNotFound({ status: 404, code: 'user_not_found' }), true);
  assert.equal(isAuthNotFound({ code: 'user_not_found' }), true);
  // A bare 404 (e.g. a misrouted admin endpoint) fails closed.
  for (const error of [{ status: 404 }, { status: 404, code: 'not_found' }, { status: 500 }, { status: 403, code: 'not_admin' }, { status: 401 }, null]) {
    assert.equal(isAuthNotFound(error), false);
  }
});

test('[mock] an Auth lookup error (500/permission) fails cleanup with the exact IDs and leaves Prisma untouched', async () => {
  const { deps, calls, users } = fakeDeps();
  const state = await createFixture(TARGET, syntheticIdentity('42', '1'), 'p', deps, () => {});
  calls.length = 0;
  const failing = { ...deps, getAuthUser: async () => { throw new Error('500 from Auth'); } };

  await assert.rejects(() => cleanupFixture(TARGET, state, failing), (error: Error) => {
    assert.match(error.message, /Auth lookup/);
    assert.match(error.message, new RegExp(`userId=${NEW_ID}`));
    return true;
  });
  assert.deepEqual(calls, []);
  assert.ok(users.has(NEW_ID));
});

test('[mock] a transient Auth lookup error is retried and cleanup then succeeds', async () => {
  const { deps, users, authUsers } = fakeDeps();
  const state = await createFixture(TARGET, syntheticIdentity('42', '1'), 'p', deps, () => {});
  let failures = 1;
  const flaky = {
    ...deps,
    getAuthUser: async (id: string) => {
      if (failures > 0) { failures -= 1; throw new Error('503 from Auth'); }
      return deps.getAuthUser(id);
    },
  };
  const result = await cleanupFixture(TARGET, state, flaky);
  assert.equal(result.authAbsenceVerified, true);
  assert.ok(!users.has(NEW_ID) && !authUsers.has(NEW_ID));
});

test('[mock] if the Auth user survives deletion, the Prisma row is kept for a rerun', async () => {
  const { deps, calls, users } = fakeDeps();
  const state = await createFixture(TARGET, syntheticIdentity('42', '1'), 'p', deps, () => {});
  calls.length = 0;
  const stubborn = { ...deps, deleteAuthUser: async (id: string) => { calls.push(`deleteAuthUser:${id}`); } };

  await assert.rejects(() => cleanupFixture(TARGET, state, stubborn), /Auth user still present/);
  assert.deepEqual(calls, [`deleteAuthUser:${NEW_ID}`]);
  assert.ok(!calls.some((call) => call.startsWith("deleteUser:")));
  assert.ok(users.has(NEW_ID));
});

test('[mock] cleanup input: marker plus missing or unreadable state fails closed with exact-email recovery', () => {
  const marker = JSON.stringify({ runId: '42-1', email: 'resume-qa-42-1@example.com', organizationId: 'qa-org' });
  for (const state of [null, '{', JSON.stringify({ userId: NEW_ID })]) {
    assert.throws(() => resolveCleanupInput(marker, state), (error: Error) => {
      assert.match(error.message, /exact email resume-qa-42-1@example\.com/);
      assert.match(error.message, /Never delete by pattern/);
      return true;
    });
  }
  // An unreadable marker still fails closed, without guessing an email.
  assert.throws(() => resolveCleanupInput('{', null), /<unreadable marker>/);
});

test('[mock] cleanup input: no marker and no state is informational ONLY when create stopped at the target guard', () => {
  assert.deepEqual(resolveCleanupInput(null, null, JSON.stringify({ stage: 'target-guard' })), { kind: 'stopped-before-clients', failedStage: 'target-guard' });
  assert.deepEqual(resolveCleanupInput(null, null, JSON.stringify({ stage: 'key-probe' })), { kind: 'stopped-before-clients', failedStage: 'key-probe' });
  const state = { userId: NEW_ID, email: 'resume-qa-42-1@example.com', organizationId: 'qa-org', runId: '42-1' };
  assert.deepEqual(resolveCleanupInput(JSON.stringify({ runId: '42-1', email: state.email, organizationId: 'qa-org' }), JSON.stringify(state)), { kind: 'state', state });
});

test('[mock] cleanup input: no marker past the target guard, or with no stage, fails closed with recovery text', () => {
  assert.throws(
    () => resolveCleanupInput(null, null, JSON.stringify({ stage: 'clients', email: 'resume-qa-42-1@example.com' })),
    (error: Error) => {
      assert.match(error.message, /exact email resume-qa-42-1@example\.com/);
      assert.match(error.message, /Never delete by pattern/);
      return true;
    },
  );
  for (const stage of [null, '{', JSON.stringify({ stage: 'something-else' })]) {
    assert.throws(() => resolveCleanupInput(null, null, stage), /Manual recovery: .*resume-qa-<run id>-<run attempt>@example\.com.*Never delete by pattern/);
  }
});

test('[mock] the helper target guard accepts a database URL exactly when the shared projectForUrl says demo', () => {
  // readPortalQaTarget must delegate to scripts/lib/supabase-project-guard.cjs
  // rather than parse URLs itself, so any fix to projectForUrl (for example the
  // Prisma `host=` socket override) is inherited here unchanged.
  const { projectForUrl } = guard as { projectForUrl: (value: string, kind?: string) => string };
  const urls = [
    `postgresql://postgres:pw@db.${DEMO_REF}.supabase.co:5432/postgres`,
    `postgres://postgres.${DEMO_REF}:pw@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1`,
    `postgres://postgres:pw@aws-1-us-east-2.pooler.supabase.com:6543/postgres?options=reference%3D${DEMO_REF}`,
    `postgresql://postgres:pw@db.${DEMO_REF}.supabase.co:5432/postgres?host=/var/run/postgresql`,
    `postgresql://postgres:pw@db.${DEMO_REF}.supabase.co:5432/postgres?host=db.${PROD_REF}.supabase.co`,
    `postgresql://postgres:pw@db.${PROD_REF}.supabase.co:5432/postgres`,
    `postgres://postgres.${PROD_REF}:pw@aws-0-us-east-1.pooler.supabase.com:6543/postgres`,
    'postgresql://postgres:pw@localhost:5432/postgres',
    'not a url',
  ];
  for (const url of urls) {
    const env = {
      NODE_ENV: 'test',
      PORTAL_QA_TARGET: 'demo',
      NEXT_PUBLIC_SUPABASE_URL: `https://${DEMO_REF}.supabase.co`,
      POSTGRES_PRISMA_URL: url,
      SUPABASE_SERVICE_ROLE_KEY: 'unused',
      PORTAL_QA_ORGANIZATION_ID: 'qa-org',
      PORTAL_QA_ORGANIZATION_SLUG: 'portal-qa-test',
    } as NodeJS.ProcessEnv;
    let accepted: string | null = null;
    try {
      accepted = (readPortalQaTarget(env) as { databaseUrl: string }).databaseUrl;
    } catch (error) {
      assert.match((error as Error).message, /database URL must identify the approved demo project/, url);
    }
    assert.equal(accepted !== null, projectForUrl(url) === 'demo', url);
    // The URL handed on (to PrismaClient) is exactly the one the guard classified.
    if (accepted !== null) assert.equal(accepted, url);
  }
});

