import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Prisma, PrismaClient } from '@prisma/client';
import { getGucContext, type GucContext } from '../../lib/db/gucContext';
import { isForceRlsDenial, runWithForceRlsContext } from './force-rls-context';

function transactionFixture(setupFailure?: Error) {
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  const events: string[] = [];
  const tx = {
    $executeRaw: async (parts: TemplateStringsArray, ...values: unknown[]) => {
      events.push('set-context');
      calls.push({ sql: parts.join('?'), values });
      if (setupFailure) throw setupFailure;
      return 1;
    },
  } as unknown as Prisma.TransactionClient;
  const client = {
    $transaction: async (callback: (connection: Prisma.TransactionClient) => Promise<unknown>) => {
      events.push('begin');
      try {
        const result = await callback(tx);
        events.push('commit');
        return result;
      } catch (error) {
        events.push('rollback');
        throw error;
      }
    },
  } as unknown as PrismaClient;
  return { client, tx, calls, events };
}

const member: GucContext = { userId: 'member-a', orgId: 'org-a', role: 'member' };

test('sets all five GUCs before the query on the same transaction connection', async () => {
  const fixture = transactionFixture();
  const context: GucContext = { ...member, employerId: 'employer-a', partnerId: 'partner-a' };
  const result = await runWithForceRlsContext(fixture.client, context, async (tx) => {
    fixture.events.push('query');
    assert.equal(tx, fixture.tx);
    assert.equal(getGucContext(), context);
    assert.equal(fixture.calls.length, 1);
    return 7;
  });
  assert.equal(result, 7);
  assert.deepEqual(fixture.events, ['begin', 'set-context', 'query', 'commit']);
  assert.deepEqual(fixture.calls[0].values, ['member-a', 'org-a', 'member', 'employer-a', 'partner-a']);
  for (const guc of ['user_id', 'org_id', 'role', 'employer_id', 'partner_id']) {
    assert.ok(fixture.calls[0].sql.includes(`set_config('app.current_${guc}', ?, true)`));
  }
  assert.equal(getGucContext(), undefined);
});

test('binds quote-bearing values and clears every absent identity including optional IDs', async () => {
  const fixture = transactionFixture();
  const hostileValue = "member'; SELECT 'still a value";
  await runWithForceRlsContext(fixture.client, { ...member, userId: hostileValue }, async () => undefined);
  await runWithForceRlsContext(fixture.client, {
    userId: null, orgId: null, role: 'anonymous', employerId: null,
  }, async () => undefined);
  assert.equal(fixture.calls[0].values[0], hostileValue);
  assert.ok(!fixture.calls[0].sql.includes(hostileValue));
  assert.deepEqual(fixture.calls[0].values.slice(3), ['', '']);
  assert.deepEqual(fixture.calls[1].values, ['', '', 'anonymous', '', '']);
});

test('persona switches replace all five values rather than carrying optional IDs forward', async () => {
  const fixture = transactionFixture();
  await runWithForceRlsContext(fixture.client, {
    ...member, employerId: 'employer-a', partnerId: 'partner-a',
  }, async () => undefined);
  await runWithForceRlsContext(fixture.client, {
    userId: 'member-b', orgId: 'org-b', role: 'member',
  }, async () => undefined);
  assert.deepEqual(fixture.calls[1].values, ['member-b', 'org-b', 'member', '', '']);
});

test('setup errors prevent the operation and operation errors roll back with ALS restored', async () => {
  const failure = new Error('cannot acquire context');
  const setup = transactionFixture(failure);
  await assert.rejects(runWithForceRlsContext(setup.client, member, async () => {
    assert.fail('operation must not run after setup failed');
  }), (error) => error === failure);
  assert.deepEqual(setup.events, ['begin', 'set-context', 'rollback']);

  const operation = transactionFixture();
  await assert.rejects(runWithForceRlsContext(operation.client, member, async () => {
    throw failure;
  }), (error) => error === failure);
  assert.deepEqual(operation.events, ['begin', 'set-context', 'rollback']);
  assert.equal(getGucContext(), undefined);
});

const rlsMessage = 'new row violates row-level security policy for table "jobs"';

test('accepts PostgreSQL and supported Prisma RLS-denial diagnostics', () => {
  assert.equal(isForceRlsDenial({ code: '42501', message: rlsMessage }), true);
  assert.equal(isForceRlsDenial({ code: 'P2010', meta: { code: '42501', message: rlsMessage } }), true);
  assert.equal(isForceRlsDenial({ code: 'P2004', meta: { database_error: rlsMessage } }), true);
  assert.equal(isForceRlsDenial({ code: 'P2004', meta: { database_error: { code: '42501', message: rlsMessage } } }), true);
  assert.equal(isForceRlsDenial(new Error(`ConnectorError(QueryError(PostgresError { code: "42501", message: "${rlsMessage}" }))`)), true);
  assert.equal(isForceRlsDenial({ code: '42501', message: 'new row violates row-level security policy "org_write" for table "jobs"' }), true);
  assert.equal(isForceRlsDenial({ code: '42501', message: 'new row violates row-level security policy "org_write" (USING expression) for table "jobs"' }), true);
});

test('rejects infrastructure, schema, table permissions, unique constraints and unverified text', () => {
  const errors: unknown[] = [
    null,
    rlsMessage,
    new Error(rlsMessage),
    { code: '42501', message: 'permission denied for table jobs' },
    { code: 'P2010', meta: { code: '42501', message: 'permission denied for schema public' } },
    { code: 'P2010', meta: { code: '42P01', message: 'relation jobs does not exist' } },
    { code: 'P2002', message: rlsMessage, meta: { target: ['id'] } },
    { code: 'P2004', meta: { database_error: 'violates check constraint jobs_status_check' } },
    { code: 'P2004', message: rlsMessage, meta: { database_error: 'unrelated constraint' } },
    { code: '42501', message: 'query would be affected by row-level security policy for table "jobs"' },
    { code: 'P1001', message: 'Cannot reach database server' },
    { code: 'P2028', message: 'Transaction timed out' },
    { code: 'P2010', meta: { code: '23505', message: rlsMessage } },
  ];
  for (const error of errors) assert.equal(isForceRlsDenial(error), false, JSON.stringify(error));
});
