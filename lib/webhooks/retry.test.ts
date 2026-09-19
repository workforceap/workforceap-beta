import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getNextRetryDelayMs,
  getNextRetryAt,
  markWebhookForRetry,
  getPendingRetryEvents,
  getWebhookStats,
} from './retry';
import { prisma } from '@/lib/db/prisma';

test('getNextRetryDelayMs returns correct backoff sequence', () => {
  assert.equal(getNextRetryDelayMs(0), 60_000);   // 1 min
  assert.equal(getNextRetryDelayMs(1), 300_000);  // 5 min
  assert.equal(getNextRetryDelayMs(2), 900_000);  // 15 min
  assert.equal(getNextRetryDelayMs(3), 3_600_000); // 1 hr
  assert.equal(getNextRetryDelayMs(4), null);     // max retries
  assert.equal(getNextRetryDelayMs(5), null);     // exceeded
});

test('getNextRetryAt returns future Date or null', () => {
  const before = Date.now();
  const result0 = getNextRetryAt(0);
  assert.ok(result0 instanceof Date);
  assert.ok(result0!.getTime() > before);
  assert.ok(result0!.getTime() <= before + 60_000 + 1000); // ~1 min

  const result4 = getNextRetryAt(4);
  assert.equal(result4, null);
});

test('markWebhookForRetry schedules retry when under max', async (t) => {
  const webhookDelegate = (prisma as any).webhookEvent;
  const originalUpdate = webhookDelegate.update;

  t.after(() => {
    webhookDelegate.update = originalUpdate;
  });

  let updateCalls: any[] = [];
  webhookDelegate.update = async (_args: any) => {
    updateCalls.push(_args);
    return { id: 'wh-1' };
  };

  const result = await markWebhookForRetry('wh-1', 1, 'Transient error');
  assert.equal(result, 'scheduled');
  assert.equal(updateCalls.length, 1);
  assert.equal(updateCalls[0].where.id, 'wh-1');
  assert.equal(updateCalls[0].data.status, 'retrying');
  assert.equal(updateCalls[0].data.retryCount, 2);
  assert.ok(updateCalls[0].data.nextRetryAt instanceof Date);
});

test('markWebhookForRetry marks dead_letter at max retries', async (t) => {
  const webhookDelegate = (prisma as any).webhookEvent;
  const originalUpdate = webhookDelegate.update;

  t.after(() => {
    webhookDelegate.update = originalUpdate;
  });

  let updateCalls: any[] = [];
  webhookDelegate.update = async (_args: any) => {
    updateCalls.push(_args);
    return { id: 'wh-2' };
  };

  const result = await markWebhookForRetry('wh-2', 4, 'Persistent failure');
  assert.equal(result, 'max_retries_exceeded');
  assert.equal(updateCalls.length, 1);
  assert.equal(updateCalls[0].data.status, 'dead_letter');
  assert.equal(updateCalls[0].data.errorMessage, 'Persistent failure');
  assert.equal(updateCalls[0].data.retryCount, 4);
});

test('getPendingRetryEvents queries with correct filters', async (t) => {
  const webhookDelegate = (prisma as any).webhookEvent;
  const originalFindMany = webhookDelegate.findMany;

  t.after(() => {
    webhookDelegate.findMany = originalFindMany;
  });

  let findArgs: any = null;
  webhookDelegate.findMany = async (args: any) => {
    findArgs = args;
    return [];
  };

  await getPendingRetryEvents('coursera', 25);
  assert.ok(findArgs);
  assert.equal(findArgs.where.status, 'retrying');
  assert.ok(findArgs.where.nextRetryAt.lte instanceof Date);
  assert.equal(findArgs.where.retryCount.lte, 4);
  assert.equal(findArgs.where.source, 'coursera');
  assert.equal(findArgs.take, 25);
  assert.deepEqual(findArgs.orderBy, { nextRetryAt: 'asc' });
});

test('getWebhookStats aggregates counts', async (t) => {
  const webhookDelegate = (prisma as any).webhookEvent;
  const originalCount = webhookDelegate.count;
  const originalGroupBy = webhookDelegate.groupBy;

  t.after(() => {
    webhookDelegate.count = originalCount;
    webhookDelegate.groupBy = originalGroupBy;
  });

  webhookDelegate.count = async () => 42;
  webhookDelegate.groupBy = async () => [
    { status: 'success', _count: { status: 30 } },
    { status: 'failed', _count: { status: 10 } },
    { status: 'retrying', _count: { status: 2 } },
  ];

  const stats = await getWebhookStats(new Date('2026-01-01'));
  assert.equal(stats.total, 42);
  assert.equal(stats.byStatus.success, 30);
  assert.equal(stats.byStatus.failed, 10);
  assert.equal(stats.byStatus.retrying, 2);
  assert.equal(stats.recentFailures, 42);
  assert.equal(stats.deadLetters, 42);
});
