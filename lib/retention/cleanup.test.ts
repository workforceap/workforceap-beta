import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanupTable, cleanupDeletedAccounts, cleanupUnmatchedCourseraXapiEvents, foreignKeyConstraintName, runDataCleanup } from './cleanup';
import {
  RETENTION_TABLES,
  UNMATCHED_XAPI_EVENT_RETENTION_LABEL,
  CRITICAL_AUDIT_ACTION_PREFIXES,
  RETENTION_AUDIT_DAYS as CRITICAL_AUDIT_RETENTION_DAYS,
  PUBLIC_LEAD_RETENTION_DAYS,
  WORKFLOW_DIAGNOSTIC_RETENTION_DAYS,
  getCutoffDate,
} from './config';

const mockDeleteMany = vi.fn();
const mockFindMany = vi.fn();
const mockCount = vi.fn();
const mockAuditEventDeleteMany = vi.fn();
const mockAnonymizeMember = vi.fn();
const mockQueryRaw = vi.fn();
const mockExecuteRaw = vi.fn();
const mockSnapshotCreateMany = vi.fn();

/**
 * Ordered log of what the cleanup did, shared by the transaction wrapper and
 * the per-model fakes below, so a test can assert that the email-failure
 * snapshot really is written inside the same transaction as the delete it
 * guards, and before it (WAP-163).
 */
const opLog: string[] = [];

/**
 * Per-model override for the `workflow_diagnostics` delegate. Every other
 * model keeps sharing `mockFindMany`/`mockDeleteMany`; the WAP-163 suite needs
 * this one to answer from its own in-memory table while `runDataCleanup`
 * sweeps the rest. Cleared in that suite's `afterEach`.
 */
const workflowDiagnosticOverride: {
  findMany?: (args: never) => Promise<unknown>;
  deleteMany?: (args: never) => Promise<unknown>;
} = {};

vi.mock('@/lib/member/anonymizeMember', () => ({
  anonymizeMember: (...args: unknown[]) => mockAnonymizeMember(...args),
}));

/** Shape Prisma gives a violated foreign key (P2003). */
function foreignKeyError(constraint: string) {
  return Object.assign(new Error(`Foreign key constraint violated: \`${constraint} (index)\``), {
    code: 'P2003',
    meta: { field_name: `${constraint} (index)` },
  });
}

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    $queryRawUnsafe: vi.fn(),
    $queryRaw: (...args: unknown[]) => mockQueryRaw(...args),
    $executeRaw: (...args: unknown[]) => mockExecuteRaw(...args),
    // NB: this fake runs the callback against the plain client and never rolls
    // anything back — i.e. it behaves exactly like `installFlattenTxOverride`
    // in lib/db/prisma.ts does under PRISMA_FLATTEN_TX=1 / VERCEL_ENV=preview.
    // So every assertion below about the snapshot blocking the delete is proved
    // in the *weaker* of the two environments: it rests on ordering alone, not
    // on rollback (WAP-163).
    $transaction: async (arg: unknown) => {
      const { prisma } = await import('@/lib/db/prisma');
      opLog.push('tx:begin');
      try {
        return typeof arg === 'function'
          ? await (arg as (tx: unknown) => unknown)(prisma)
          : await Promise.all(arg as Promise<unknown>[]);
      } finally {
        opLog.push('tx:end');
      }
    },
    user: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      deleteMany: (...args: unknown[]) => mockDeleteMany(...args),
      count: (...args: unknown[]) => mockCount(...args),
    },
    auditLog: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      deleteMany: (...args: unknown[]) => mockDeleteMany(...args),
      count: (...args: unknown[]) => mockCount(...args),
    },
    auditEvent: {
      deleteMany: (...args: unknown[]) => mockAuditEventDeleteMany(...args),
    },
    xapiStatement: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      deleteMany: (...args: unknown[]) => mockDeleteMany(...args),
      count: (...args: unknown[]) => mockCount(...args),
    },
    cronExecution: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      deleteMany: (...args: unknown[]) => mockDeleteMany(...args),
      count: (...args: unknown[]) => mockCount(...args),
    },
    webhookEvent: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      deleteMany: (...args: unknown[]) => mockDeleteMany(...args),
      count: (...args: unknown[]) => mockCount(...args),
    },
    memberEvent: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      deleteMany: (...args: unknown[]) => mockDeleteMany(...args),
      count: (...args: unknown[]) => mockCount(...args),
    },
    workflowDiagnostic: {
      findMany: (...args: unknown[]) =>
        (workflowDiagnosticOverride.findMany ?? mockFindMany)(...(args as [never])),
      deleteMany: (...args: unknown[]) =>
        (workflowDiagnosticOverride.deleteMany ?? mockDeleteMany)(...(args as [never])),
      count: (...args: unknown[]) => mockCount(...args),
    },
    emailFailureSnapshot: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      deleteMany: (...args: unknown[]) => mockDeleteMany(...args),
      count: (...args: unknown[]) => mockCount(...args),
      createMany: (...args: unknown[]) => mockSnapshotCreateMany(...args),
    },
    emailSendLog: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      deleteMany: (...args: unknown[]) => mockDeleteMany(...args),
      count: (...args: unknown[]) => mockCount(...args),
    },
    portalWorkflowEvent: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      deleteMany: (...args: unknown[]) => mockDeleteMany(...args),
      count: (...args: unknown[]) => mockCount(...args),
    },
    publicWioaScreening: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      deleteMany: (...args: unknown[]) => mockDeleteMany(...args),
      count: (...args: unknown[]) => mockCount(...args),
    },
  },
}));

describe('RETENTION_TABLES', () => {
  it('purges no-account eligibility leads on a TTL under a year (WAP-172)', () => {
    const cfg = RETENTION_TABLES.find((t) => t.model === 'publicWioaScreening');
    expect(cfg).toMatchObject({ dateColumn: 'createdAt', days: PUBLIC_LEAD_RETENTION_DAYS });
    expect(PUBLIC_LEAD_RETENTION_DAYS).toBeGreaterThan(0);
    expect(PUBLIC_LEAD_RETENTION_DAYS).toBeLessThanOrEqual(365);
  });
});

describe('cleanupTable', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('deletes expired rows in a single batch', async () => {
    mockFindMany.mockResolvedValueOnce([{ id: 'a' }, { id: 'b' }]);
    mockDeleteMany.mockResolvedValueOnce({ count: 2 });

    const cfg = RETENTION_TABLES.find((t) => t.model === 'auditLog')!;
    const result = await cleanupTable(cfg);

    expect(result.deleted).toBe(2);
    expect(result.batchCount).toBe(1);
    expect(result.model).toBe('auditLog');

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            { createdAt: { lt: getCutoffDate(cfg.days) } },
            {
              OR: [
                { NOT: { OR: CRITICAL_AUDIT_ACTION_PREFIXES.map((prefix) => ({ action: { startsWith: prefix } })) } },
                { createdAt: { lt: getCutoffDate(CRITICAL_AUDIT_RETENTION_DAYS) } },
              ],
            },
          ],
        },
        select: { id: true },
        take: 1000,
        orderBy: { createdAt: 'asc' },
      }),
    );

    expect(mockDeleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['a', 'b'] } },
    });
  });

  it('processes multiple batches until exhausted', async () => {
    // Batch 1: full
    mockFindMany
      .mockResolvedValueOnce(Array.from({ length: 1000 }, (_, i) => ({ id: `b1-${i}` })))
      .mockResolvedValueOnce(Array.from({ length: 500 }, (_, i) => ({ id: `b2-${i}` })))
      .mockResolvedValueOnce([]);

    mockDeleteMany
      .mockResolvedValueOnce({ count: 1000 })
      .mockResolvedValueOnce({ count: 500 });

    const cfg = RETENTION_TABLES.find((t) => t.model === 'cronExecution')!;
    const result = await cleanupTable(cfg);

    expect(result.deleted).toBe(1500);
    expect(result.batchCount).toBe(2);
  });

  it('returns zero when no rows match', async () => {
    mockFindMany.mockResolvedValueOnce([]);

    const cfg = RETENTION_TABLES.find((t) => t.model === 'webhookEvent')!;
    const result = await cleanupTable(cfg);

    expect(result.deleted).toBe(0);
    expect(result.batchCount).toBe(0);
    expect(mockDeleteMany).not.toHaveBeenCalled();
  });

  it('throws for invalid model name', async () => {
    await expect(
      cleanupTable({ model: 'nonExistent', dateColumn: 'createdAt', days: 30, description: 'x' }),
    ).rejects.toThrow('Invalid Prisma model');
  });
});

/** A date `days` before now, comfortably on one side of a retention cutoff. */
function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

describe('email-failure snapshot before the workflow_diagnostics purge (WAP-163)', () => {
  const cfg = RETENTION_TABLES.find((t) => t.model === 'workflowDiagnostic')!;
  const cronCfg = RETENTION_TABLES.find((t) => t.model === 'cronExecution')!;

  type Diag = {
    id: string;
    workflow: string;
    status: string;
    actorUserId: string | null;
    entityType: string | null;
    entityId: string | null;
    summary: string;
    provider: string | null;
    method: string | null;
    fallbackPath: string | null;
    failureReason: string | null;
    metadata: unknown;
    createdAt: Date;
  };

  function diag(id: string, over: Partial<Diag> = {}): Diag {
    return {
      id,
      workflow: 'email_send',
      status: 'error',
      actorUserId: null,
      entityType: 'email_template',
      entityId: 'course_paid',
      summary: `Email send failed: ${id}`,
      provider: 'resend',
      method: null,
      fallbackPath: null,
      failureReason: 'Header keys and values cannot contain carriage return',
      metadata: { to: ['member@example.org'], subject: 'Your course is paid for' },
      createdAt: daysAgo(200),
      ...over,
    };
  }

  /** Rows past the 90-day cutoff: three email failures and one unrelated diagnostic. */
  const seedRows = (): Diag[] => [
    diag('diag-a'),
    diag('diag-b', { status: 'failed' }),
    diag('diag-c', { status: 'errored' }),
    diag('diag-cron', { workflow: 'cron_weekly_recap', status: 'error' }),
  ];

  let diagnostics: Diag[];
  let snapshotTable: { sourceDiagnosticId: string; snapshotRun: string }[];

  beforeEach(() => {
    vi.resetAllMocks();
    opLog.length = 0;
    diagnostics = seedRows();
    snapshotTable = [];

    workflowDiagnosticOverride.findMany = (async (args: {
      where: { workflow?: string; status?: { in: string[] }; id?: { in: string[] }; createdAt?: { lt: Date } };
      take?: number;
    }) => {
      if (args.where.workflow !== undefined) {
        // The snapshot read: the email-failure rows among the ids handed in.
        opLog.push('snapshot:read');
        const ids = args.where.id?.in ?? [];
        return diagnostics.filter(
          (row) =>
            ids.includes(row.id) &&
            row.workflow === args.where.workflow &&
            (args.where.status?.in ?? []).includes(row.status),
        );
      }
      // The purge read: ids past the cutoff.
      opLog.push('batch:read');
      const cutoff = args.where.createdAt!.lt;
      return diagnostics
        .filter((row) => row.createdAt < cutoff)
        .slice(0, args.take)
        .map((row) => ({ id: row.id }));
    }) as never;

    workflowDiagnosticOverride.deleteMany = (async (args: { where: { id: { in: string[] } } }) => {
      opLog.push('delete');
      const ids = args.where.id.in;
      const before = diagnostics.length;
      diagnostics = diagnostics.filter((row) => !ids.includes(row.id));
      return { count: before - diagnostics.length };
    }) as never;

    mockSnapshotCreateMany.mockImplementation(
      async ({ data, skipDuplicates }: { data: { sourceDiagnosticId: string; snapshotRun: string }[]; skipDuplicates?: boolean }) => {
        opLog.push('snapshot:write');
        let count = 0;
        for (const row of data) {
          const clash = snapshotTable.some((existing) => existing.sourceDiagnosticId === row.sourceDiagnosticId);
          if (clash) {
            // The real table has a unique index on source_diagnostic_id.
            if (skipDuplicates) continue;
            throw new Error(`Unique constraint failed on source_diagnostic_id=${row.sourceDiagnosticId}`);
          }
          snapshotTable.push(row);
          count += 1;
        }
        return { count };
      },
    );
  });

  afterEach(() => {
    delete workflowDiagnosticOverride.findMany;
    delete workflowDiagnosticOverride.deleteMany;
  });

  it('copies the email failures in the batch, then deletes the batch, inside one transaction', async () => {
    const result = await cleanupTable(cfg);

    expect(result.deleted).toBe(4);
    expect(result.snapshotted).toBe(3);
    expect(result.snapshotScanned).toBe(3);
    expect(diagnostics).toHaveLength(0);

    // The evidence landed: one row per email-failure diagnostic, and nothing else.
    expect(snapshotTable).toHaveLength(3);
    expect(snapshotTable.map((row) => row.sourceDiagnosticId).sort()).toEqual(['diag-a', 'diag-b', 'diag-c']);
    for (const row of snapshotTable) {
      expect(row.snapshotRun).toMatch(/^snapshot-\d{4}-\d{2}-\d{2}T/);
    }

    // Order is the guarantee: read, copy, then delete — all between one
    // tx:begin/tx:end pair, so the copy cannot commit without the delete and
    // the delete cannot commit without the copy.
    expect(opLog).toEqual(['tx:begin', 'batch:read', 'snapshot:read', 'snapshot:write', 'delete', 'tx:end']);
  });

  it('skips the copy entirely for a batch with no email failures, and still deletes', async () => {
    diagnostics = [diag('diag-cron', { workflow: 'cron_weekly_recap', status: 'error' })];

    const result = await cleanupTable(cfg);

    expect(result.deleted).toBe(1);
    expect(result.snapshotted).toBe(0);
    // Nothing matched, as distinct from "everything matched and was already
    // copied" — the two cases the operator has to be able to tell apart.
    expect(result.snapshotScanned).toBe(0);
    expect(snapshotTable).toHaveLength(0);
    expect(mockSnapshotCreateMany).not.toHaveBeenCalled();
    expect(opLog).toEqual(['tx:begin', 'batch:read', 'snapshot:read', 'delete', 'tx:end']);
  });

  it('a snapshot failure blocks the delete: no rows leave workflow_diagnostics', async () => {
    // This holds on ordering alone. The transaction fake above grants no
    // rollback, so this is the flattened-mode guarantee; production additionally
    // rolls the batch back.
    mockSnapshotCreateMany.mockRejectedValue(new Error('email_failure_snapshots is unavailable'));

    await expect(cleanupTable(cfg)).rejects.toThrow('email_failure_snapshots is unavailable');

    // The rows the purge was about to take are all still there.
    expect(diagnostics).toHaveLength(4);
    expect(diagnostics.map((row) => row.id).sort()).toEqual(['diag-a', 'diag-b', 'diag-c', 'diag-cron']);
    expect(opLog).not.toContain('delete');
    expect(opLog).toEqual(['tx:begin', 'batch:read', 'snapshot:read', 'tx:end']);
  });

  it('a snapshot read failure blocks the delete too', async () => {
    workflowDiagnosticOverride.findMany = (async (args: { where: { workflow?: string; createdAt?: { lt: Date } }; take?: number }) => {
      if (args.where.workflow !== undefined) throw new Error('diagnostics read timed out');
      opLog.push('batch:read');
      return diagnostics.slice(0, args.take).map((row) => ({ id: row.id }));
    }) as never;

    await expect(cleanupTable(cfg)).rejects.toThrow('diagnostics read timed out');

    expect(diagnostics).toHaveLength(4);
    expect(opLog).not.toContain('delete');
  });

  it('surfaces a snapshot failure through runDataCleanup instead of swallowing it', async () => {
    mockFindMany.mockResolvedValue([]);
    mockDeleteMany.mockResolvedValue({ count: 0 });
    mockQueryRaw.mockResolvedValue([{ present: true }]);
    mockExecuteRaw.mockResolvedValue(0);
    mockSnapshotCreateMany.mockRejectedValue(new Error('email_failure_snapshots is unavailable'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const report = await runDataCleanup();

    const entry = report.results.find((r) => r.model === 'workflowDiagnostic');
    expect(entry).toBeDefined();
    expect(entry!.error).toContain('email_failure_snapshots is unavailable');
    expect(entry!.deleted).toBe(0);
    // The cron route turns any errored model into a 500 + a FAILED execution.
    const tableErrors = report.results.filter((r) => r.error).map((r) => r.model);
    expect(tableErrors).toContain('workflowDiagnostic');
    // And the evidence is still on disk.
    expect(diagnostics).toHaveLength(4);
    errorSpy.mockRestore();
  });

  it('is idempotent: a retry after a failed delete does not duplicate snapshot rows', async () => {
    // Run 1: the copy succeeds, the delete fails. In production the whole
    // transaction rolls back, so the source rows survive — and the snapshot
    // rows would too if the failure came after the commit of a prior batch.
    // Leaving them in place here is the harsher case for duplicates.
    workflowDiagnosticOverride.deleteMany = (async () => {
      opLog.push('delete:fail');
      throw new Error('deadlock detected');
    }) as never;

    await expect(cleanupTable(cfg)).rejects.toThrow('deadlock detected');
    expect(snapshotTable).toHaveLength(3);
    expect(diagnostics).toHaveLength(4);

    // Run 2: the retry. Same rows, same unique key.
    workflowDiagnosticOverride.deleteMany = (async (args: { where: { id: { in: string[] } } }) => {
      opLog.push('delete');
      const ids = args.where.id.in;
      const before = diagnostics.length;
      diagnostics = diagnostics.filter((row) => !ids.includes(row.id));
      return { count: before - diagnostics.length };
    }) as never;

    const result = await cleanupTable(cfg);

    expect(result.deleted).toBe(4);
    expect(result.snapshotted).toBe(0);
    // The pair that disambiguates a zero: 3 matched, 0 inserted, because all
    // three were already copied by the run that then failed its delete.
    expect(result.snapshotScanned).toBe(3);
    expect(snapshotTable).toHaveLength(3);
    expect(snapshotTable.map((row) => row.sourceDiagnosticId).sort()).toEqual(['diag-a', 'diag-b', 'diag-c']);
    // Every insert is skipDuplicates, which is what makes the retry safe.
    expect(mockSnapshotCreateMany.mock.calls).toHaveLength(2);
    for (const [args] of mockSnapshotCreateMany.mock.calls) {
      expect((args as { skipDuplicates?: boolean }).skipDuplicates).toBe(true);
    }
  });

  it('snapshots batch by batch, so a purge larger than one page is never held in memory', async () => {
    // 1000 (a full page) + 3.
    diagnostics = [
      ...Array.from({ length: 1000 }, (_, i) => diag(`bulk-${i}`)),
      ...seedRows(),
    ];

    const result = await cleanupTable(cfg);

    expect(result.batchCount).toBe(2);
    expect(result.deleted).toBe(1004);
    expect(result.snapshotted).toBe(1003);
    expect(result.snapshotScanned).toBe(1003);
    expect(snapshotTable).toHaveLength(1003);
    expect(diagnostics).toHaveLength(0);

    // Two batches, each self-contained: copy then delete, never a copy of
    // everything followed by a delete of everything.
    expect(opLog).toEqual([
      'tx:begin', 'batch:read', 'snapshot:read', 'snapshot:write', 'delete', 'tx:end',
      'tx:begin', 'batch:read', 'snapshot:read', 'snapshot:write', 'delete', 'tx:end',
    ]);
    expect(mockSnapshotCreateMany.mock.calls).toHaveLength(2);
    const pageSizes = mockSnapshotCreateMany.mock.calls.map(([args]) => (args as { data: unknown[] }).data.length);
    expect(pageSizes).toHaveLength(2);
    for (const size of pageSizes) {
      expect(size).toBeLessThanOrEqual(1000);
    }
    expect(pageSizes.reduce((a, b) => a + b, 0)).toBe(1003);
  });

  it('leaves every other retention table unsnapshotted', async () => {
    mockFindMany.mockResolvedValueOnce([{ id: 'c1' }]).mockResolvedValueOnce([]);
    mockDeleteMany.mockResolvedValue({ count: 1 });

    const result = await cleanupTable(cronCfg);

    expect(result.deleted).toBe(1);
    expect(result).not.toHaveProperty('snapshotted');
    expect(result).not.toHaveProperty('snapshotScanned');
    expect(mockSnapshotCreateMany).not.toHaveBeenCalled();
  });

  it('reports the copied count on the sweep report', async () => {
    mockFindMany.mockResolvedValue([]);
    mockDeleteMany.mockResolvedValue({ count: 0 });
    mockQueryRaw.mockResolvedValue([{ present: true }]);
    mockExecuteRaw.mockResolvedValue(0);

    const report = await runDataCleanup();

    expect(report.emailFailuresSnapshotted).toBe(3);
    expect(report.emailFailuresScanned).toBe(3);
    const entry = report.results.find((r) => r.model === 'workflowDiagnostic');
    expect(entry?.snapshotted).toBe(3);
    expect(entry?.snapshotScanned).toBe(3);
  });

  it('does not shorten the retention window it snapshots for', () => {
    // The 90-day window is Mike's to change (lib/retention/config.test.ts pins
    // the default). This PR only adds a copy step in front of the delete.
    expect(cfg.days).toBe(WORKFLOW_DIAGNOSTIC_RETENTION_DAYS);
    expect(WORKFLOW_DIAGNOSTIC_RETENTION_DAYS).toBe(90);
  });
});

/**
 * WAP-163's deadline, pinned so it cannot be re-argued from memory.
 *
 * Production, measured 2026-09-22: the oldest `email_send` failure row is
 * 2026-07-02 21:50. (`lib/email/failureRecord.ts` used to say the outage began
 * 2026-06-29, which was wrong and produced a deadline a whole run early; that
 * comment is corrected in this change.)
 *
 * Dates are built in local time on both sides so the assertions hold in any CI
 * timezone; production runs UTC, where local midnight is UTC midnight.
 */
describe('when the oldest email failure starts aging out', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('floors the cutoff to calendar midnight, not to the moment the cron fires', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 30, 7, 30, 0)); // 2026-09-30 07:30

    const cutoff = getCutoffDate(WORKFLOW_DIAGNOSTIC_RETENTION_DAYS);

    // This time-of-day assertion is the whole mechanism. Without the flooring
    // the cutoff would be 07:30 on the same calendar day — the date parts below
    // would be identical — and every row written before 07:30 on its last day
    // would be purged one run early.
    expect([cutoff.getHours(), cutoff.getMinutes(), cutoff.getSeconds(), cutoff.getMilliseconds()]).toEqual([
      0, 0, 0, 0,
    ]);
    expect([cutoff.getFullYear(), cutoff.getMonth(), cutoff.getDate()]).toEqual([2026, 6, 2]);
  });

  it('keeps the 2026-07-02 21:50 row through the 09-30 run and deletes it on 10-01', () => {
    const oldestFailure = new Date(2026, 6, 2, 21, 50, 0); // 2026-07-02 21:50, from production
    vi.useFakeTimers();

    // 09-30 07:30 → cutoff 2026-07-02T00:00, so the 21:50 row is not `lt` it.
    // The row *turns* 90 days old at 2026-09-30 21:50, and nothing runs at
    // 21:50 — which is why ageing out and being deleted are different days.
    vi.setSystemTime(new Date(2026, 8, 30, 7, 30, 0));
    expect(oldestFailure.getTime() < getCutoffDate(WORKFLOW_DIAGNOSTIC_RETENTION_DAYS).getTime()).toBe(false);

    // 10-01 07:30 → cutoff 2026-07-03T00:00 and the row is finally in scope.
    vi.setSystemTime(new Date(2026, 9, 1, 7, 30, 0));
    expect(oldestFailure.getTime() < getCutoffDate(WORKFLOW_DIAGNOSTIC_RETENTION_DAYS).getTime()).toBe(true);
  });
});

describe('cleanupDeletedAccounts', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockAuditEventDeleteMany.mockResolvedValue({ count: 0 });
    mockAnonymizeMember.mockResolvedValue(null);
  });

  it('hard-deletes soft-deleted users past retention, one transaction per account', async () => {
    mockFindMany
      .mockResolvedValueOnce([{ id: 'u1' }, { id: 'u2' }])
      .mockResolvedValueOnce([]);
    mockDeleteMany.mockResolvedValue({ count: 1 });

    const result = await cleanupDeletedAccounts();

    expect(result).toEqual({ deleted: 2, blocked: [] });
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { deletedAt: { not: null, lt: expect.any(Date) } },
        select: { id: true },
        take: 1000,
      }),
    );
    expect(mockDeleteMany).toHaveBeenCalledTimes(2);
    expect(mockDeleteMany).toHaveBeenNthCalledWith(1, { where: { id: 'u1' } });
    expect(mockDeleteMany).toHaveBeenNthCalledWith(2, { where: { id: 'u2' } });
    // A purged account is gone; only held accounts go through the anonymiser.
    expect(mockAnonymizeMember).not.toHaveBeenCalled();
  });

  it("removes the member's own audit_events rows before the user row, so the RESTRICT actor FK cannot fire", async () => {
    mockFindMany.mockResolvedValueOnce([{ id: 'u1' }]).mockResolvedValueOnce([]);
    const order: string[] = [];
    mockAuditEventDeleteMany.mockImplementation(async () => {
      order.push('audit_events');
      return { count: 2 };
    });
    mockDeleteMany.mockImplementation(async () => {
      order.push('users');
      return { count: 1 };
    });

    const result = await cleanupDeletedAccounts();

    expect(result.deleted).toBe(1);
    expect(mockAuditEventDeleteMany).toHaveBeenCalledWith({
      where: { actorUserId: 'u1', actorRole: 'member' },
    });
    expect(order).toEqual(['audit_events', 'users']);
  });

  it('never touches audit_events written by other actor roles', async () => {
    mockFindMany.mockResolvedValueOnce([{ id: 'u1' }]).mockResolvedValueOnce([]);
    mockDeleteMany.mockResolvedValue({ count: 1 });

    await cleanupDeletedAccounts();

    for (const call of mockAuditEventDeleteMany.mock.calls) {
      expect(call[0]).toEqual({ where: { actorUserId: 'u1', actorRole: 'member' } });
    }
  });

  it('reports an account a foreign key still holds and keeps purging the rest', async () => {
    // A full page: the held account first, then 999 that purge cleanly.
    const page = [{ id: 'held' }, ...Array.from({ length: 999 }, (_, i) => ({ id: `free-${i}` }))];
    mockFindMany.mockResolvedValueOnce(page).mockResolvedValueOnce([]);
    mockDeleteMany.mockImplementation(async ({ where }: { where: { id: string } }) => {
      if (where.id === 'held') throw foreignKeyError('audit_events_actor_user_id_fkey');
      return { count: 1 };
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await cleanupDeletedAccounts();

    expect(result).toEqual({
      deleted: 999,
      blocked: [{ id: 'held', constraint: 'audit_events_actor_user_id_fkey' }],
    });
    expect(mockDeleteMany).toHaveBeenCalledWith({ where: { id: 'free-0' } });
    expect(mockDeleteMany).toHaveBeenCalledWith({ where: { id: 'free-998' } });
    // The held account is excluded from the next page so the sweep terminates.
    expect(mockFindMany).toHaveBeenCalledTimes(2);
    expect(mockFindMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { deletedAt: { not: null, lt: expect.any(Date) }, id: { notIn: ['held'] } },
      }),
    );
    // WAP-169: the row that stays behind is scrubbed through the shared
    // anonymiser as an unattended (cron) action; purged accounts are not.
    expect(mockAnonymizeMember).toHaveBeenCalledTimes(1);
    expect(mockAnonymizeMember).toHaveBeenCalledWith('held', {
      reason: 'retention_purge_blocked',
      actorUserId: null,
    });
    errorSpy.mockRestore();
  });

  it('keeps the held account in the report when anonymising it fails, and keeps purging', async () => {
    mockFindMany.mockResolvedValueOnce([{ id: 'held' }, { id: 'free' }]).mockResolvedValueOnce([]);
    mockDeleteMany.mockImplementation(async ({ where }: { where: { id: string } }) => {
      if (where.id === 'held') throw foreignKeyError('chapter_members_user_id_fkey');
      return { count: 1 };
    });
    mockAnonymizeMember.mockRejectedValueOnce(new Error('profiles locked'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await cleanupDeletedAccounts();

    expect(result).toEqual({ deleted: 1, blocked: [{ id: 'held', constraint: 'chapter_members_user_id_fkey' }] });
    expect(mockDeleteMany).toHaveBeenCalledWith({ where: { id: 'free' } });
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Could not anonymise held account held'), expect.any(Error));
    errorSpy.mockRestore();
  });

  it('still throws on errors that are not foreign key violations', async () => {
    mockFindMany.mockResolvedValueOnce([{ id: 'u1' }]);
    mockDeleteMany.mockRejectedValueOnce(new Error('connection reset'));

    await expect(cleanupDeletedAccounts()).rejects.toThrow('connection reset');
  });

  it('returns zero when no deleted accounts are expired', async () => {
    mockFindMany.mockResolvedValueOnce([]);
    const result = await cleanupDeletedAccounts();
    expect(result).toEqual({ deleted: 0, blocked: [] });
    expect(mockDeleteMany).not.toHaveBeenCalled();
    expect(mockAuditEventDeleteMany).not.toHaveBeenCalled();
  });
});

describe('foreignKeyConstraintName', () => {
  it('extracts the constraint from a P2003 error', () => {
    expect(foreignKeyConstraintName(foreignKeyError('chapter_members_user_id_fkey'))).toBe(
      'chapter_members_user_id_fkey',
    );
  });

  it('returns null for anything else', () => {
    expect(foreignKeyConstraintName(new Error('boom'))).toBeNull();
    expect(foreignKeyConstraintName(Object.assign(new Error('x'), { code: 'P2025' }))).toBeNull();
    expect(foreignKeyConstraintName(null)).toBeNull();
  });
});

describe('cleanupUnmatchedCourseraXapiEvents (WAP-33)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('reports zero and issues no DELETE when the runtime table does not exist yet', async () => {
    mockQueryRaw.mockResolvedValue([{ present: false }]);

    const result = await cleanupUnmatchedCourseraXapiEvents();

    expect(result).toEqual({ model: UNMATCHED_XAPI_EVENT_RETENTION_LABEL, deleted: 0, batchCount: 0 });
    expect(mockExecuteRaw).not.toHaveBeenCalled();
  });

  it('deletes only unmatched, never-matched rows past the cutoff that no live member can still claim, in batches, until a short batch', async () => {
    mockQueryRaw.mockResolvedValue([{ present: true }]);
    mockExecuteRaw.mockResolvedValueOnce(1000).mockResolvedValueOnce(211);

    const result = await cleanupUnmatchedCourseraXapiEvents();

    expect(result).toEqual({ model: UNMATCHED_XAPI_EVENT_RETENTION_LABEL, deleted: 1211, batchCount: 2 });
    expect(mockExecuteRaw).toHaveBeenCalledTimes(2);
    const sql = (mockExecuteRaw.mock.calls[0][0] as TemplateStringsArray).join('?');
    expect(sql).toContain('DELETE FROM coursera_xapi_events');
    expect(sql).toContain('matched_user_id IS NULL');
    expect(sql).toContain("completion_status = 'unmatched'");
    expect(sql).toContain('received_at <');
    expect(sql).toContain('LIMIT');
    // A live member with the actor's address can still be credited by
    // lib/xapi/reprocess.ts, so that row must survive the purge.
    expect(sql).toMatch(/NOT EXISTS \([\s\S]*FROM users u[\s\S]*u\.deleted_at IS NULL[\s\S]*LOWER\(u\.email\) = LOWER\(coursera_xapi_events\.actor_email\)/);
    const cutoff = mockExecuteRaw.mock.calls[0][1] as Date;
    expect(cutoff).toBeInstanceOf(Date);
    const ageDays = (Date.now() - cutoff.getTime()) / (24 * 60 * 60 * 1000);
    expect(ageDays).toBeGreaterThanOrEqual(364);
    expect(ageDays).toBeLessThanOrEqual(366);
  });

  it('stops after an empty first batch', async () => {
    mockQueryRaw.mockResolvedValue([{ present: true }]);
    mockExecuteRaw.mockResolvedValue(0);

    const result = await cleanupUnmatchedCourseraXapiEvents();

    expect(result.deleted).toBe(0);
    expect(result.batchCount).toBe(0);
    expect(mockExecuteRaw).toHaveBeenCalledTimes(1);
  });
});

describe('runDataCleanup', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockQueryRaw.mockResolvedValue([{ present: true }]);
    mockExecuteRaw.mockResolvedValue(0);
  });

  it('includes the unmatched xAPI event purge in the report', async () => {
    mockFindMany.mockResolvedValue([]);
    mockDeleteMany.mockResolvedValue({ count: 0 });
    mockExecuteRaw.mockResolvedValueOnce(42);

    const report = await runDataCleanup();

    const entry = report.results.find((r) => r.model === UNMATCHED_XAPI_EVENT_RETENTION_LABEL);
    expect(entry).toEqual({ model: UNMATCHED_XAPI_EVENT_RETENTION_LABEL, deleted: 42, batchCount: 1 });
    expect(report.totalDeleted).toBe(42);
  });

  it('records a failed unmatched xAPI purge without failing the sweep', async () => {
    mockFindMany.mockResolvedValue([]);
    mockDeleteMany.mockResolvedValue({ count: 0 });
    mockQueryRaw.mockRejectedValue(new Error('relation probe failed'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const report = await runDataCleanup();

    const entry = report.results.find((r) => r.model === UNMATCHED_XAPI_EVENT_RETENTION_LABEL);
    expect(entry?.error).toContain('relation probe failed');
    expect(report.totalDeleted).toBe(0);
    errorSpy.mockRestore();
  });

  it('runs all retention tables and deleted accounts', async () => {
    mockFindMany.mockResolvedValue([]);
    mockDeleteMany.mockResolvedValue({ count: 0 });

    const report = await runDataCleanup();

    expect(report.results.length).toBeGreaterThanOrEqual(RETENTION_TABLES.length);
    expect(report.totalDeleted).toBe(0);
    expect(report.startedAt).toBeDefined();
    expect(report.completedAt).toBeDefined();
  });

  it('reports accounts a foreign key still holds without failing the sweep', async () => {
    // Every retention table is empty; the deleted-accounts pass finds one held account.
    mockFindMany.mockImplementation(async (args: { where?: { deletedAt?: unknown } }) =>
      args?.where && 'deletedAt' in args.where && !('id' in args.where) ? [{ id: 'held' }] : [],
    );
    mockDeleteMany.mockRejectedValue(foreignKeyError('audit_events_actor_user_id_fkey'));
    mockAuditEventDeleteMany.mockResolvedValue({ count: 0 });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const report = await runDataCleanup();

    expect(report.deletedAccounts).toBe(0);
    expect(report.blockedAccounts).toEqual([{ id: 'held', constraint: 'audit_events_actor_user_id_fkey' }]);
    const entry = report.results.find((r) => r.model === 'user (deleted accounts)');
    expect(entry?.error).toContain('audit_events_actor_user_id_fkey');
    errorSpy.mockRestore();
  });

  it('continues when one table fails', async () => {
    let callIndex = 0;
    mockFindMany.mockImplementation(() => {
      callIndex++;
      if (callIndex === 1) throw new Error('DB timeout');
      return Promise.resolve([]);
    });
    mockDeleteMany.mockResolvedValue({ count: 0 });

    const report = await runDataCleanup();

    const failed = report.results.find((r) => r.error?.includes('DB timeout'));
    expect(failed).toBeDefined();
    expect(report.results.length).toBeGreaterThanOrEqual(RETENTION_TABLES.length);
  });
});

describe('getCutoffDate', () => {
  it('returns a date N days in the past', () => {
    const cutoff = getCutoffDate(30);
    const now = new Date();
    const diffDays = (now.getTime() - cutoff.getTime()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeGreaterThanOrEqual(29);
    expect(diffDays).toBeLessThanOrEqual(31);
    expect(cutoff.getHours()).toBe(0);
    expect(cutoff.getMinutes()).toBe(0);
    expect(cutoff.getSeconds()).toBe(0);
  });
});
