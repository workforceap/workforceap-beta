import test from 'node:test';
import assert from 'node:assert/strict';

import { getGucContext, runWithGucContext, inTransactionStorage, buildGucContext, ANONYMOUS_GUC_CONTEXT } from './gucContext';
import {
  buildGucOutsideTransactionMessage,
  buildGucSql,
  isRlsStrictEnabled,
  requiresExplicitTransactionForGucContext,
  shouldRejectGucContextOutsideTransaction,
} from './prisma';

test('buildGucSql generates set_config statements', () => {
  const ctx = {
    userId: 'u-1',
    orgId: 'o-1',
    role: 'admin' as const,
    employerId: 'e-1',
    partnerId: 'p-1',
  };
  const sql = buildGucSql(ctx);
  assert.ok(sql.includes("set_config('app.current_user_id', 'u-1', true)"));
  assert.ok(sql.includes("set_config('app.current_org_id', 'o-1', true)"));
  assert.ok(sql.includes("set_config('app.current_role', 'admin', true)"));
  assert.ok(sql.includes("set_config('app.current_employer_id', 'e-1', true)"));
  assert.ok(sql.includes("set_config('app.current_partner_id', 'p-1', true)"));
});

test('buildGucSql handles anonymous context', () => {
  const sql = buildGucSql({ userId: null, orgId: null, role: 'anonymous' });
  assert.ok(sql.includes("set_config('app.current_user_id', '', true)"));
  assert.ok(sql.includes("set_config('app.current_org_id', '', true)"));
  assert.ok(sql.includes("set_config('app.current_role', 'anonymous', true)"));
});

test('buildGucSql handles system context', () => {
  const sql = buildGucSql({ userId: null, orgId: null, role: 'system' });
  assert.ok(sql.includes("set_config('app.current_role', 'system', true)"));
});

test('inTransactionStorage propagates across await boundaries', async () => {
  await inTransactionStorage.run(true, async () => {
    assert.equal(inTransactionStorage.getStore(), true);
    await Promise.resolve();
    assert.equal(inTransactionStorage.getStore(), true);
    await new Promise((resolve) => setTimeout(resolve, 1));
    assert.equal(inTransactionStorage.getStore(), true);
  });
});

test('runWithGucContext works alongside inTransactionStorage', async () => {
  const ctx = { userId: 'u-1', orgId: 'o-1', role: 'member' as const };
  await runWithGucContext(ctx, async () => {
    await inTransactionStorage.run(true, async () => {
      assert.deepEqual(getGucContext(), ctx);
      assert.equal(inTransactionStorage.getStore(), true);
    });
  });
});

test('active GUC context requires explicit transaction for Prisma operations', async () => {
  const ctx = { userId: 'u-1', orgId: 'o-1', role: 'member' as const };
  await runWithGucContext(ctx, async () => {
    assert.equal(requiresExplicitTransactionForGucContext(getGucContext(), false), true);
    assert.equal(requiresExplicitTransactionForGucContext(getGucContext(), true), false);
  });
});

test('missing GUC context does not require explicit transaction', () => {
  assert.equal(requiresExplicitTransactionForGucContext(getGucContext(), false), false);
});

test('buildGucContext maps forwarded user to member role by default', () => {
  const ctx = buildGucContext({ userId: 'fwd-user-1', orgId: null });
  assert.equal(ctx.userId, 'fwd-user-1');
  assert.equal(ctx.role, 'anonymous');
});

test('buildGucContext maps admin profileRole', () => {
  const ctx = buildGucContext({ userId: 'fwd-user-2', orgId: 'o-2', profileRole: 'admin' });
  assert.equal(ctx.role, 'admin');
  assert.equal(ctx.orgId, 'o-2');
});

test('ANONYMOUS_GUC_CONTEXT produces empty GUC sql', () => {
  const sql = buildGucSql(ANONYMOUS_GUC_CONTEXT);
  assert.ok(sql.includes("set_config('app.current_user_id', '', true)"));
  assert.ok(sql.includes("set_config('app.current_org_id', '', true)"));
  assert.ok(sql.includes("set_config('app.current_role', 'anonymous', true)"));
});

test('WAP_RLS_STRICT is opt-in: off unless exactly "true"', () => {
  assert.equal(isRlsStrictEnabled({}), false);
  assert.equal(isRlsStrictEnabled({ WAP_RLS_STRICT: '' }), false);
  assert.equal(isRlsStrictEnabled({ WAP_RLS_STRICT: 'false' }), false);
  assert.equal(isRlsStrictEnabled({ WAP_RLS_STRICT: '1' }), false);
  assert.equal(isRlsStrictEnabled({ WAP_RLS_STRICT: 'true' }), true);
});

test('strict mode rejects an active GUC context outside a transaction; default stays fail-open', () => {
  const ctx = { userId: 'u-1', orgId: 'o-1', role: 'member' as const };
  // default (strict off): never rejects, matches current prod owner-role behaviour
  assert.equal(shouldRejectGucContextOutsideTransaction(ctx, false, false), false);
  // strict on: rejects only when a context is active and we are not in a transaction
  assert.equal(shouldRejectGucContextOutsideTransaction(ctx, false, true), true);
  assert.equal(shouldRejectGucContextOutsideTransaction(ctx, true, true), false);
  assert.equal(shouldRejectGucContextOutsideTransaction(undefined, false, true), false);
});

test('GUC outside-transaction message names the model and action', () => {
  assert.match(buildGucOutsideTransactionMessage('User', 'findMany'), /Query "User\.findMany"/);
  assert.match(buildGucOutsideTransactionMessage(undefined, 'queryRaw'), /Query "raw\.queryRaw"/);
});
