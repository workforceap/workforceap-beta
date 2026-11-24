import test from 'node:test';
import assert from 'node:assert/strict';
import { newJobApplicationHtml } from './new-job-application';

test('names the job, applicant and application id', () => {
  const html = newJobApplicationHtml({
    jobTitle: 'Help Desk Technician',
    applicantName: 'Ada Lovelace',
    applicantEmail: 'ada@example.org',
    applicationId: 'app-22',
  });
  assert.match(html, /Help Desk Technician/);
  assert.match(html, /Ada Lovelace/);
  assert.match(html, /ada@example\.org/);
  assert.match(html, /app-22/);
});

test('escapes untrusted job and applicant fields', () => {
  const html = newJobApplicationHtml({
    jobTitle: '<script>job()</script>',
    applicantName: '<img src=x onerror=1>',
    applicantEmail: '" onclick="alert(1)',
    applicationId: '<b>id</b>',
  });
  assert.doesNotMatch(html, /<script>/);
  assert.doesNotMatch(html, /<img /);
  assert.doesNotMatch(html, /<b>id<\/b>/);
  assert.match(html, /&lt;script&gt;job\(\)&lt;\/script&gt;/);
  assert.match(html, /&lt;img src=x onerror=1&gt;/);
  assert.match(html, /&quot; onclick=&quot;alert\(1\)/);
  assert.match(html, /&lt;b&gt;id&lt;\/b&gt;/);
});
