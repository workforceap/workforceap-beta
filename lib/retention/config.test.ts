import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CSP_VIOLATION_BUCKET_RETENTION_DAYS,
  DEFAULT_UNMATCHED_XAPI_EVENT_RETENTION_DAYS,
  DEFAULT_WORKFLOW_DIAGNOSTIC_RETENTION_DAYS,
  UNMATCHED_XAPI_EVENT_RETENTION_DAYS,
  resolveUnmatchedXapiEventRetentionDays,
  EMAIL_FAILURE_SNAPSHOT_RETENTION_DAYS,
  RETENTION_TABLES,
  WORKFLOW_DIAGNOSTIC_RETENTION_DAYS,
  getCutoffDate,
  resolveWorkflowDiagnosticRetentionDays,
} from './config';

const byModel = (model: string) => {
  const entry = RETENTION_TABLES.find((table) => table.model === model);
  assert.ok(entry, `no retention entry for ${model}`);
  return entry;
};

test('WAP-17: workflow_diagnostics defaults to the pre-existing 90-day window when unset', () => {
  // A hard cut to 60 would purge the 60-90 day band in one pass before the
  // email-failure snapshot has run; the default must stay at 90.
  assert.equal(DEFAULT_WORKFLOW_DIAGNOSTIC_RETENTION_DAYS, 90);
  assert.equal(resolveWorkflowDiagnosticRetentionDays(undefined), 90);
  assert.equal(byModel('workflowDiagnostic').days, WORKFLOW_DIAGNOSTIC_RETENTION_DAYS);
  assert.equal(byModel('workflowDiagnostic').dateColumn, 'createdAt');
});

test('WORKFLOW_DIAGNOSTIC_RETENTION_DAYS overrides the window to the requested 30-60 day band', () => {
  assert.equal(resolveWorkflowDiagnosticRetentionDays('60'), 60);
  assert.equal(resolveWorkflowDiagnosticRetentionDays(' 45 '), 45);
  assert.equal(resolveWorkflowDiagnosticRetentionDays('30'), 30);
});

test('an invalid override falls back to 90 so a typo can never widen or zero the purge', () => {
  for (const bad of ['', '0', '-5', '60.5', 'sixty', '1e2', '0x3c', ' ']) {
    assert.equal(resolveWorkflowDiagnosticRetentionDays(bad), 90, JSON.stringify(bad));
  }
});

test('the window never drops below the cron_executions trim beside it', () => {
  assert.ok(WORKFLOW_DIAGNOSTIC_RETENTION_DAYS >= byModel('cronExecution').days);
});

test('the email-failure snapshot outlives the diagnostics rows it copies', () => {
  // scripts/snapshot-email-failures.ts is the evidence path for the 2026
  // delivery failures; shortening the source window must not shorten the copy.
  assert.ok(EMAIL_FAILURE_SNAPSHOT_RETENTION_DAYS > WORKFLOW_DIAGNOSTIC_RETENTION_DAYS);
});

test('WAP-36: CSP violation buckets are purged on their hour bucket after a rolling month', () => {
  // The table exists to triage the Report-Only soak; a month is more than the
  // week-long soak needs and matches the cron_executions trim beside it.
  assert.equal(CSP_VIOLATION_BUCKET_RETENTION_DAYS, 30);
  const entry = byModel('cspViolationBucket');
  assert.equal(entry.days, CSP_VIOLATION_BUCKET_RETENTION_DAYS);
  assert.equal(entry.days, byModel('cronExecution').days);
  assert.equal(entry.dateColumn, 'hourBucket');
  assert.match(entry.description, /no URLs, IPs or user agents/);
});

test('every retention entry has a positive integer window and a description', () => {
  for (const table of RETENTION_TABLES) {
    assert.ok(Number.isInteger(table.days) && table.days > 0, `${table.model} has a bad window`);
    assert.ok(table.description.length > 0, `${table.model} has no description`);
  }
});

test('getCutoffDate returns a midnight boundary the configured number of days back', () => {
  const cutoff = getCutoffDate(WORKFLOW_DIAGNOSTIC_RETENTION_DAYS);
  assert.equal(cutoff.getHours(), 0);
  assert.equal(cutoff.getMinutes(), 0);
  assert.equal(cutoff.getSeconds(), 0);
  assert.equal(cutoff.getMilliseconds(), 0);
  assert.ok(cutoff.getTime() < Date.now());
});

test('WAP-33: unmatched Coursera xAPI events keep the same window as the xapi_statements they came from', () => {
  // They are the only replay handle for a late-enrolling learner (the
  // statement row is marked processed on unmatched ingest), so the window
  // must not be shorter than the source statements' 365 days.
  assert.equal(DEFAULT_UNMATCHED_XAPI_EVENT_RETENTION_DAYS, 365);
  assert.equal(DEFAULT_UNMATCHED_XAPI_EVENT_RETENTION_DAYS, byModel('xapiStatement').days);
  assert.equal(resolveUnmatchedXapiEventRetentionDays(undefined), 365);
  assert.equal(UNMATCHED_XAPI_EVENT_RETENTION_DAYS, resolveUnmatchedXapiEventRetentionDays(process.env.UNMATCHED_XAPI_EVENT_RETENTION_DAYS));
});

test('UNMATCHED_XAPI_EVENT_RETENTION_DAYS overrides the window; invalid values fall back to 365', () => {
  assert.equal(resolveUnmatchedXapiEventRetentionDays('120'), 120);
  assert.equal(resolveUnmatchedXapiEventRetentionDays(' 45 '), 45);
  for (const bad of ['', '0', '-5', '60.5', 'ninety', '1e2', ' ']) {
    assert.equal(resolveUnmatchedXapiEventRetentionDays(bad), 365, JSON.stringify(bad));
  }
});
