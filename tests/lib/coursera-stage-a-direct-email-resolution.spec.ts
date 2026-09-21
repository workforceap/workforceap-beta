import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  executeRawUnsafe: vi.fn(),
  queryRaw: vi.fn(),
  executeRaw: vi.fn(),
  findMany: vi.fn(),
  mapIdentityAndProgress: vi.fn(),
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
vi.mock('@/lib/coursera/mapIdentityAndProgress.server', () => ({
  mapCourseraIdentityAndProgress: mocks.mapIdentityAndProgress,
}));

import { resolveXapiUser } from '@/lib/xapi/mappings';

describe('Stage A direct-email xAPI resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.executeRawUnsafe.mockResolvedValue(undefined);
    mocks.queryRaw
      .mockResolvedValueOnce([]) // no actor mapping
      .mockResolvedValueOnce([]); // no email mapping
    mocks.findMany.mockResolvedValue([
      {
        id: 'user-1',
        email: 'learner@example.com',
        fullName: 'Learner',
        organizationId: 'org-1',
      },
    ]);
  });

  it('does not credit a direct-email match when guarded mapping and raw adoption fail', async () => {
    mocks.mapIdentityAndProgress.mockRejectedValue(
      new Error('Coursera identity is already linked to another member'),
    );

    await expect(
      resolveXapiUser(
        {
          email: 'learner@example.com',
          actorIdentifier: 'actor-1',
          actorHomePage: 'https://coursera.example',
        },
        { organizationId: 'org-1' },
      ),
    ).resolves.toBeNull();

    expect(mocks.mapIdentityAndProgress).toHaveBeenCalledWith({
      userId: 'user-1',
      organizationId: 'org-1',
      courseraEmail: 'learner@example.com',
      actorIdentifier: 'actor-1',
      actorHomePage: 'https://coursera.example',
      source: 'auto-direct-email',
    });

    for (const mappingQuery of mocks.queryRaw.mock.calls.slice(0, 2)) {
      const sql = Array.from(mappingQuery[0] as unknown as readonly string[]).join('');
      expect(sql).toContain('u.deleted_at IS NULL');
      expect(sql).toContain('cim.organization_id = u.organization_id');
      const tenantScope = mappingQuery.at(-1) as { sql?: string; values?: unknown[] };
      expect(tenantScope.sql).toContain("NULLIF(u.organization_id, '')");
      expect(tenantScope.values).toContain('org-1');
    }
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org-1',
          deletedAt: null,
        }),
      }),
    );
  });

  it('fails closed when an explicit actor mapping conflicts with the active portal email owner', async () => {
    mocks.queryRaw.mockReset()
      .mockResolvedValueOnce([
        {
          id: 'mapping-1',
          userId: 'mapped-user',
          organizationId: 'org-1',
          courseraEmail: 'learner@example.com',
          actorIdentifier: 'actor-1',
          actorHomePage: 'https://coursera.example',
          source: 'manual',
          notes: null,
          lastSeenAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          userEmail: 'mapped@example.com',
          userFullName: 'Mapped User',
        },
      ])
      .mockResolvedValueOnce([]);
    mocks.findMany.mockResolvedValue([
      {
        id: 'direct-user',
        email: 'learner@example.com',
        fullName: 'Direct User',
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
    ).resolves.toBeNull();

    expect(mocks.executeRaw).not.toHaveBeenCalled();
    expect(mocks.mapIdentityAndProgress).not.toHaveBeenCalled();
  });

  it('fails closed when actor and email mappings resolve to different users', async () => {
    const mapping = (id: string, userId: string) => ({
      id,
      userId,
      organizationId: 'org-1',
      courseraEmail: 'learner@example.com',
      actorIdentifier: 'actor-1',
      actorHomePage: 'https://coursera.example',
      source: 'manual',
      notes: null,
      lastSeenAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      userEmail: `${userId}@example.com`,
      userFullName: userId,
    });
    mocks.queryRaw.mockReset()
      .mockResolvedValueOnce([mapping('actor-mapping', 'actor-user')])
      .mockResolvedValueOnce([mapping('email-mapping', 'email-user')]);

    await expect(
      resolveXapiUser(
        {
          email: 'learner@example.com',
          actorIdentifier: 'actor-1',
          actorHomePage: 'https://coursera.example',
        },
        { organizationId: 'org-1' },
      ),
    ).resolves.toBeNull();

    expect(mocks.findMany).not.toHaveBeenCalled();
    expect(mocks.executeRaw).not.toHaveBeenCalled();
  });

  it('does not auto-map or promote a direct-email owner outside the expected replay target', async () => {
    await expect(
      resolveXapiUser(
        {
          email: 'learner@example.com',
          actorIdentifier: 'actor-1',
          actorHomePage: 'https://coursera.example',
        },
        { organizationId: 'org-1', expectedUserId: 'reviewed-user' },
      ),
    ).resolves.toBeNull();

    expect(mocks.findMany).toHaveBeenCalled();
    expect(mocks.mapIdentityAndProgress).not.toHaveBeenCalled();
    expect(mocks.executeRaw).not.toHaveBeenCalled();
  });

  it('does not update mapping last-seen outside the expected replay target', async () => {
    mocks.queryRaw.mockReset()
      .mockResolvedValueOnce([
        {
          id: 'mapping-1',
          userId: 'mapped-user',
          organizationId: 'org-1',
          courseraEmail: null,
          actorIdentifier: 'actor-1',
          actorHomePage: 'https://coursera.example',
          source: 'manual',
          notes: null,
          lastSeenAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          userEmail: 'mapped@example.com',
          userFullName: 'Mapped User',
        },
      ])
      .mockResolvedValueOnce([]);

    await expect(
      resolveXapiUser(
        {
          actorIdentifier: 'actor-1',
          actorHomePage: 'https://coursera.example',
        },
        { organizationId: 'org-1', expectedUserId: 'reviewed-user' },
      ),
    ).resolves.toBeNull();

    expect(mocks.findMany).not.toHaveBeenCalled();
    expect(mocks.executeRaw).not.toHaveBeenCalled();
    expect(mocks.mapIdentityAndProgress).not.toHaveBeenCalled();
  });
});
