import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CRON_REGISTRY } from './cronRegistry';

function duplicates(values: string[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const v of values) {
    if (seen.has(v)) dupes.add(v);
    seen.add(v);
  }
  return [...dupes];
}

test('every cron is registered once: ids are unique (they are React keys on /admin/email-crons)', () => {
  assert.deepEqual(duplicates(CRON_REGISTRY.map((c) => c.id)), []);
});

test('workflow keys are unique so a toggle or activate-all writes one record per cron', () => {
  assert.deepEqual(duplicates(CRON_REGISTRY.map((c) => c.workflowKey)), []);
});

test('at-risk-alerts is still registered exactly once', () => {
  assert.equal(CRON_REGISTRY.filter((c) => c.id === 'at-risk-alerts').length, 1);
});

// ── Parity with vercel.json (X03) ────────────────────────────────────────
// vercel.json is what Vercel actually schedules. The registry is what
// /admin/email-crons shows and what "Run now" / the toggles act on, so a
// schedule shown there must be the deployed one.

type VercelCron = { path: string; schedule: string };
const vercelCrons = (
  JSON.parse(readFileSync(join(process.cwd(), 'vercel.json'), 'utf8')) as { crons: VercelCron[] }
).crons;
const vercelScheduleByPath = new Map(vercelCrons.map((c) => [c.path, c.schedule]));

/**
 * Scheduled /api/cron routes deliberately absent from the registry, so they
 * have no toggle or "Run now" on /admin/email-crons. Adding one is a product
 * decision (job-alerts is a member email in the M08 lane). This list may only
 * shrink.
 */
const SCHEDULED_BUT_NOT_IN_REGISTRY = ['/api/cron/job-alerts', '/api/cron/retention-decisions'];

test('vercel.json schedules each cron path once', () => {
  assert.deepEqual(duplicates(vercelCrons.map((c) => c.path)), []);
});

test('every registry job is scheduled in vercel.json', () => {
  const unscheduled = CRON_REGISTRY.filter((c) => !vercelScheduleByPath.has(c.apiPath)).map((c) => c.apiPath);
  assert.deepEqual(unscheduled, []);
});

test('every registry schedule is the one vercel.json deploys', () => {
  const drift = CRON_REGISTRY.filter((c) => vercelScheduleByPath.get(c.apiPath) !== c.schedule).map(
    (c) => `${c.id}: registry "${c.schedule}" vs vercel.json "${vercelScheduleByPath.get(c.apiPath)}"`,
  );
  assert.deepEqual(drift, []);
});

test('every scheduled /api/cron route is in the registry, except the listed exceptions', () => {
  const registered = new Set(CRON_REGISTRY.map((c) => c.apiPath));
  const unregistered = vercelCrons
    .map((c) => c.path)
    .filter((p) => p.startsWith('/api/cron/') && !registered.has(p))
    .sort();
  assert.deepEqual(unregistered, [...SCHEDULED_BUT_NOT_IN_REGISTRY].sort());
});
