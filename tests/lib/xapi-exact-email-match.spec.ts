import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  executeRawUnsafe: vi.fn(),
  queryRaw: vi.fn(),
  executeRaw: vi.fn(),
  findMany: vi.fn(),
  mapIdentityAndProgress: vi.fn(),
  handle: vi.fn(),
  parse: vi.fn(),
  replayPending: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    $executeRawUnsafe: mocks.executeRawUnsafe,
    $queryRaw: mocks.queryRaw,
    $executeRaw: mocks.executeRaw,
    user: { findMany: mocks.findMany },
    $transaction: async (fn: (tx: unknown) => unknown) => {
      const { prisma } = await import('@/lib/db/prisma');
      return fn(prisma);
    },
  },
}));
vi.mock('@/lib/email', () => ({
  sendCourseraUnmatchedActorAlertEmail: vi.fn(),
}));
vi.mock('@/lib/email/pacing', () => ({
  runBulkEmailOperation: vi.fn(),
}));
vi.mock('@/lib/coursera/testAccountHeuristic', () => ({
  isLikelyTestAccount: vi.fn(() => false),
}));
vi.mock('@/lib/coursera/mapIdentityAndProgress.server', () => ({
  mapCourseraIdentityAndProgress: mocks.mapIdentityAndProgress,
}));
vi.mock('@/lib/xapi/inboundStatementPipeline', () => ({
  handleInboundParsedStatement: mocks.handle,
}));
vi.mock('@/lib/xapi/statements', () => ({
  parseXapiStatement: mocks.parse,
}));
vi.mock('@/lib/coursera/replayPendingXapi', () => ({
  replayPendingXapiStatements: mocks.replayPending,
}));

import { resolveXapiUser } from '@/lib/xapi/mappings';
import {
  autoHealUnmatchedXapiEvents,
  reprocessUnmatchedXapiEvents,
} from '@/lib/xapi/reprocess';

/**
 * `{ equals, mode: 'insensitive' }` compiles to PostgreSQL `ILIKE`, so `_` and
 * `%` in a caller-supplied xAPI actor mbox are wildcards. Both xAPI email
 * lookups turn a match into a permanent Coursera identity link, so a
 * pattern hit on a same-shaped neighbour must never resolve.
 */

// `m_johnson@…` is what the caller supplies; `mrjohnson@…` is the unrelated
// member ILIKE also matches with `_` treated as a wildcard.
const PATTERN_ADDRESS = 'm_johnson@example.com';
const NEIGHBOUR = {
  id: 'neighbour-user',
  email: 'mrjohnson@example.com',
  fullName: 'Mr Johnson',
  organizationId: 'org-1',
};
const OWNER = {
  id: 'owner-user',
  email: 'm_johnson@example.com',
  fullName: 'M Johnson',
  organizationId: 'org-1',
};

describe('xAPI direct-email resolution requires an exact address, not an ILIKE hit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.executeRawUnsafe.mockResolvedValue(undefined);
    mocks.executeRaw.mockResolvedValue(1);
    mocks.mapIdentityAndProgress.mockResolvedValue({});
    // No actor mapping, no email mapping — force the direct-email branch.
    mocks.queryRaw.mockResolvedValue([]);
  });

  it('does not resolve or link a same-shaped neighbour when only the pattern matches', async () => {
    mocks.findMany.mockResolvedValue([NEIGHBOUR]);

    await expect(
      resolveXapiUser(
        {
          email: PATTERN_ADDRESS,
          actorIdentifier: 'actor-1',
          actorHomePage: 'https://coursera.example',
        },
        { organizationId: 'org-1' },
      ),
    ).resolves.toBeNull();

    expect(mocks.mapIdentityAndProgress).not.toHaveBeenCalled();
  });

  it('ignores neighbour rows the pattern swept in and links only the exact owner', async () => {
    mocks.findMany.mockResolvedValue([NEIGHBOUR, OWNER]);

    await expect(
      resolveXapiUser(
        {
          email: PATTERN_ADDRESS,
          actorIdentifier: 'actor-1',
          actorHomePage: 'https://coursera.example',
        },
        { organizationId: 'org-1' },
      ),
    ).resolves.toEqual({
      userId: 'owner-user',
      email: 'm_johnson@example.com',
      fullName: 'M Johnson',
      mappingMethod: 'direct_email',
    });

    expect(mocks.mapIdentityAndProgress).toHaveBeenCalledTimes(1);
    expect(mocks.mapIdentityAndProgress).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'owner-user', courseraEmail: PATTERN_ADDRESS }),
    );
  });

  it('still resolves and links an ordinary exact address, case-insensitively', async () => {
    mocks.findMany.mockResolvedValue([
      {
        id: 'user-1',
        email: 'Learner@Example.com',
        fullName: 'Learner',
        organizationId: 'org-1',
      },
    ]);

    await expect(
      resolveXapiUser(
        {
          email: 'learner@example.com',
          actorIdentifier: 'actor-1',
          actorHomePage: 'https://coursera.example',
        },
        { organizationId: 'org-1' },
      ),
    ).resolves.toEqual({
      userId: 'user-1',
      email: 'Learner@Example.com',
      fullName: 'Learner',
      mappingMethod: 'direct_email',
    });

    expect(mocks.mapIdentityAndProgress).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', courseraEmail: 'learner@example.com' }),
    );
  });

  it('bounds the candidate read and selects email so the exact filter can run', async () => {
    mocks.findMany.mockResolvedValue([OWNER]);

    await resolveXapiUser({ email: PATTERN_ADDRESS }, { organizationId: 'org-1' });

    expect(mocks.findMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        deletedAt: null,
        email: { equals: PATTERN_ADDRESS, mode: 'insensitive' },
      },
      select: { id: true, email: true, fullName: true, organizationId: true },
      take: 25,
    });
  });
});

describe('auto-heal requires an exact address, not an ILIKE hit', () => {
  const parsed = {
    email: PATTERN_ADDRESS,
    actorIdentifier: 'actor-1',
    actorHomePage: 'https://coursera.example',
    statementId: 'statement-1',
  };

  const event = {
    statement_id: 'statement-1',
    actor_email: PATTERN_ADDRESS,
    actor_identifier: 'actor-1',
    organization_id: 'org-a',
    raw_payload: {},
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.parse.mockReturnValue(parsed);
    mocks.handle.mockResolvedValue({ completions: [{ ok: true }] });
    mocks.mapIdentityAndProgress.mockResolvedValue({});
    mocks.replayPending.mockResolvedValue({
      scanned: 0,
      replayed: 0,
      skippedUnparsed: 0,
      skippedUnresolvedOrganization: 0,
      completionsEmitted: 0,
      breakdown: { completedOk: 0, errored: 0, ignored: 0, unmatched: 0 },
    });
  });

  // This path runs from the `coursera-auto-heal` cron with no `expectedUserId`,
  // so nothing downstream re-checks who was linked.
  it('does not link a same-shaped neighbour when only the pattern matches', async () => {
    mocks.queryRaw
      .mockResolvedValueOnce([event])
      .mockResolvedValueOnce([{ status: 'unmatched' }]);
    mocks.findMany.mockResolvedValue([
      { id: 'neighbour-user', email: 'mrjohnson@example.com', organizationId: 'org-a' },
    ]);

    const result = await autoHealUnmatchedXapiEvents(10);

    expect(mocks.mapIdentityAndProgress).not.toHaveBeenCalled();
    expect(result.matched).toBe(0);
  });

  it('ignores neighbour rows the pattern swept in and links only the exact owner', async () => {
    mocks.queryRaw
      .mockResolvedValueOnce([event])
      .mockResolvedValueOnce([{ status: 'completed' }]);
    mocks.findMany.mockResolvedValue([
      { id: 'neighbour-user', email: 'mrjohnson@example.com', organizationId: 'org-a' },
      { id: 'owner-user', email: 'm_johnson@example.com', organizationId: 'org-a' },
    ]);

    const result = await autoHealUnmatchedXapiEvents(10);

    expect(mocks.mapIdentityAndProgress).toHaveBeenCalledTimes(1);
    expect(mocks.mapIdentityAndProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'owner-user',
        organizationId: 'org-a',
        courseraEmail: PATTERN_ADDRESS,
        source: 'auto-healed',
      }),
    );
    expect(result.matched).toBe(1);
  });

  it('still links an ordinary exact address, case-insensitively', async () => {
    mocks.parse.mockReturnValue({ ...parsed, email: 'learner@example.com' });
    mocks.queryRaw
      .mockResolvedValueOnce([{ ...event, actor_email: 'learner@example.com' }])
      .mockResolvedValueOnce([{ status: 'completed' }]);
    mocks.findMany.mockResolvedValue([
      { id: 'user-a', email: 'Learner@Example.com', organizationId: 'org-a' },
    ]);

    const result = await autoHealUnmatchedXapiEvents(10);

    expect(mocks.mapIdentityAndProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-a',
        organizationId: 'org-a',
        courseraEmail: 'learner@example.com',
        source: 'auto-healed',
      }),
    );
    expect(result.matched).toBe(1);
  });

  it('bounds the candidate read and selects email so the exact filter can run', async () => {
    mocks.queryRaw
      .mockResolvedValueOnce([event])
      .mockResolvedValueOnce([{ status: 'completed' }]);
    mocks.findMany.mockResolvedValue([
      { id: 'owner-user', email: 'm_johnson@example.com', organizationId: 'org-a' },
    ]);

    await autoHealUnmatchedXapiEvents(10);

    expect(mocks.findMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-a',
        deletedAt: null,
        email: { equals: PATTERN_ADDRESS, mode: 'insensitive' },
      },
      select: { id: true, email: true, organizationId: true },
      take: 25,
    });
  });
});

describe('targeted reprocess mbox probe treats the address as a literal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.queryRaw.mockResolvedValue([]);
  });

  // The mbox probe stays a substring match by design (the stored value is
  // `mailto:<address>`), but `_`/`%` in the address must not act as wildcards
  // inside that pattern, or one member's address sweeps in another's rows.
  it('escapes LIKE wildcards in the bound pattern and declares an escape char', async () => {
    await reprocessUnmatchedXapiEvents({
      userId: 'user-1',
      courseraEmail: PATTERN_ADDRESS,
    });

    const [fragments, ...values] = mocks.queryRaw.mock.calls[0] as [readonly string[], ...unknown[]];
    expect(Array.from(fragments).join('')).toContain("ESCAPE '!'");
    expect(values).toContain('%m!_johnson@example.com%');
    expect(values).not.toContain('%m_johnson@example.com%');
  });

  it('leaves an ordinary address unchanged in the bound pattern', async () => {
    await reprocessUnmatchedXapiEvents({
      userId: 'user-1',
      courseraEmail: 'learner@example.com',
    });

    const [, ...values] = mocks.queryRaw.mock.calls[0] as [readonly string[], ...unknown[]];
    expect(values).toContain('%learner@example.com%');
  });
});
