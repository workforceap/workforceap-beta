import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  findMany: vi.fn(),
  handle: vi.fn(),
  parse: vi.fn(),
  mapIdentity: vi.fn(),
  replayPending: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    $queryRaw: mocks.queryRaw,
    user: { findMany: mocks.findMany },
    $transaction: async (fn: (tx: unknown) => unknown) => {
      const { prisma } = await import('@/lib/db/prisma');
      return fn(prisma);
    },
  },
}));
vi.mock('@/lib/xapi/inboundStatementPipeline', () => ({
  handleInboundParsedStatement: mocks.handle,
}));
vi.mock('@/lib/xapi/statements', () => ({
  parseXapiStatement: mocks.parse,
}));
vi.mock('@/lib/coursera/mapIdentityAndProgress.server', () => ({
  mapCourseraIdentityAndProgress: mocks.mapIdentity,
}));
vi.mock('@/lib/coursera/replayPendingXapi', () => ({
  replayPendingXapiStatements: mocks.replayPending,
}));

import {
  autoHealUnmatchedXapiEvents,
  reprocessUnmatchedXapiEvents,
} from '@/lib/xapi/reprocess';

const parsed = {
  email: 'learner@example.com',
  actorIdentifier: 'actor-1',
  actorHomePage: 'https://coursera.example',
  statementId: 'statement-1',
};

const event = {
  statement_id: 'statement-1',
  actor_email: 'learner@example.com',
  actor_identifier: 'actor-1',
  organization_id: 'org-a',
  raw_payload: {},
};

describe('xAPI reprocess tenant boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.parse.mockReturnValue(parsed);
    mocks.handle.mockResolvedValue({ completions: [{ ok: true }] });
    mocks.findMany.mockResolvedValue([
      { id: 'user-a', email: 'learner@example.com', organizationId: 'org-a' },
    ]);
    mocks.mapIdentity.mockResolvedValue({});
    mocks.replayPending.mockResolvedValue({
      scanned: 0,
      replayed: 0,
      skippedUnparsed: 0,
      skippedUnresolvedOrganization: 0,
      completionsEmitted: 0,
      breakdown: { completedOk: 0, errored: 0, ignored: 0, unmatched: 0 },
    });
  });

  it('scopes auto-heal lookup, mapping, and pipeline to the persisted event tenant', async () => {
    mocks.queryRaw
      .mockResolvedValueOnce([event])
      .mockResolvedValueOnce([{ status: 'completed' }]);

    const result = await autoHealUnmatchedXapiEvents(10);

    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: 'org-a', deletedAt: null }),
      }),
    );
    expect(mocks.mapIdentity).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-a', organizationId: 'org-a' }),
    );
    expect(mocks.handle).toHaveBeenCalledWith(parsed, {
      organizationId: 'org-a',
      requireOrganizationId: true,
    });
    expect(result.matched).toBe(1);
  });

  it('does not auto-heal a persisted event with an unresolved tenant', async () => {
    mocks.queryRaw.mockResolvedValueOnce([
      { ...event, organization_id: 'unknown' },
    ]);

    const result = await autoHealUnmatchedXapiEvents(10);

    expect(mocks.findMany).not.toHaveBeenCalled();
    expect(mocks.mapIdentity).not.toHaveBeenCalled();
    expect(mocks.handle).not.toHaveBeenCalled();
    expect(result.errors).toBe(1);
    expect(result.details[0]?.error).toContain('no trustworthy organization');
  });

  it('enforces the reviewed user on targeted reprocessing', async () => {
    mocks.queryRaw.mockResolvedValueOnce([event]);

    await reprocessUnmatchedXapiEvents({
      userId: 'user-a',
      courseraEmail: 'learner@example.com',
    });

    expect(mocks.handle).toHaveBeenCalledWith(parsed, {
      organizationId: 'org-a',
      expectedUserId: 'user-a',
      requireOrganizationId: true,
    });
  });
});
