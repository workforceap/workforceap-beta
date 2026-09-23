import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CRON_REGISTRY } from './cronRegistry';
import {
  CRON_JOB_NAME_BY_PATH,
  CRON_SCHEDULE_BY_JOB,
  buildCronScheduleKey,
  formatCronSchedule,
} from './cronScheduleKey';

type VercelCron = { path: string; schedule: string };
const vercelCrons = (
  JSON.parse(readFileSync(join(process.cwd(), 'vercel.json'), 'utf8')) as { crons: VercelCron[] }
).crons;

test('formatCronSchedule: every shape vercel.json uses, in UTC, to the minute', () => {
  assert.equal(formatCronSchedule('11 6 * * *'), 'Daily 6:11 AM UTC');
  assert.equal(formatCronSchedule('30 12 * * *'), 'Daily 12:30 PM UTC');
  assert.equal(formatCronSchedule('0 0 * * *'), 'Daily 12:00 AM UTC');
  assert.equal(formatCronSchedule('53 18 * * 0'), 'Sunday 6:53 PM UTC');
  assert.equal(formatCronSchedule('7 13 * * 1'), 'Monday 1:07 PM UTC');
  assert.equal(formatCronSchedule('19 22 * * 5'), 'Friday 10:19 PM UTC');
  assert.equal(formatCronSchedule('0 * * * *'), 'Hourly at :00 UTC');
  assert.equal(formatCronSchedule('15 * * * *'), 'Hourly at :15 UTC');
  assert.equal(formatCronSchedule('0 */6 * * *'), 'Every 6 hours at :00 UTC');
  assert.equal(formatCronSchedule('30 */6 * * *'), 'Every 6 hours at :30 UTC');
  assert.equal(formatCronSchedule('*/10 * * * *'), 'Every 10 minutes');
  assert.equal(formatCronSchedule('31 14 1 * *'), 'Monthly on the 1st, 2:31 PM UTC');
  assert.equal(formatCronSchedule('0 9 22 * *'), 'Monthly on the 22nd, 9:00 AM UTC');
  assert.equal(formatCronSchedule('7 11 */3 * *'), 'Every 3 days from the 1st of the month, 11:07 AM UTC');
});

test('formatCronSchedule: a shape it does not describe falls back to the raw expression, never a guess', () => {
  assert.equal(formatCronSchedule('0 9 * 1 *'), '0 9 * 1 * (UTC)');
  assert.equal(formatCronSchedule('0 9 * * 1-5'), '0 9 * * 1-5 (UTC)');
  assert.equal(formatCronSchedule('not a cron'), 'not a cron (UTC)');
});

test('every vercel.json cron path has a recorded-jobName entry, and no entry is stale', () => {
  assert.deepEqual(Object.keys(CRON_JOB_NAME_BY_PATH).sort(), vercelCrons.map((c) => c.path).sort());
});

test('the /admin/crons schedule key covers every job that records CronExecution rows', () => {
  for (const cron of vercelCrons) {
    const jobName = CRON_JOB_NAME_BY_PATH[cron.path];
    if (jobName === null) continue;
    assert.equal(CRON_SCHEDULE_BY_JOB[jobName], formatCronSchedule(cron.schedule), cron.path);
  }
});

test('buildCronScheduleKey skips paths that record no CronExecution and unknown paths', () => {
  const key = buildCronScheduleKey(
    [
      { path: '/api/cron/at-risk-check', schedule: '11 6 * * *' },
      { path: '/api/admin/webhooks/process-retries', schedule: '*/10 * * * *' },
      { path: '/api/cron/not-mapped', schedule: '0 1 * * *' },
    ],
    CRON_JOB_NAME_BY_PATH,
  );
  assert.deepEqual(key, { cron_at_risk_check: 'Daily 6:11 AM UTC' });
});

test('every registry scheduleLabel is the formatted schedule', () => {
  const drift = CRON_REGISTRY.filter((c) => c.scheduleLabel !== formatCronSchedule(c.schedule)).map(
    (c) => `${c.id}: "${c.scheduleLabel}" vs "${formatCronSchedule(c.schedule)}"`,
  );
  assert.deepEqual(drift, []);
});

/**
 * Registry workflowKeys that differ from the key the route passes to
 * withCronLogging / logCronRun. For these three the /admin/email-crons toggle
 * writes a setting the route never reads and the run history lookup finds
 * nothing. Fixing it changes what an existing toggle governs, so it is a
 * follow-up that needs a decision (X03 PR). This list may only shrink.
 */
const KNOWN_WORKFLOW_KEY_DRIFT = ['data-cleanup', 'milestone-cascade-draft', 'milestone-cascade-expire'];

test('registry workflowKey is the recorded jobName, except the known drift', () => {
  const drift = CRON_REGISTRY.filter((c) => CRON_JOB_NAME_BY_PATH[c.apiPath] !== c.workflowKey).map((c) => c.id);
  assert.deepEqual(drift.sort(), [...KNOWN_WORKFLOW_KEY_DRIFT].sort());
});
