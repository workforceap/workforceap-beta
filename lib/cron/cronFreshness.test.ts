import test from 'node:test';
import assert from 'node:assert/strict';
import vercelConfig from '../../vercel.json';
import { cronFreshness, expectedIntervalMinutes } from './cronFreshness';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const NOW = new Date(Date.UTC(2026, 8, 23, 12, 0, 0));
const ago = (ms: number) => new Date(NOW.getTime() - ms);

test('expectedIntervalMinutes: every shape vercel.json uses', () => {
  assert.equal(expectedIntervalMinutes('*/10 * * * *'), 10);
  assert.equal(expectedIntervalMinutes('0 * * * *'), 60);
  assert.equal(expectedIntervalMinutes('15 * * * *'), 60);
  assert.equal(expectedIntervalMinutes('0 */6 * * *'), 360);
  assert.equal(expectedIntervalMinutes('30 */6 * * *'), 360);
  assert.equal(expectedIntervalMinutes('11 6 * * *'), 1440);
  assert.equal(expectedIntervalMinutes('53 18 * * 0'), 10080);
  assert.equal(expectedIntervalMinutes('7 13 * * 1'), 10080);
  assert.equal(expectedIntervalMinutes('31 14 1 * *'), 44640);
  // Days 1, 4, ... restart on the 1st, so no gap is longer than 3 days.
  assert.equal(expectedIntervalMinutes('7 11 */3 * *'), 3 * 1440);
});

test('expectedIntervalMinutes: a shape it cannot bound is null, never a guess', () => {
  assert.equal(expectedIntervalMinutes('0 9 * 1 *'), null);
  assert.equal(expectedIntervalMinutes('0 9 * * 1-5'), null);
  assert.equal(expectedIntervalMinutes('0 9 1 * 1'), null);
  assert.equal(expectedIntervalMinutes('*/0 * * * *'), null);
  assert.equal(expectedIntervalMinutes('61 * * * *'), null);
  assert.equal(expectedIntervalMinutes('not a cron'), null);
});

test('every vercel.json schedule has an expected interval (no exceptions)', () => {
  const unparsed = vercelConfig.crons
    .filter((c) => expectedIntervalMinutes(c.schedule) === null)
    .map((c) => `${c.path}: ${c.schedule}`);
  assert.deepEqual(unparsed, []);
});

test('an hourly job whose last success was 3 h ago is overdue; 1.5 h ago is ok', () => {
  const stale = ago(3 * HOUR);
  assert.equal(cronFreshness({ expr: '0 * * * *', lastSuccessAt: stale, lastRunAt: stale, now: NOW }), 'overdue');
  const fresh = ago(1.5 * HOUR);
  assert.equal(cronFreshness({ expr: '0 * * * *', lastSuccessAt: fresh, lastRunAt: fresh, now: NOW }), 'ok');
});

test('overdue is measured from the last success, not the last (failed) run', () => {
  assert.equal(
    cronFreshness({ expr: '0 * * * *', lastSuccessAt: ago(3 * HOUR), lastRunAt: ago(5 * 60 * 1000), now: NOW }),
    'overdue',
  );
});

test('a scheduled job with no rows is never_run', () => {
  assert.equal(cronFreshness({ expr: '0 * * * *', lastSuccessAt: null, lastRunAt: null, now: NOW }), 'never_run');
});

test('a weekly job whose last success was 8 days ago is ok; 15 days is overdue', () => {
  assert.equal(
    cronFreshness({ expr: '53 18 * * 0', lastSuccessAt: ago(8 * DAY), lastRunAt: ago(8 * DAY), now: NOW }),
    'ok',
  );
  assert.equal(
    cronFreshness({ expr: '53 18 * * 0', lastSuccessAt: ago(15 * DAY), lastRunAt: ago(15 * DAY), now: NOW }),
    'overdue',
  );
});

test('a job that has runs but no success at all is overdue', () => {
  assert.equal(
    cronFreshness({ expr: '11 6 * * *', lastSuccessAt: null, lastRunAt: ago(3 * DAY), now: NOW }),
    'overdue',
  );
});

test('a disabled job is not overdue', () => {
  assert.equal(
    cronFreshness({ expr: '0 * * * *', lastSuccessAt: ago(30 * DAY), lastRunAt: ago(HOUR), now: NOW, enabled: false }),
    'unknown',
  );
});

test('a job with no declared schedule, or one it cannot parse, is unknown', () => {
  assert.equal(cronFreshness({ expr: null, lastSuccessAt: ago(90 * DAY), lastRunAt: ago(90 * DAY), now: NOW }), 'unknown');
  assert.equal(
    cronFreshness({ expr: '0 9 * * 1-5', lastSuccessAt: ago(90 * DAY), lastRunAt: ago(90 * DAY), now: NOW }),
    'unknown',
  );
});
