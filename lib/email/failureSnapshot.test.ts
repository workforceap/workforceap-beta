import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  EMAIL_FAILURE_STATUSES,
  emailFailureDiagnosticWhere,
  isEmailFailureDiagnostic,
  mirrorResendOntoEmailFailureSnapshot,
  snapshotEmailFailures,
  snapshotEmailFailuresByDiagnosticId,
  snapshotRunLabel,
  toEmailFailureSnapshotCreateData,
  toEmailFailureSnapshotRow,
  type EmailFailureDiagnosticSource,
  type EmailFailureSnapshotClient,
  type EmailFailureSnapshotCreateData,
  type EmailFailureSnapshotMirrorClient,
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

/**
 * In-memory stand-in for the two tables the copy touches. The snapshot table
 * enforces the real unique key on `source_diagnostic_id` under
 * `skipDuplicates`, which is what makes the idempotency assertions below mean
 * something: they count rows, not calls.
 */
function fakeClient(rows: EmailFailureDiagnosticSource[]) {
  const snapshots: EmailFailureSnapshotCreateData[] = [];
  const findManyCalls: Record<string, unknown>[] = [];

  const client: EmailFailureSnapshotClient = {
    workflowDiagnostic: {
      findMany: async (args) => {
        findManyCalls.push(args as unknown as Record<string, unknown>);
        const where = args.where as {
          workflow?: string;
          status?: { in: string[] };
          id?: { in: string[] };
          createdAt?: { gte: Date };
        };
        let matched = rows.filter(
          (row) =>
            row.workflow === where.workflow &&
            (where.status?.in ?? []).includes(row.status) &&
            (where.id === undefined || where.id.in.includes(row.id)) &&
            (where.createdAt === undefined || row.createdAt >= where.createdAt.gte),
        );
        if (args.orderBy) matched = [...matched].sort((a, b) => a.id.localeCompare(b.id));
        if (args.cursor) {
          const at = matched.findIndex((row) => row.id === args.cursor!.id);
          matched = matched.slice(at + 1 + ((args.skip ?? 1) - 1));
        }
        return args.take === undefined ? matched : matched.slice(0, args.take);
      },
    },
    emailFailureSnapshot: {
      createMany: async ({ data, skipDuplicates }) => {
        let count = 0;
        for (const row of data) {
          const clash = snapshots.some((existing) => existing.sourceDiagnosticId === row.sourceDiagnosticId);
          if (clash) {
            if (skipDuplicates) continue;
            throw new Error(`Unique constraint failed on source_diagnostic_id=${row.sourceDiagnosticId}`);
          }
          snapshots.push(row);
          count += 1;
        }
        return { count };
      },
    },
  };

  return { client, snapshots, findManyCalls };
}

const FAILURES: EmailFailureDiagnosticSource[] = [
  diagnostic({ id: 'diag-a', createdAt: new Date('2026-06-29T08:00:00.000Z') }),
  diagnostic({ id: 'diag-b', status: 'failed', createdAt: new Date('2026-07-15T08:00:00.000Z') }),
  diagnostic({ id: 'diag-c', status: 'errored', createdAt: new Date('2026-09-06T08:00:00.000Z') }),
];

const NON_FAILURES: EmailFailureDiagnosticSource[] = [
  diagnostic({ id: 'diag-ok', status: 'success' }),
  diagnostic({ id: 'diag-other', workflow: 'cron_weekly_recap', status: 'error' }),
];

describe('emailFailureDiagnosticWhere', () => {
  it('is the one predicate for what counts as email-failure evidence', () => {
    assert.deepEqual(emailFailureDiagnosticWhere(), {
      workflow: 'email_send',
      status: { in: ['error', 'errored', 'failed'] },
    });
    assert.deepEqual(emailFailureDiagnosticWhere({ id: { in: ['x'] } }), {
      workflow: 'email_send',
      status: { in: ['error', 'errored', 'failed'] },
      id: { in: ['x'] },
    });
  });
});

describe('toEmailFailureSnapshotCreateData', () => {
  it('drops the metadata key rather than nulling it, because Prisma rejects null for an optional Json column', () => {
    const mapped = [
      toEmailFailureSnapshotRow(diagnostic({ id: 'with' }), 'run'),
      toEmailFailureSnapshotRow(diagnostic({ id: 'without', metadata: null }), 'run'),
    ];
    const data = toEmailFailureSnapshotCreateData(mapped);
    assert.equal(data.length, 2);
    assert.deepEqual(data[0].metadata, { to: ['member@example.org'], subject: 'We Miss You' });
    assert.equal('metadata' in data[1], false);
  });
});

describe('snapshotEmailFailuresByDiagnosticId (the cleanup path)', () => {
  it('copies only the email-failure rows among the ids it was handed', async () => {
    const { client, snapshots, findManyCalls } = fakeClient([...FAILURES, ...NON_FAILURES]);
    const ids = [...FAILURES, ...NON_FAILURES].map((row) => row.id);

    const result = await snapshotEmailFailuresByDiagnosticId(client, ids, 'run-1');

    assert.equal(result.scanned, 3);
    assert.equal(result.inserted, 3);
    assert.equal(snapshots.length, 3);
    assert.deepEqual(
      snapshots.map((row) => row.sourceDiagnosticId).sort(),
      ['diag-a', 'diag-b', 'diag-c'],
    );
    // The read is bounded by the batch it was given, never by the table.
    assert.equal(findManyCalls.length, 1);
    assert.equal(findManyCalls[0].take, ids.length);
  });

  it('is a no-op the second time: the unique key means a re-run adds no rows', async () => {
    const { client, snapshots } = fakeClient(FAILURES);
    const ids = FAILURES.map((row) => row.id);

    const first = await snapshotEmailFailuresByDiagnosticId(client, ids, 'run-1');
    assert.equal(snapshots.length, 3);

    const second = await snapshotEmailFailuresByDiagnosticId(client, ids, 'run-2');

    assert.equal(first.inserted, 3);
    assert.equal(second.scanned, 3, 'it still reads the rows');
    assert.equal(second.inserted, 0, 'but inserts none of them again');
    assert.equal(snapshots.length, 3, 'the snapshot table holds one row per source diagnostic');
  });

  it('touches nothing when the batch holds no email failures', async () => {
    const { client, snapshots, findManyCalls } = fakeClient(NON_FAILURES);
    const result = await snapshotEmailFailuresByDiagnosticId(client, ['diag-ok', 'diag-other'], 'run-1');
    assert.deepEqual(result, { scanned: 0, inserted: 0 });
    assert.equal(snapshots.length, 0);
    assert.equal(findManyCalls.length, 1);
  });

  it('does not query at all for an empty batch', async () => {
    const { client, findManyCalls } = fakeClient(FAILURES);
    const result = await snapshotEmailFailuresByDiagnosticId(client, [], 'run-1');
    assert.deepEqual(result, { scanned: 0, inserted: 0 });
    assert.equal(findManyCalls.length, 0);
  });

  it('propagates a write failure instead of swallowing it, so the caller can refuse to delete', async () => {
    const { client, snapshots } = fakeClient(FAILURES);
    client.emailFailureSnapshot.createMany = async () => {
      throw new Error('snapshot table unavailable');
    };
    await assert.rejects(
      () => snapshotEmailFailuresByDiagnosticId(client, FAILURES.map((row) => row.id), 'run-1'),
      /snapshot table unavailable/,
    );
    assert.equal(snapshots.length, 0);
  });
});

describe('snapshotEmailFailures (the catch-up script path)', () => {
  it('pages the whole backlog and copies every failure exactly once', async () => {
    const many = Array.from({ length: 7 }, (_, i) =>
      diagnostic({ id: `diag-${String(i).padStart(2, '0')}` }),
    );
    const { client, snapshots } = fakeClient([...many, ...NON_FAILURES]);
    const seen: string[] = [];

    const result = await snapshotEmailFailures(client, 'run-1', {
      batchSize: 3,
      onBatch: (rows) => {
        assert.ok(rows.length > 0, 'onBatch is never called with an empty page');
        for (const row of rows) seen.push(row.sourceDiagnosticId);
      },
    });

    assert.equal(result.scanned, 7);
    assert.equal(result.inserted, 7);
    assert.equal(snapshots.length, 7);
    assert.equal(seen.length, 7);
    assert.deepEqual(seen, many.map((row) => row.id));
  });

  it('re-running over the same backlog leaves the row count where it was', async () => {
    const { client, snapshots } = fakeClient(FAILURES);

    const first = await snapshotEmailFailures(client, 'run-1', { batchSize: 2 });
    assert.equal(first.inserted, 3);
    assert.equal(snapshots.length, 3);

    const second = await snapshotEmailFailures(client, 'run-2', { batchSize: 2 });

    assert.equal(second.scanned, 3);
    assert.equal(second.inserted, 0);
    assert.equal(snapshots.length, 3);
  });

  it('writes nothing on a dry run but still classifies every row', async () => {
    const { client, snapshots } = fakeClient(FAILURES);
    const seen: string[] = [];

    const result = await snapshotEmailFailures(client, 'run-1', {
      dryRun: true,
      onBatch: (rows) => {
        assert.ok(rows.length > 0);
        for (const row of rows) seen.push(row.sourceDiagnosticId);
      },
    });

    assert.equal(result.scanned, 3);
    assert.equal(result.inserted, 0);
    assert.equal(snapshots.length, 0);
    assert.equal(seen.length, 3);
  });

  it('honours --since by only copying rows at or after the date', async () => {
    const { client, snapshots } = fakeClient(FAILURES);

    const result = await snapshotEmailFailures(client, 'run-1', {
      since: new Date('2026-07-01T00:00:00.000Z'),
    });

    assert.equal(result.scanned, 2);
    assert.equal(snapshots.length, 2);
    assert.deepEqual(snapshots.map((row) => row.sourceDiagnosticId).sort(), ['diag-b', 'diag-c']);
  });

  it('clamps the page size so a bad --batch cannot become an unbounded scan', async () => {
    const { client, findManyCalls } = fakeClient(FAILURES);
    await snapshotEmailFailures(client, 'run-1', { batchSize: 10_000 });
    await snapshotEmailFailures(client, 'run-2', { batchSize: 0 });
    await snapshotEmailFailures(client, 'run-3', { batchSize: -5 });
    assert.ok(findManyCalls.length >= 3);
    for (const call of findManyCalls) {
      assert.ok(typeof call.take === 'number' && call.take >= 1 && call.take <= 2000, String(call.take));
    }
  });
});

describe('mirrorResendOntoEmailFailureSnapshot', () => {
  function mirrorClient(rows: { id: string; sourceDiagnosticId: string; metadata: unknown }[]) {
    const updates: { id: string; metadata: object }[] = [];
    const client: EmailFailureSnapshotMirrorClient = {
      emailFailureSnapshot: {
        findUnique: async ({ where }) => {
          const hit = rows.find((row) => row.sourceDiagnosticId === where.sourceDiagnosticId);
          return hit ? { id: hit.id, metadata: hit.metadata } : null;
        },
        update: async ({ where, data }) => {
          const hit = rows.find((row) => row.id === where.id);
          if (!hit) throw new Error(`no snapshot row ${where.id}`);
          hit.metadata = data.metadata;
          updates.push({ id: where.id, metadata: data.metadata });
          return hit;
        },
      },
    };
    return { client, rows, updates };
  }

  const stamp = {
    resentAt: '2026-09-22T12:00:00.000Z',
    resentOk: true,
    resentDiagnosticId: 'diag-resend-1',
  };

  it('stamps the replay onto an existing copy without discarding the original metadata', async () => {
    const { client, rows, updates } = mirrorClient([
      {
        id: 'snap-1',
        sourceDiagnosticId: 'diag-a',
        metadata: { to: ['member@example.org'], subject: 'Your course is paid for', errorClass: 'header_invalid' },
      },
    ]);

    const mirrored = await mirrorResendOntoEmailFailureSnapshot(client, 'diag-a', stamp);

    assert.equal(mirrored, true);
    assert.equal(updates.length, 1);
    assert.equal(updates[0].id, 'snap-1');
    assert.deepEqual(rows[0].metadata, {
      to: ['member@example.org'],
      subject: 'Your course is paid for',
      errorClass: 'header_invalid',
      resentAt: '2026-09-22T12:00:00.000Z',
      resentOk: true,
      resentDiagnosticId: 'diag-resend-1',
    });
  });

  it('is a no-op when the row has not been snapshotted yet', async () => {
    const { client, updates } = mirrorClient([
      { id: 'snap-1', sourceDiagnosticId: 'diag-other', metadata: {} },
    ]);

    const mirrored = await mirrorResendOntoEmailFailureSnapshot(client, 'diag-a', stamp);

    assert.equal(mirrored, false);
    assert.equal(updates.length, 0);
  });

  it('tolerates a snapshot row whose metadata is null or not an object', async () => {
    for (const metadata of [null, undefined, 'a string', 42, ['an', 'array']]) {
      const { client, rows, updates } = mirrorClient([
        { id: 'snap-1', sourceDiagnosticId: 'diag-a', metadata },
      ]);

      const mirrored = await mirrorResendOntoEmailFailureSnapshot(client, 'diag-a', stamp);

      assert.equal(mirrored, true, JSON.stringify(metadata ?? null));
      assert.equal(updates.length, 1);
      assert.deepEqual(rows[0].metadata, stamp, JSON.stringify(metadata ?? null));
    }
  });

  it('records a failed replay too, so the evidence shows the attempt', async () => {
    const { client, rows } = mirrorClient([
      { id: 'snap-1', sourceDiagnosticId: 'diag-a', metadata: { subject: 'We Miss You' } },
    ]);

    await mirrorResendOntoEmailFailureSnapshot(client, 'diag-a', { ...stamp, resentOk: false });

    assert.deepEqual(rows[0].metadata, {
      subject: 'We Miss You',
      resentAt: '2026-09-22T12:00:00.000Z',
      resentOk: false,
      resentDiagnosticId: 'diag-resend-1',
    });
  });

  it('propagates a write failure rather than leaving the two records silently disagreeing', async () => {
    const { client } = mirrorClient([
      { id: 'snap-1', sourceDiagnosticId: 'diag-a', metadata: {} },
    ]);
    client.emailFailureSnapshot.update = async () => {
      throw new Error('snapshot row is locked');
    };

    await assert.rejects(
      () => mirrorResendOntoEmailFailureSnapshot(client, 'diag-a', stamp),
      /snapshot row is locked/,
    );
  });
});
