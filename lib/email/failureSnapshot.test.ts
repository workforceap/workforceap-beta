import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  EMAIL_FAILURE_STATUSES,
  isEmailFailureDiagnostic,
  snapshotRunLabel,
  toEmailFailureSnapshotRow,
  type EmailFailureDiagnosticSource,
} from './failureSnapshot';
import { buildEmailFailureMetadata, recipientHash } from './failureRecord';

const CRLF = 'Header keys and values cannot contain carriage return, line feed, or null characters';

function diagnostic(overrides: Partial<EmailFailureDiagnosticSource> = {}): EmailFailureDiagnosticSource {
  return {
    id: 'diag-1',
    workflow: 'email_send',
    status: 'error',
    actorUserId: null,
    entityType: null,
    entityId: null,
    summary: 'Email send failed: "We Miss You"',
    provider: 'resend',
    method: null,
    fallbackPath: null,
    failureReason: CRLF,
    metadata: { to: ['member@example.org'], subject: 'We Miss You' },
    createdAt: new Date('2026-07-03T09:00:00.000Z'),
    ...overrides,
  };
}

describe('email failure snapshot mapping', () => {
  it('keeps only email_send rows in a failure status', () => {
    assert.deepEqual([...EMAIL_FAILURE_STATUSES], ['error', 'errored', 'failed']);
    assert.equal(isEmailFailureDiagnostic({ workflow: 'email_send', status: 'error' }), true);
    assert.equal(isEmailFailureDiagnostic({ workflow: 'email_send', status: 'failed' }), true);
    assert.equal(isEmailFailureDiagnostic({ workflow: 'email_send', status: 'success' }), false);
    assert.equal(isEmailFailureDiagnostic({ workflow: 'cron_weekly_recap', status: 'error' }), false);
  });

  it('copies a historical { to, subject } row verbatim and derives hash, domain and class', () => {
    const row = toEmailFailureSnapshotRow(diagnostic(), 'snapshot-test');
    assert.equal(row.sourceDiagnosticId, 'diag-1');
    assert.equal(row.workflow, 'email_send');
    assert.equal(row.status, 'error');
    assert.equal(row.summary, 'Email send failed: "We Miss You"');
    assert.equal(row.failureReason, CRLF);
    assert.deepEqual(row.metadata, { to: ['member@example.org'], subject: 'We Miss You' });
    assert.equal(row.templateKey, null);
    assert.equal(row.errorClass, 'unknown');
    assert.equal(row.retryable, true);
    assert.equal(row.recipientHash, null, 'legacy rows carry no hash and the copy does not invent one');
    assert.equal(row.recipientDomain, 'example.org');
    assert.equal(row.diagnosticCreatedAt.toISOString(), '2026-07-03T09:00:00.000Z');
    assert.equal(row.snapshotRun, 'snapshot-test');
  });

  it('reads template, class and hashed recipient from a typed failure record', () => {
    const metadata = buildEmailFailureMetadata(
      { to: 'Ada@Example.org', subject: 'Hello', template: { name: 'applicant_followup', params: { to: 'Ada@Example.org' } } },
      new Error(CRLF),
      new Date('2026-09-20T12:00:00.000Z'),
    );
    const row = toEmailFailureSnapshotRow(
      diagnostic({ id: 'diag-2', entityType: 'email_template', entityId: 'applicant_followup', metadata: JSON.parse(JSON.stringify(metadata)) }),
      'snapshot-test',
    );
    assert.equal(row.templateKey, 'applicant_followup');
    assert.equal(row.errorClass, 'header_invalid');
    assert.equal(row.retryable, true);
    assert.equal(row.recipientHash, recipientHash('ada@example.org'));
    assert.equal(row.recipientDomain, 'example.org');
  });

  it('falls back to the diagnostic entity id for the template key and tolerates null metadata', () => {
    const row = toEmailFailureSnapshotRow(
      diagnostic({ entityType: 'email_template', entityId: 'course_kickoff', metadata: null }),
      'snapshot-test',
    );
    assert.equal(row.templateKey, 'course_kickoff');
    assert.equal(row.metadata, null);
    assert.equal(row.recipientDomain, null);
    assert.equal(row.errorClass, 'unknown');
  });

  it('labels a run by its timestamp', () => {
    assert.equal(snapshotRunLabel(new Date('2026-09-20T18:00:00.000Z')), 'snapshot-2026-09-20T18:00:00.000Z');
  });
});
