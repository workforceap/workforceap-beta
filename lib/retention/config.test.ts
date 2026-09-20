import test from 'node:test';
import assert from 'node:assert/strict';

import {
  EMAIL_FAILURE_SNAPSHOT_RETENTION_DAYS,
  RETENTION_TABLES,
  WORKFLOW_DIAGNOSTIC_RETENTION_DAYS,
  getCutoffDate,
} from './config';

const byModel = (model: string) => {
  const entry = RETENTION_TABLES.find((table) => table.model === model);
  assert.ok(entry, `no retention entry for ${model}`);
  return entry;
};

test('WAP-17: workflow_diagnostics is trimmed inside the requested 30-60 day band', () => {
  assert.ok(
    WORKFLOW_DIAGNOSTIC_RETENTION_DAYS >= 30 && WORKFLOW_DIAGNOSTIC_RETENTION_DAYS <= 60,
    'the issue asks for a 30-60 day retention pass on the largest production table',
  );
  assert.equal(byModel('workflowDiagnostic').days, WORKFLOW_DIAGNOSTIC_RETENTION_DAYS);
  assert.equal(byModel('workflowDiagnostic').dateColumn, 'createdAt');
});

test('the diagnostics window is not longer than the webhook/portal log windows it sat above', () => {
  // Before WAP-17 this table was kept for 90 days — the same as the smaller
  // webhook/portal event logs — while `cron_executions` beside it was 30.
  assert.ok(WORKFLOW_DIAGNOSTIC_RETENTION_DAYS < byModel('webhookEvent').days);
  assert.ok(WORKFLOW_DIAGNOSTIC_RETENTION_DAYS < byModel('portalWorkflowEvent').days);
  assert.ok(WORKFLOW_DIAGNOSTIC_RETENTION_DAYS >= byModel('cronExecution').days);
});

test('the email-failure snapshot outlives the diagnostics rows it copies', () => {
  // scripts/snapshot-email-failures.ts is the evidence path for the 2026
  // delivery failures; shortening the source window must not shorten the copy.
  assert.ok(EMAIL_FAILURE_SNAPSHOT_RETENTION_DAYS > WORKFLOW_DIAGNOSTIC_RETENTION_DAYS);
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
