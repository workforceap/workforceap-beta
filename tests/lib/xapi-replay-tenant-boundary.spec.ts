import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  executeRaw: vi.fn(),
  transaction: vi.fn(),
  findMany: vi.fn(),
  findFirst: vi.fn(),
  count: vi.fn(),
  eventQueryRaw: vi.fn(),
  handle: vi.fn(),
  parse: vi.fn(),
  toRaw: vi.fn(),
  markProcessed: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    $executeRaw: mocks.executeRaw,
    $transaction: mocks.transaction,
    xapiStatement: { findMany: mocks.findMany, findFirst: mocks.findFirst, count: mocks.count },
  },
}));
vi.mock('@/lib/xapi/inboundStatementPipeline', () => ({
  handleInboundParsedStatement: mocks.handle,
}));
vi.mock('@/lib/xapi/statements', () => ({
  parseXapiStatement: mocks.parse,
}));
vi.mock('@/lib/xapi/storage', () => ({
  markXapiStatementProcessed: mocks.markProcessed,
}));
vi.mock('@/lib/xapi/xapiStatementRowToRaw', () => ({
  xapiStatementRowToRawStatement: mocks.toRaw,
}));

import {
  countUnresolvedXapiOrganizations,
  reconcileUnresolvedXapiOrganizations,
  replayPendingXapiStatements,
  replayPendingXapiStatementsForEmail,
  replayUnresolvedXapiStatementsForIdentity,
} from '@/lib/coursera/replayPendingXapi';

const parsed = {
  email: 'learner@example.com',
  courseSlug: 'course-one',
  courseName: 'Course One',
  statementId: 'statement-1',
  verbId: 'http://adlnet.gov/expapi/verbs/completed',
  rawStatement: {},
};

describe('persisted xAPI replay tenant boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.executeRaw.mockResolvedValue(0);
    mocks.transaction.mockImplementation(async (callback) => callback({
      xapiStatement: { findMany: mocks.findMany, findFirst: mocks.findFirst, count: mocks.count },
      $queryRaw: mocks.eventQueryRaw,
    }));
    // A sentinel row exists by default so the reconciliation UPDATE runs.
    mocks.findFirst.mockResolvedValue({ id: 'sentinel-row' });
    mocks.findMany.mockResolvedValue([
      { id: 'row-1', statementId: 'statement-1', organizationId: 'org-a' },
    ]);
    mocks.eventQueryRaw.mockResolvedValue([{ status: 'completed' }]);
    mocks.toRaw.mockReturnValue({});
    mocks.parse.mockReturnValue(parsed);
    mocks.handle.mockResolvedValue({ completions: [{ ok: true }] });
    mocks.markProcessed.mockResolvedValue(undefined);
  });

  it('passes the statement tenant into every pending replay', async () => {
    const result = await replayPendingXapiStatements(10);

    expect(mocks.handle).toHaveBeenCalledWith(parsed, {
      organizationId: 'org-a',
      expectedUserId: null,
      requireOrganizationId: true,
    });
    expect(result.replayed).toBe(1);
    expect(result.skippedUnresolvedOrganization).toBe(0);

    const reconciliationSql = (mocks.executeRaw.mock.calls[0]?.[0] as TemplateStringsArray).join('');
    expect(reconciliationSql).toContain('u.deleted_at IS NULL');
    expect(reconciliationSql).toContain('cim.organization_id = u.organization_id');
    expect(reconciliationSql).toContain('conflicting_mapping.user_id <> cim.user_id');
    expect(reconciliationSql).toContain('direct_user.id <> cim.user_id');
  });

  it('retains sentinel rows for retry instead of replaying them unscoped', async () => {
    mocks.findMany.mockResolvedValue([
      {
        id: 'row-1',
        statementId: 'statement-1',
        organizationId: 'unresolved-row-1',
      },
    ]);

    const result = await replayPendingXapiStatements(10);

    expect(mocks.handle).not.toHaveBeenCalled();
    expect(mocks.markProcessed).not.toHaveBeenCalled();
    expect(result.replayed).toBe(0);
    expect(result.skippedUnresolvedOrganization).toBe(1);
  });

  it('threads reviewed tenant and user through identity-triggered replay', async () => {
    mocks.eventQueryRaw
      .mockResolvedValueOnce([{ statementId: 'statement-1' }])
      .mockResolvedValueOnce([{ status: 'completed' }]);

    await replayUnresolvedXapiStatementsForIdentity({
      courseraEmail: 'learner@example.com',
      organizationId: 'org-a',
      expectedUserId: 'user-a',
    });

    expect(mocks.handle).toHaveBeenCalledWith(parsed, {
      organizationId: 'org-a',
      expectedUserId: 'user-a',
      requireOrganizationId: true,
    });
    const statementQuery = mocks.findMany.mock.calls[0]?.[0];
    expect(statementQuery.where.organizationId).toBe('org-a');
    const statusQuery = (mocks.eventQueryRaw.mock.calls[0]?.[0] as TemplateStringsArray).join('');
    expect(statusQuery).toContain("completion_status IN ('unmatched', 'error', 'unresolved_course')");
  });
});

describe('pending xAPI per-statement failure isolation', () => {
  const rows = [
    { id: 'row-1', statementId: 'statement-1', organizationId: 'org-a' },
    { id: 'row-2', statementId: 'statement-2', organizationId: 'org-a' },
  ];

  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.findFirst.mockResolvedValue(null);
    mocks.transaction.mockImplementation(async (callback) => callback({
      xapiStatement: { findMany: mocks.findMany, findFirst: mocks.findFirst },
      $queryRaw: mocks.eventQueryRaw,
    }));
    mocks.findMany.mockResolvedValue(rows);
    mocks.toRaw.mockImplementation((row) => ({ id: row.statementId }));
    mocks.parse.mockImplementation((raw) => ({ ...parsed, statementId: raw.id }));
    mocks.handle.mockResolvedValue({ completions: [{ ok: true }] });
    mocks.eventQueryRaw.mockResolvedValue([{ status: 'completed' }]);
    mocks.markProcessed.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('counts a failed first event once and still completes the later event', async () => {
    mocks.handle.mockRejectedValueOnce(new Error('provider failure for learner@example.com'));

    const result = await replayPendingXapiStatements(10);

    expect(mocks.handle.mock.calls.map(([statement]) => statement.statementId)).toEqual([
      'statement-1', 'statement-2',
    ]);
    expect(result).toEqual({
      scanned: 2,
      replayed: 2,
      skippedUnparsed: 0,
      skippedUnresolvedOrganization: 0,
      completionsEmitted: 1,
      orgsRepaired: 0,
      breakdown: { completedOk: 1, errored: 1, ignored: 0, unresolvedCourse: 0, unmatched: 0 },
    });
    expect(mocks.markProcessed).not.toHaveBeenCalled();
    expect(mocks.eventQueryRaw).toHaveBeenCalledOnce();
    expect(console.error).toHaveBeenCalledExactlyOnceWith(
      '[replayPendingXapi] statement replay failed', { statementId: 'statement-1' },
    );
  });

  it('leaves repeated failures pending with fresh accounting on every retry', async () => {
    mocks.findMany.mockResolvedValue([rows[0]]);
    mocks.handle.mockRejectedValue(new Error('Course not found'));

    const first = await replayPendingXapiStatements(10);
    const retried = await replayPendingXapiStatementsForEmail('learner@example.com');

    expect(retried).toEqual(first);
    expect(first.replayed).toBe(1);
    expect(first.breakdown.errored).toBe(1);
    expect(first.completionsEmitted).toBe(0);
    expect(mocks.handle).toHaveBeenCalledTimes(2);
    expect(mocks.markProcessed).not.toHaveBeenCalled();
    expect(mocks.eventQueryRaw).not.toHaveBeenCalled();
  });

  it.each(['reconstruction', 'parsing'] as const)('continues after a %s exception', async (stage) => {
    const failingMock = stage === 'reconstruction' ? mocks.toRaw : mocks.parse;
    failingMock.mockImplementationOnce(() => { throw new Error('malformed row'); });

    const result = await replayPendingXapiStatements(10);

    expect(result.replayed).toBe(1);
    expect(result.skippedUnparsed).toBe(0);
    expect(result.breakdown).toEqual({
      completedOk: 1, errored: 1, ignored: 0, unresolvedCourse: 0, unmatched: 0,
    });
    expect(mocks.markProcessed).not.toHaveBeenCalled();
    expect(mocks.handle).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ statementId: 'statement-2' }),
      expect.objectContaining({ organizationId: 'org-a', requireOrganizationId: true }),
    );
  });

  it('counts an unparsed-row acknowledgement failure as an error, then continues', async () => {
    mocks.parse.mockReturnValueOnce(null);
    mocks.markProcessed.mockRejectedValueOnce(new Error('database unavailable'));

    const result = await replayPendingXapiStatements(10);

    expect(result.skippedUnparsed).toBe(0);
    expect(result.replayed).toBe(1);
    expect(result.breakdown.errored).toBe(1);
    expect(result.breakdown.completedOk).toBe(1);
    expect(mocks.markProcessed).toHaveBeenCalledOnce();
  });

  it('isolates outcome-read failures without marking or re-running a completed event', async () => {
    mocks.eventQueryRaw.mockRejectedValueOnce(new Error('outcome read unavailable'));

    const result = await replayPendingXapiStatements(10);

    expect(result.replayed).toBe(2);
    expect(result.completionsEmitted).toBe(2);
    expect(result.breakdown.errored).toBe(1);
    expect(result.breakdown.completedOk).toBe(1);
    expect(mocks.handle).toHaveBeenCalledTimes(2);
    expect(mocks.markProcessed).not.toHaveBeenCalled();
  });

  it('keeps returned errors and unresolved attribution separate without double counting', async () => {
    mocks.handle.mockResolvedValue({ completions: [{ ok: false }] });
    mocks.eventQueryRaw
      .mockResolvedValueOnce([{ status: 'error' }])
      .mockResolvedValueOnce([{ status: 'unresolved_course' }]);

    const result = await replayPendingXapiStatements(10);

    expect(result.completionsEmitted).toBe(2);
    expect(result.breakdown).toEqual({
      completedOk: 0, errored: 1, ignored: 0, unresolvedCourse: 1, unmatched: 0,
    });
    expect(console.error).not.toHaveBeenCalled();
  });

  it('bounds failure diagnostics and tolerates statements without an id', async () => {
    mocks.findMany.mockResolvedValue([
      { ...rows[0], statementId: 's'.repeat(400) },
      { ...rows[1], statementId: null },
    ]);
    mocks.handle.mockRejectedValue(new Error('private provider payload'));

    const result = await replayPendingXapiStatements(10);

    expect(result.breakdown.errored).toBe(2);
    expect(console.error).toHaveBeenNthCalledWith(
      1, '[replayPendingXapi] statement replay failed', { statementId: 's'.repeat(128) },
    );
    expect(console.error).toHaveBeenNthCalledWith(
      2, '[replayPendingXapi] statement replay failed', { statementId: null },
    );
  });

  it('forwards a hash-only statement idempotency key for acknowledgement by the pipeline', async () => {
    mocks.findMany.mockResolvedValue([{ ...rows[0], statementId: null, statementHash: 'hash-1' }]);

    await replayPendingXapiStatements(10);

    expect(mocks.handle).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ statementId: null }),
      {
        organizationId: 'org-a', expectedUserId: null, requireOrganizationId: true, statementHash: 'hash-1',
      },
    );
    expect(mocks.markProcessed).not.toHaveBeenCalled();
  });

  it('acknowledges an unparsed hash-only statement using its persisted idempotency key', async () => {
    mocks.findMany.mockResolvedValue([{ ...rows[0], statementId: null, statementHash: 'hash-1' }]);
    mocks.parse.mockReturnValue(null);

    const result = await replayPendingXapiStatements(10);

    expect(mocks.markProcessed).toHaveBeenCalledExactlyOnceWith(null, 'hash-1');
    expect(result.skippedUnparsed).toBe(1);
    expect(result.breakdown.errored).toBe(0);
    expect(mocks.handle).not.toHaveBeenCalled();
  });

  it.each([
    ['completed', 'completedOk'], ['ignored', 'ignored'],
    ['unmatched', 'unmatched'], ['unresolved_course', 'unresolvedCourse'],
  ] as const)('accounts for hash-only %s statements without an event-id lookup', async (outcome, counter) => {
    mocks.findMany.mockResolvedValue([{ ...rows[0], statementId: null, statementHash: 'hash-only' }]);
    mocks.handle.mockResolvedValue({ completions: [], outcome });

    const result = await replayPendingXapiStatements(10);

    expect(result.breakdown[counter]).toBe(1);
    expect(Object.values(result.breakdown).reduce((sum, count) => sum + count, 0)).toBe(1);
    expect(mocks.eventQueryRaw).not.toHaveBeenCalled();
  });
});

describe('sentinel organization reconciliation (WAP-33)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.executeRaw.mockResolvedValue(0);
    mocks.transaction.mockImplementation(async (callback) => callback({
      xapiStatement: { findMany: mocks.findMany, findFirst: mocks.findFirst, count: mocks.count },
      $queryRaw: mocks.eventQueryRaw,
    }));
  });

  it("skips the UPDATE when no 'unresolved-%' statement exists", async () => {
    mocks.findFirst.mockResolvedValue(null);

    await expect(reconcileUnresolvedXapiOrganizations()).resolves.toBe(0);

    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: { organizationId: { startsWith: 'unresolved-' } },
      select: { id: true },
    });
    expect(mocks.executeRaw).not.toHaveBeenCalled();
  });

  it('runs the UPDATE when a sentinel row exists and reports the repaired count', async () => {
    mocks.findFirst.mockResolvedValue({ id: 'sentinel-row' });
    mocks.executeRaw.mockResolvedValue(3);

    await expect(reconcileUnresolvedXapiOrganizations()).resolves.toBe(3);
    expect(mocks.executeRaw).toHaveBeenCalledTimes(1);
  });

  it('still runs the UPDATE when the probe itself fails — skipping is only an optimisation', async () => {
    mocks.findFirst.mockRejectedValue(new Error('probe down'));
    mocks.executeRaw.mockResolvedValue(1);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(reconcileUnresolvedXapiOrganizations()).resolves.toBe(1);
    expect(mocks.executeRaw).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });

  it('the pending replay reports orgsRepaired 0 without touching the UPDATE when the queue has no sentinels', async () => {
    mocks.findFirst.mockResolvedValue(null);
    mocks.findMany.mockResolvedValue([]);

    const result = await replayPendingXapiStatements(10);

    expect(result.orgsRepaired).toBe(0);
    expect(mocks.executeRaw).not.toHaveBeenCalled();
  });

  it('counts the sentinel rows for the admin health page', async () => {
    mocks.count.mockResolvedValue(37);

    await expect(countUnresolvedXapiOrganizations()).resolves.toBe(37);
    expect(mocks.count).toHaveBeenCalledWith({ where: { organizationId: { startsWith: 'unresolved-' } } });
  });
});
