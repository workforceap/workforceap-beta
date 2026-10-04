/**
 * Small real-PostgreSQL proof of the rehearsal's transaction context.
 * Does not push the app schema or replay any application migration.
 *
 * Requires a disposable loopback PostgreSQL 16 DB named wap_rls_proof:
 * SHADOW_DATABASE_URL=postgresql://...@127.0.0.1:5432/wap_rls_proof
 * FORCE_RLS_PROOF_ACK=disposable-local-postgres16
 * pnpm tsx scripts/p1/force-rls-context-proof.ts
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient, type Prisma } from '@prisma/client';
import type { GucContext } from '../../lib/db/gucContext';
import { isForceRlsDenial, runWithForceRlsContext } from './force-rls-context';

type ContextSnapshot = {
  userId: string | null;
  orgId: string | null;
  role: string | null;
  employerId: string | null;
  partnerId: string | null;
  pid: number;
};

async function readContext(client: Pick<Prisma.TransactionClient, '$queryRaw'>): Promise<ContextSnapshot> {
  const [row] = await client.$queryRaw<ContextSnapshot[]>`
    SELECT current_setting('app.current_user_id', true) AS "userId",
           current_setting('app.current_org_id', true) AS "orgId",
           current_setting('app.current_role', true) AS "role",
           current_setting('app.current_employer_id', true) AS "employerId",
           current_setting('app.current_partner_id', true) AS "partnerId",
           pg_backend_pid() AS pid
  `;
  return row;
}

function assertSnapshot(actual: ContextSnapshot, expected: GucContext, pid: number): void {
  assert.deepEqual(actual, {
    userId: expected.userId ?? '',
    orgId: expected.orgId ?? '',
    role: expected.role,
    employerId: expected.employerId ?? '',
    partnerId: expected.partnerId ?? '',
    pid,
  });
}

function fixtureIdentifier(name: string): string {
  assert.match(name, /^[a-z0-9_]+$/);
  return `"${name}"`;
}

async function main(): Promise<void> {
  assert.equal(process.env.FORCE_RLS_PROOF_ACK, 'disposable-local-postgres16',
    'Set FORCE_RLS_PROOF_ACK=disposable-local-postgres16 for this disposable-only proof');
  assert.ok(process.env.SHADOW_DATABASE_URL, 'SHADOW_DATABASE_URL is required');
  const target = new URL(process.env.SHADOW_DATABASE_URL);
  assert.ok(['postgres:', 'postgresql:'].includes(target.protocol), 'PostgreSQL URL required');
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname), 'Proof requires a loopback host');
  assert.equal(target.pathname, '/wap_rls_proof', 'Proof requires the disposable wap_rls_proof database');

  const id = randomUUID().replaceAll('-', '');
  const roleName = `rls_proof_${id}`;
  const role = fixtureIdentifier(roleName);
  const schemaName = `rls_proof_${id}`;
  const schema = fixtureIdentifier(schemaName);
  const table = `${schema}.org_records`;
  const password = randomUUID();
  const owner = new PrismaClient({ datasources: { db: { url: target.toString() } } });
  let actor: PrismaClient | undefined;
  let roleCreated = false;
  let schemaCreated = false;

  try {
    const [version] = await owner.$queryRaw<Array<{ version: string }>>`
      SELECT current_setting('server_version_num') AS version
    `;
    assert.equal(Math.floor(Number(version.version) / 10000), 16, 'PostgreSQL 16 is required');
    const [ownerRole] = await owner.$queryRaw<Array<{ superuser: boolean; bypass: boolean }>>`
      SELECT rolsuper AS superuser, rolbypassrls AS bypass FROM pg_roles WHERE rolname = current_user
    `;
    assert.ok(ownerRole.superuser || ownerRole.bypass, 'Disposable fixture owner must bypass RLS to observe denied/rolled-back writes');
    await owner.$executeRawUnsafe(`CREATE ROLE ${role} LOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT PASSWORD '${password}'`);
    roleCreated = true;
    await owner.$executeRawUnsafe(`CREATE SCHEMA ${schema}`);
    schemaCreated = true;
    await owner.$executeRawUnsafe(`CREATE TABLE ${table} (id text PRIMARY KEY, org_id text NOT NULL, user_id text NOT NULL)`);
    await owner.$executeRawUnsafe(`CREATE TABLE ${schema}.ungranted_records (id text PRIMARY KEY)`);
    // A minimal table for the existing generated UserRole model lets this
    // proof capture the model-write error path as well as raw P2010 errors.
    await owner.$executeRawUnsafe(`CREATE TABLE ${schema}.user_roles (
      user_id text NOT NULL, role_id text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, role_id))`);
    await owner.$executeRawUnsafe(`ALTER TABLE ${schema}.user_roles ENABLE ROW LEVEL SECURITY`);
    await owner.$executeRawUnsafe(`ALTER TABLE ${schema}.user_roles FORCE ROW LEVEL SECURITY`);
    await owner.$executeRawUnsafe(`CREATE POLICY model_fixture ON ${schema}.user_roles FOR ALL TO ${role}
      USING (user_id = NULLIF(current_setting('app.current_user_id', true), ''))
      WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', true), ''))`);
    await owner.$executeRawUnsafe(`INSERT INTO ${table} VALUES ('a', 'org-a', 'member-a'), ('b', 'org-b', 'member-b')`);
    await owner.$executeRawUnsafe(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
    await owner.$executeRawUnsafe(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`);
    // This policy exists only on the random disposable fixture table. It
    // proves the wrapper, not coverage or correctness of application policies.
    await owner.$executeRawUnsafe(`CREATE POLICY persona_fixture ON ${table} FOR ALL TO ${role}
      USING (org_id = NULLIF(current_setting('app.current_org_id', true), '')
         AND user_id = NULLIF(current_setting('app.current_user_id', true), '')
         AND current_setting('app.current_role', true) IN ('member', 'admin'))
      WITH CHECK (org_id = NULLIF(current_setting('app.current_org_id', true), '')
         AND user_id = NULLIF(current_setting('app.current_user_id', true), '')
         AND current_setting('app.current_role', true) IN ('member', 'admin'))`);
    await owner.$executeRawUnsafe(`GRANT USAGE ON SCHEMA ${schema} TO ${role}`);
    await owner.$executeRawUnsafe(`GRANT SELECT, INSERT, UPDATE, DELETE ON ${table} TO ${role}`);
    await owner.$executeRawUnsafe(`GRANT SELECT, INSERT, UPDATE, DELETE ON ${schema}.user_roles TO ${role}`);

    const actorUrl = new URL(target);
    actorUrl.username = roleName;
    actorUrl.password = password;
    actorUrl.searchParams.set('connection_limit', '1');
    actorUrl.searchParams.set('schema', schemaName);
    actor = new PrismaClient({ datasources: { db: { url: actorUrl.toString() } } });
    const [security] = await actor.$queryRaw<Array<{ superuser: boolean; bypass: boolean; enabled: boolean; forced: boolean }>>`
      SELECT r.rolsuper AS superuser, r.rolbypassrls AS bypass,
             c.relrowsecurity AS enabled, c.relforcerowsecurity AS forced
      FROM pg_roles r, pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE r.rolname = current_user AND n.nspname = ${schemaName} AND c.relname = 'org_records'
    `;
    assert.deepEqual(security, { superuser: false, bypass: false, enabled: true, forced: true });

    // Deliberately contaminate the session baseline. SET LOCAL must override
    // it during each transaction and restore it after commit or rollback.
    await actor.$executeRaw`
      SELECT set_config('app.current_user_id', 'session-user', false),
             set_config('app.current_org_id', 'session-org', false),
             set_config('app.current_role', 'session-role', false),
             set_config('app.current_employer_id', 'session-employer', false),
             set_config('app.current_partner_id', 'session-partner', false)
    `;
    const baseline = await readContext(actor);
    const memberA: GucContext = {
      userId: 'member-a', orgId: 'org-a', role: 'member',
      employerId: 'employer-a', partnerId: 'partner-a',
    };
    await runWithForceRlsContext(actor, memberA, async (tx) => {
      assertSnapshot(await readContext(tx), memberA, baseline.pid);
      assert.deepEqual(await tx.$queryRawUnsafe(`SELECT id FROM ${table} ORDER BY id`), [{ id: 'a' }]);
      await tx.$executeRawUnsafe(`INSERT INTO ${table} VALUES ($1, $2, $3)`, 'a-own', 'org-a', 'member-a');
      assertSnapshot(await readContext(tx), memberA, baseline.pid);
    });
    assert.deepEqual(await readContext(actor), baseline, 'commit must restore session baseline on the same connection');
    console.log('[rls-context-proof] PASS: all five GUCs/read/write use one NOBYPASSRLS transaction connection; commit restores baseline');

    const memberB: GucContext = { userId: 'member-b', orgId: 'org-b', role: 'member' };
    await runWithForceRlsContext(actor, memberB, async (tx) => {
      assertSnapshot(await readContext(tx), memberB, baseline.pid);
      assert.deepEqual(await tx.$queryRawUnsafe(`SELECT id FROM ${table} ORDER BY id`), [{ id: 'b' }]);
    });
    const anonymous: GucContext = { userId: null, orgId: null, role: 'anonymous' };
    await runWithForceRlsContext(actor, anonymous, async (tx) => {
      assertSnapshot(await readContext(tx), anonymous, baseline.pid);
      assert.deepEqual(await tx.$queryRawUnsafe(`SELECT id FROM ${table}`), []);
    });
    assert.deepEqual(await readContext(actor), baseline);
    console.log('[rls-context-proof] PASS: A/B/anonymous switches clear absent optional IDs and isolate visible rows');

    const sentinel = new Error('intentional proof rollback');
    await assert.rejects(runWithForceRlsContext(actor, memberA, async (tx) => {
      assertSnapshot(await readContext(tx), memberA, baseline.pid);
      await tx.$executeRawUnsafe(`INSERT INTO ${table} VALUES ($1, $2, $3)`, 'rolled-back', 'org-a', 'member-a');
      throw sentinel;
    }), (error) => error === sentinel);
    assert.deepEqual(await readContext(actor), baseline, 'rollback must restore session baseline on the same connection');
    assert.deepEqual(await owner.$queryRawUnsafe(`SELECT id FROM ${table} WHERE id = 'rolled-back'`), []);
    await runWithForceRlsContext(actor, memberA, async (tx) => {
      assert.deepEqual(await tx.$queryRawUnsafe(`SELECT id FROM ${table} WHERE id = 'rolled-back'`), []);
    });
    const quoted: GucContext = { userId: "member'; SELECT 'literal", orgId: "org'quoted", role: 'member' };
    await runWithForceRlsContext(actor, quoted, async (tx) => {
      assertSnapshot(await readContext(tx), quoted, baseline.pid);
    });
    assert.deepEqual(await readContext(actor), baseline);
    console.log('[rls-context-proof] PASS: rollback isolates data and persona state; quote-bearing values remain bound literals');

    await assert.rejects(runWithForceRlsContext(actor, memberA, async (tx) => {
      await tx.$executeRawUnsafe(`INSERT INTO ${table} VALUES ($1, $2, $3)`, 'cross-org', 'org-b', 'member-a');
    }), isForceRlsDenial, 'cross-org INSERT must produce a verified PostgreSQL RLS denial');
    assert.deepEqual(await readContext(actor), baseline);
    assert.deepEqual(await owner.$queryRawUnsafe(`SELECT id FROM ${table} WHERE id = 'cross-org'`), []);
    await runWithForceRlsContext(actor, memberB, async (tx) => {
      assert.deepEqual(await tx.$queryRawUnsafe(`SELECT id FROM ${table} WHERE id = 'cross-org'`), []);
    });
    for (const sql of [
      `SELECT * FROM ${schema}.missing_records`,
      `SELECT * FROM ${schema}.ungranted_records`,
      `INSERT INTO ${table} VALUES ('a', 'org-a', 'member-a')`,
    ]) {
      await assert.rejects(runWithForceRlsContext(actor, memberA, async (tx) => {
        await tx.$queryRawUnsafe(sql);
      }), (error) => !isForceRlsDenial(error), 'schema, GRANT and unique errors must not count as RLS denials');
    }
    assert.deepEqual(await readContext(actor), baseline);
    console.log('[rls-context-proof] PASS: real cross-org RLS denial accepted; schema/GRANT/unique failures rejected');

    await runWithForceRlsContext(actor, memberA, async (tx) => {
      assert.deepEqual(await tx.userRole.create({
        data: { userId: 'member-a', roleId: 'own-role' }, select: { userId: true },
      }), { userId: 'member-a' });
    });
    await assert.rejects(runWithForceRlsContext(actor, memberA, async (tx) => {
      await tx.userRole.create({ data: { userId: 'member-b', roleId: 'denied-role' }, select: { userId: true } });
    }), isForceRlsDenial, 'generated Prisma model INSERT must produce a verified RLS denial');
    assert.deepEqual(await owner.$queryRawUnsafe(`SELECT role_id FROM ${schema}.user_roles WHERE role_id = 'denied-role'`), []);
    assert.deepEqual(await readContext(actor), baseline);
    console.log('[rls-context-proof] PASS: generated Prisma model write permits own user and classifies real other-user RLS denial');
  } finally {
    await actor?.$disconnect();
    try {
      if (schemaCreated) await owner.$executeRawUnsafe(`DROP SCHEMA ${schema} CASCADE`);
      if (roleCreated) await owner.$executeRawUnsafe(`DROP ROLE ${role}`);
    } finally {
      await owner.$disconnect();
    }
  }
  console.log('[rls-context-proof] PASS: disposable fixture schema and role removed');
}

main().catch((error: unknown) => {
  // Prisma connection diagnostics may contain target details. The URL itself
  // and the random fixture role password are never printed by this script.
  console.error('[rls-context-proof] FAIL:', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
