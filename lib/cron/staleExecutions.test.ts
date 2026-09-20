import test from 'node:test';
import assert from 'node:assert/strict';
import { failStaleCronExecutions, STALE_CRON_EXECUTION_MS } from './staleExecutions';

test('sweeps only RUNNING rows older than the threshold into FAILED: timeout', async () => {
  const calls: unknown[] = [];
  const db = { cronExecution: { updateMany: async (args: unknown) => { calls.push(args); return { count: 2 }; } } } as any;
  const now = new Date('2026-09-20T12:00:00Z');
  const result = await failStaleCronExecutions({ now, db });
  assert.equal(result.failed, 2);
  assert.equal(result.thresholdMinutes, 15);
  assert.equal(result.cutoff, new Date(now.getTime() - STALE_CRON_EXECUTION_MS).toISOString());
  const [args] = calls as any[];
  assert.equal(args.where.status, 'RUNNING');
  assert.equal(args.where.startedAt.lt.toISOString(), result.cutoff);
  assert.equal(args.data.status, 'FAILED');
  assert.equal(args.data.completedAt, now);
  assert.match(args.data.errorMessage, /timeout: still RUNNING after 15 minutes/);
});

test('threshold override changes the cutoff and the message', async () => {
  let captured: any;
  const db = { cronExecution: { updateMany: async (args: unknown) => { captured = args; return { count: 0 }; } } } as any;
  const result = await failStaleCronExecutions({ db, thresholdMs: 60 * 60 * 1000 });
  assert.equal(result.failed, 0);
  assert.equal(result.thresholdMinutes, 60);
  assert.match(captured.data.errorMessage, /60 minutes/);
});
