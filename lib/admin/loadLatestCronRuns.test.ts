import test from 'node:test';
import assert from 'node:assert/strict';

import { buildLatestCronRunsQuery } from './loadLatestCronRuns';

test('latest cron runs are read with one DISTINCT ON query, newest start per job', () => {
  const query = buildLatestCronRunsQuery(['cron_coursera_b4b_sync', 'cron_at_risk_check']);
  assert.match(query.sql, /SELECT DISTINCT ON \(job_name\)/);
  assert.match(query.sql, /FROM cron_executions/);
  assert.match(query.sql, /WHERE job_name IN \(\?,\?\)/);
  assert.match(query.sql, /ORDER BY job_name, started_at DESC/);
  // Aliases match the CronRunSnapshot shape the health rows consume.
  assert.match(query.sql, /job_name AS "jobName"/);
  assert.match(query.sql, /started_at AS "startedAt"/);
  assert.match(query.sql, /completed_at AS "completedAt"/);
  // Job names are bound parameters, never interpolated into the SQL text.
  assert.deepEqual(query.values, ['cron_coursera_b4b_sync', 'cron_at_risk_check']);
  assert.doesNotMatch(query.sql, /cron_at_risk_check/);
});
