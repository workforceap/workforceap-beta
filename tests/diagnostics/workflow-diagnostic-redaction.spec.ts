/**
 * `workflow_diagnostics` is an operations table, not a member-data store.
 * `metadata.templateParams` (the email wrapper payload a failed send records)
 * is redacted key-by-key before the row is written; everything else in the
 * metadata is written as given.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db/prisma', () => ({
  prisma: { workflowDiagnostic: { create: vi.fn() } },
}));

import { prisma } from '@/lib/db/prisma';
import { recordWorkflowDiagnostic, redactDiagnosticMetadata } from '@/lib/diagnostics';
import { PERSONAL_DATA_KEY, containsRedactedValue, redactMetadataKeys } from '@/lib/security/redactMetadata';
import { redactActivityMetadata } from '@/lib/admin/memberActivity';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.workflowDiagnostic.create).mockResolvedValue({ id: 'diag-1' } as never);
});

describe('recordWorkflowDiagnostic', () => {
  it('redacts personal-data keys inside templateParams before the row is written', async () => {
    await recordWorkflowDiagnostic({
      workflow: 'email_send',
      status: 'error',
      summary: 'Email send failed: course_kickoff (network)',
      metadata: {
        template: 'course_kickoff',
        recipientHash: 'abc123',
        recipientDomain: 'example.org',
        templateParams: {
          to: 'ada@example.org',
          fullName: 'Ada Lovelace',
          programName: 'IT Support',
          phone: '512-555-0100',
          address: { line1: '1 Main St' },
          nested: { contactEmail: 'ada@example.org', count: 2 },
          items: [{ memberName: 'Ada', slug: 'it-support' }],
          resetToken: 'tok_secret',
          stage: 'day10',
        },
      },
    });

    const row = vi.mocked(prisma.workflowDiagnostic.create).mock.calls[0][0].data;
    expect(row.metadata).toEqual({
      template: 'course_kickoff',
      recipientHash: 'abc123',
      recipientDomain: 'example.org',
      templateParams: {
        to: '[redacted]',
        fullName: '[redacted]',
        programName: '[redacted]',
        phone: '[redacted]',
        address: '[redacted]',
        nested: { contactEmail: '[redacted]', count: 2 },
        items: [{ memberName: '[redacted]', slug: 'it-support' }],
        resetToken: '[redacted]',
        stage: 'day10',
      },
    });
    const serialized = JSON.stringify(row.metadata);
    for (const value of ['ada@example.org', 'Lovelace', '512-555-0100', '1 Main St', 'tok_secret']) {
      expect(serialized).not.toContain(value);
    }
  });

  it('writes metadata without templateParams unchanged and no metadata as undefined', async () => {
    await recordWorkflowDiagnostic({
      workflow: 'discord_notification',
      status: 'fallback',
      summary: 'dropped',
      metadata: { category: 'ops', retryAfterMs: 1200, dropped: 3 },
    });
    await recordWorkflowDiagnostic({ workflow: 'password_reset', status: 'fallback', summary: 'fell back' });
    const [first, second] = vi.mocked(prisma.workflowDiagnostic.create).mock.calls.map((c) => c[0].data);
    expect(first.metadata).toEqual({ category: 'ops', retryAfterMs: 1200, dropped: 3 });
    expect(second.metadata).toBeUndefined();
  });

  it('does not mutate the caller metadata object', () => {
    const input = { templateParams: { to: 'a@example.org' }, other: 1 };
    const out = redactDiagnosticMetadata(input);
    expect(input.templateParams.to).toBe('a@example.org');
    expect(out).toEqual({ templateParams: { to: '[redacted]' }, other: 1 });
  });
});

describe('redactMetadataKeys (shared helper)', () => {
  it('is the same implementation the Activity tab uses, with a narrower key set there', () => {
    const value = { email: 'a@example.org', fullName: 'Ada', token: 't', count: 1 };
    expect(redactActivityMetadata(value)).toEqual({ email: '[redacted]', fullName: 'Ada', token: '[redacted]', count: 1 });
    expect(redactMetadataKeys(value, PERSONAL_DATA_KEY)).toEqual({
      email: '[redacted]', fullName: '[redacted]', token: '[redacted]', count: 1,
    });
  });

  it('matches recipient keys exactly, not keys that merely contain them', () => {
    expect(redactMetadataKeys({ to: 'x', cc: 'y', bcc: 'z', total: 4, tomorrow: 'd' }, PERSONAL_DATA_KEY)).toEqual({
      to: '[redacted]', cc: '[redacted]', bcc: '[redacted]', total: 4, tomorrow: 'd',
    });
  });

  it('containsRedactedValue finds the marker at any depth', () => {
    expect(containsRedactedValue({ a: [{ b: '[redacted]' }] })).toBe(true);
    expect(containsRedactedValue({ a: [{ b: 'fine' }], c: 2 })).toBe(false);
    expect(containsRedactedValue(null)).toBe(false);
  });
});
