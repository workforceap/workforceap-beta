import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cleanupTable, cleanupDeletedAccounts, foreignKeyConstraintName, runDataCleanup } from './cleanup';
import {
  RETENTION_TABLES,
  CRITICAL_AUDIT_ACTION_PREFIXES,
  RETENTION_AUDIT_DAYS as CRITICAL_AUDIT_RETENTION_DAYS,
  PUBLIC_LEAD_RETENTION_DAYS,
  getCutoffDate,
} from './config';

const mockDeleteMany = vi.fn();
const mockFindMany = vi.fn();
const mockCount = vi.fn();
const mockAuditEventDeleteMany = vi.fn();

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

describe('runDataCleanup', () => {
  beforeEach(() => {
    vi.resetAllMocks();
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
