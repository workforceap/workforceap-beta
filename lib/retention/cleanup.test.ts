import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cleanupTable, cleanupDeletedAccounts, cleanupUnmatchedCourseraXapiEvents, foreignKeyConstraintName, runDataCleanup } from './cleanup';
import {
  RETENTION_TABLES,
  UNMATCHED_XAPI_EVENT_RETENTION_LABEL,
  CRITICAL_AUDIT_ACTION_PREFIXES,
  RETENTION_AUDIT_DAYS as CRITICAL_AUDIT_RETENTION_DAYS,
  PUBLIC_LEAD_RETENTION_DAYS,
  getCutoffDate,
} from './config';

const mockDeleteMany = vi.fn();
const mockFindMany = vi.fn();
const mockCount = vi.fn();
const mockAuditEventDeleteMany = vi.fn();
const mockAnonymizeMember = vi.fn();
const mockQueryRaw = vi.fn();
const mockExecuteRaw = vi.fn();

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
    $transaction: async (arg: unknown) => {
      const { prisma } = await import('@/lib/db/prisma');
      return typeof arg === 'function'
        ? (arg as (tx: unknown) => unknown)(prisma)
        : Promise.all(arg as Promise<unknown>[]);
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
      findMany: (...args: unknown[]) => mockFindMany(...args),
      deleteMany: (...args: unknown[]) => mockDeleteMany(...args),
      count: (...args: unknown[]) => mockCount(...args),
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
