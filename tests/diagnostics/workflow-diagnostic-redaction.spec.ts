/**
 * `workflow_diagnostics` is an operations table, not a member-data store.
 * `metadata.templateParams` (a rendered email's payload) is redacted key-by-key
 * before a generic row is written; everything else in the metadata is written
 * as given. The email failure record (WAP-163) opts out so the admin resend
 * route can replay its payload — whether that snapshot should keep recipient
 * and subject is an open retention decision, not one taken here.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db/prisma', () => ({
  prisma: { workflowDiagnostic: { create: vi.fn() } },
}));

import { prisma } from '@/lib/db/prisma';
import { recordWorkflowDiagnostic, redactDiagnosticMetadata } from '@/lib/diagnostics';
import { PERSONAL_DATA_KEY, redactMetadataKeys } from '@/lib/security/redactMetadata';
import { redactActivityMetadata } from '@/lib/admin/memberActivity';
import { buildEmailFailureMetadata, parseEmailFailureMetadata } from '@/lib/email/failureRecord';

const writtenMetadata = (index = 0) =>
  vi.mocked(prisma.workflowDiagnostic.create).mock.calls[index][0].data.metadata;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.workflowDiagnostic.create).mockResolvedValue({ id: 'diag-1' } as never);
});

describe('recordWorkflowDiagnostic', () => {
  it('redacts contact / address / secret keys inside templateParams before a generic row is written', async () => {
    await recordWorkflowDiagnostic({
      workflow: 'some_workflow',
      status: 'error',
      summary: 'Template render failed',
      metadata: {
        template: 'course_kickoff',
        templateParams: {
          fullName: 'Ada Lovelace',
          programName: 'IT Support',
          email: 'ada@example.org',
          phone: '512-555-0100',
          address: { line1: '1 Main St' },
          nested: { contactEmail: 'ada@example.org', count: 2 },
          items: [{ phoneNumber: '512-555-0101', slug: 'it-support' }],
          resetToken: 'tok_secret',
          password: 'hunter2',
        },
      },
    });

    expect(writtenMetadata()).toEqual({
      template: 'course_kickoff',
      templateParams: {
        fullName: 'Ada Lovelace',
        programName: 'IT Support',
        email: '[redacted]',
        phone: '[redacted]',
        address: '[redacted]',
        nested: { contactEmail: '[redacted]', count: 2 },
        items: [{ phoneNumber: '[redacted]', slug: 'it-support' }],
        resetToken: '[redacted]',
        password: '[redacted]',
      },
    });
    const serialized = JSON.stringify(writtenMetadata());
    for (const value of ['ada@example.org', '512-555-010', '1 Main St', 'tok_secret', 'hunter2']) {
      expect(serialized).not.toContain(value);
    }
  });

  it('writes the email failure record verbatim so it stays resendable', async () => {
    // Mirrors lib/email/send.ts#recordEmailFailure: the WAP-163 record opts
    // out of redaction because the admin resend route replays templateParams.
    const failure = buildEmailFailureMetadata(
      { to: 'ada@example.org', subject: 'Next steps', template: { name: 'course_kickoff', params: { to: 'ada@example.org', fullName: 'Ada Lovelace', programName: 'IT Support' } } },
      new Error('network'),
      new Date('2026-09-21T12:00:00Z'),
    );
    await recordWorkflowDiagnostic({
      workflow: 'email_send',
      status: 'error',
      summary: 'Email send failed: course_kickoff (network)',
      metadata: { ...failure },
      retainTemplateParams: true,
    });

    const stored = parseEmailFailureMetadata(writtenMetadata());
    expect(stored.templateParams).toEqual({ to: 'ada@example.org', fullName: 'Ada Lovelace', programName: 'IT Support' });
    expect(stored.resendable).toBe(true);
    expect(stored.template).toBe('course_kickoff');
  });

  it('writes metadata without templateParams unchanged and no metadata as undefined', async () => {
    await recordWorkflowDiagnostic({
      workflow: 'discord_notification',
      status: 'fallback',
      summary: 'dropped',
      metadata: { category: 'ops', retryAfterMs: 1200, dropped: 3 },
    });
    await recordWorkflowDiagnostic({ workflow: 'password_reset', status: 'fallback', summary: 'fell back' });
    expect(writtenMetadata(0)).toEqual({ category: 'ops', retryAfterMs: 1200, dropped: 3 });
    expect(writtenMetadata(1)).toBeUndefined();
  });

  it('does not mutate the caller metadata object', () => {
    const input = { templateParams: { email: 'a@example.org' }, other: 1 };
    const out = redactDiagnosticMetadata(input);
    expect(input.templateParams.email).toBe('a@example.org');
    expect(out).toEqual({ templateParams: { email: '[redacted]' }, other: 1 });
  });
});

describe('redactMetadataKeys (shared helper)', () => {
  it('is the same implementation the Activity tab uses, with its own key set there', () => {
    const value = { email: 'a@example.org', address: '1 Main St', token: 't', count: 1 };
    expect(redactActivityMetadata(value)).toEqual({ email: '[redacted]', address: '1 Main St', token: '[redacted]', count: 1 });
    expect(redactMetadataKeys(value, PERSONAL_DATA_KEY)).toEqual({
      email: '[redacted]', address: '[redacted]', token: '[redacted]', count: 1,
    });
  });

  it('leaves names and recipient keys alone under the generic key set', () => {
    expect(redactMetadataKeys({ to: 'x', fullName: 'Ada', total: 4 }, PERSONAL_DATA_KEY)).toEqual({
      to: 'x', fullName: 'Ada', total: 4,
    });
  });
});
