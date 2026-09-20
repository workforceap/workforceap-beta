import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

/**
 * Complete inventory of scheduled entrypoints that can reach an email provider.
 * `bulk` entries can issue multiple provider requests and must share the cron pacer.
 * `single` entries aggregate recipients into one provider request per invocation, so
 * adding a pacer would not change provider request rate. Delegated helpers are listed
 * explicitly so route-only scans cannot miss sends hidden outside route.ts.
 */
const scheduledEmailInventory = {
  '/api/cron/applicant-followup': { kind: 'bulk', helpers: [] },
  '/api/cron/applicant-aging-digest': { kind: 'single', helpers: [], reason: 'one staff digest request with a recipient array' },
  '/api/cron/at-risk-alerts': { kind: 'bulk', helpers: ['lib/cron/at-risk-alerts.ts'] },
  '/api/cron/course-accountability': { kind: 'bulk', helpers: [] },
  '/api/cron/coursera-auto-heal': { kind: 'bulk', helpers: ['lib/xapi/reprocess.ts', 'lib/coursera/replayPendingXapi.ts', 'lib/xapi/inboundStatementPipeline.ts', 'lib/member/courseCompletion.ts', 'lib/notifications/partner-notify.ts', 'lib/xapi/mappings.ts'] },
  '/api/cron/coursera-training-sync': { kind: 'bulk', helpers: ['lib/coursera/replayPendingXapi.ts', 'lib/xapi/inboundStatementPipeline.ts', 'lib/member/courseCompletion.ts', 'lib/notifications/partner-notify.ts', 'lib/xapi/mappings.ts'] },
  '/api/cron/inactive-nudge': { kind: 'bulk', helpers: [] },
  '/api/cron/inactivity-nudge': { kind: 'bulk', helpers: [] },
  '/api/cron/interview-reminders': { kind: 'bulk', helpers: [] },
  '/api/cron/onboarding-stalls': { kind: 'single', helpers: [], reason: 'one admin digest request with a recipient array' },
  '/api/cron/employer-pending-applicants': { kind: 'bulk', helpers: [] },
  '/api/cron/job-expiry': { kind: 'bulk', helpers: [] },
  '/api/cron/job-alerts': { kind: 'bulk', helpers: [] },
  '/api/cron/milestone-celebration': { kind: 'bulk', helpers: [] },
  '/api/cron/partner-outcome-digest': { kind: 'bulk', helpers: [] },
  '/api/cron/placement-survey': { kind: 'bulk', helpers: ['lib/cron/placement-surveys.ts'] },
  '/api/cron/weekly-recap': { kind: 'bulk', helpers: [] },
  '/api/cron/weekly-recap-email': { kind: 'single', helpers: [], reason: 'one platform-admin recap request' },
  '/api/cron/wioa-report': { kind: 'single', helpers: [], reason: 'one monthly report request' },
} as const;

type CronConfig = { crons: Array<{ path: string; schedule: string }> };
const config = JSON.parse(readFileSync('vercel.json', 'utf8')) as CronConfig;
const emailCallPattern = /\b(?:send[A-Za-z0-9_]*Email|sendBrandedEmail)\s*\(/g;

function routePath(cronPath: string): string {
  return `app${cronPath}/route.ts`;
}

function sourceFor(cronPath: keyof typeof scheduledEmailInventory): string {
  const item = scheduledEmailInventory[cronPath];
  return [routePath(cronPath), ...item.helpers]
    .map((path) => readFileSync(path, 'utf8'))
    .join('\n');
}

function recursivelyFindScheduledEmailCalls(entrypoint: string): string[] {
  const visited = new Set<string>();
  const found: string[] = [];
  const visit = (path: string) => {
    if (visited.has(path) || !existsSync(path)) return;
    visited.add(path);
    const source = readFileSync(path, 'utf8');
    if (emailCallPattern.test(source)) found.push(path);
    emailCallPattern.lastIndex = 0;
    for (const match of source.matchAll(/from\s+['"]@\/(lib\/(?:cron|member|milestoneCascade|coursera|xapi|notifications)\/[^'"]+)['"]/g)) {
      const modulePath = match[1];
      for (const candidate of [`${modulePath}.ts`, `${modulePath}/index.ts`]) visit(candidate);
    }
  };
  visit(entrypoint);
  return found.sort();
}

test('inventory covers every scheduled entrypoint and delegated helper that sends email', () => {
  const discovered = new Map<string, string[]>();
  for (const cron of config.crons) {
    const calls = recursivelyFindScheduledEmailCalls(routePath(cron.path));
    if (calls.length > 0) discovered.set(cron.path, calls);
  }
  assert.deepEqual([...discovered.keys()].sort(), Object.keys(scheduledEmailInventory).sort());
  for (const [cronPath, callPaths] of discovered) {
    const documented = new Set([routePath(cronPath), ...scheduledEmailInventory[cronPath as keyof typeof scheduledEmailInventory].helpers]);
    assert.deepEqual(callPaths, [...documented].filter((path) => callPaths.includes(path)).sort(), `${cronPath} has an undocumented delegated email helper`);
  }
});

test('every actual bulk email cron uses one shared bounded pacer', () => {
  for (const [cronPath, item] of Object.entries(scheduledEmailInventory)) {
    if (item.kind !== 'bulk') continue;
    const source = sourceFor(cronPath as keyof typeof scheduledEmailInventory);
    assert.match(source, /createBulkEmailCronPacer/, `${cronPath} must use the shared bulk email pacer`);
    assert.doesNotMatch(readFileSync(routePath(cronPath), 'utf8'), /setTimeout\s*\(/, `${cronPath} must not carry a local pacing loop`);
  }
});

test('single-request cron exemptions are documented and do not loop provider sends', () => {
  for (const [cronPath, item] of Object.entries(scheduledEmailInventory)) {
    if (item.kind !== 'single') continue;
    assert.ok(item.reason.length > 10, `${cronPath} needs a specific single-request justification`);
    const source = sourceFor(cronPath as keyof typeof scheduledEmailInventory);
    assert.equal((source.match(emailCallPattern) ?? []).length, 1, `${cronPath} is no longer a single provider-request case`);
  }
});

test('all scheduled bulk email crons run off the top of the hour', () => {
  const bulkPaths = new Set(Object.entries(scheduledEmailInventory).filter(([, item]) => item.kind === 'bulk').map(([path]) => path));
  for (const cron of config.crons.filter((entry) => bulkPaths.has(entry.path))) {
    assert.notEqual(cron.schedule.split(/\s+/)[0], '0', `${cron.path} remains scheduled at :00`);
  }
});

test('inactive nudge reports fixture/deadline pacing skips separately from failures', () => {
  const source = readFileSync('app/api/cron/inactive-nudge/route.ts', 'utf8');
  assert.match(source, /skipped/);
  assert.match(source, /result\.skipped/);
  assert.match(source, /inactiveEmailsSkipped/);
});


test('bulk cron result accounting preserves fixture skips instead of flattening them to failures', () => {
  const inactivity = readFileSync('app/api/cron/inactivity-nudge/route.ts', 'utf8');
  assert.match(inactivity, /delivery\.skipped/);
  assert.match(inactivity, /skipped\+\+/);
  const partner = readFileSync('app/api/cron/partner-outcome-digest/route.ts', 'utf8');
  assert.match(partner, /sendResult\.skipped/);
  assert.match(partner, /!r\.skipped/);
  const surveys = readFileSync('lib/cron/placement-surveys.ts', 'utf8');
  assert.match(surveys, /result\.skipped/);
  assert.doesNotMatch(surveys, /emailFailures\.push\([\s\S]*?fixture_recipient/);
});

test('job alerts report in-app processing separately from accepted email delivery', () => {
  const source = readFileSync('app/api/cron/job-alerts/route.ts', 'utf8');
  assert.match(source, /notificationsCreated/);
  assert.match(source, /emailsAccepted/);
  assert.match(source, /delivery\.ok/);
});


test('first-seen unmatched actor alert is awaited through the delegated pacer', () => {
  const source = readFileSync('lib/xapi/mappings.ts', 'utf8');
  assert.match(source, /await notifyIfNewUnmatchedActorEmail\s*\(/);
  assert.match(source, /runBulkEmailOperation\s*\(\(\)\s*=>\s*sendCourseraUnmatchedActorAlertEmail/);
  assert.doesNotMatch(source, /void notifyIfNewUnmatchedActorEmail\s*\(/);
});
