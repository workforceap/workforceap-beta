import assert from 'node:assert/strict';
import test from 'node:test';

import { JOB_APPLICATIONS_EMPTY } from './jobApplicationsEmptyState';

test('job applications empty copy is honest and actionable', () => {
  assert.equal(JOB_APPLICATIONS_EMPTY.title, 'No applications yet');
  assert.ok(JOB_APPLICATIONS_EMPTY.description.length <= 140);
  assert.match(JOB_APPLICATIONS_EMPTY.description, /job board/i);
  assert.equal(JOB_APPLICATIONS_EMPTY.primaryCta.label, 'Add application');
  assert.equal(JOB_APPLICATIONS_EMPTY.secondaryCta.href, '/dashboard/jobs');
  assert.doesNotMatch(JOB_APPLICATIONS_EMPTY.description, /check back soon/i);
  assert.doesNotMatch(JOB_APPLICATIONS_EMPTY.description, /coming soon/i);
});

// The tracker and page rendering this copy are exercised in
// components/portal/JobApplicationsTracker.test.tsx and
// tests/app/job-applications-page.spec.tsx.
