// @vitest-environment node
/**
 * In-office AI tools resolve a subject member through resolveActOnBehalf.
 * Every AI route mocks this helper, so the tenant/assignment matrix is not
 * covered there. A regression would let a counselor or foreign admin run
 * resume/cover-letter tools on a member they are not assigned to.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findUser: vi.fn(),
  findAssignment: vi.fn(),
  superAdmin: vi.fn(),
  admin: vi.fn(),
  adminInOrg: vi.fn(),
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    user: { findUnique: mocks.findUser },
    counselorAssignment: { findFirst: mocks.findAssignment },
  },
}));
vi.mock('@/lib/auth/roles', () => ({
  isSuperAdmin: mocks.superAdmin,
  isAdmin: mocks.admin,
  isAdminInOrg: mocks.adminInOrg,
}));

import { resolveActOnBehalf } from '@/lib/auth/actAsSubject';

const ACTOR = 'actor-1';
const MEMBER = 'member-1';
const ORG = 'org-a';

beforeEach(() => {
  vi.resetAllMocks();
  mocks.findUser.mockImplementation(async ({ where }: { where: { id: string } }) => {
    if (where.id === ACTOR) return { fullName: 'Staff Actor' };
    if (where.id === MEMBER) return { id: MEMBER, organizationId: ORG };
    return null;
  });
  mocks.findAssignment.mockResolvedValue(null);
  mocks.superAdmin.mockResolvedValue(false);
  mocks.admin.mockResolvedValue(false);
  mocks.adminInOrg.mockResolvedValue(false);
});

describe('resolveActOnBehalf', () => {
  it.each([undefined, null, ACTOR])('treats %j as the actor running the tool on themselves', async (subject) => {
    const result = await resolveActOnBehalf(ACTOR, subject);
    expect(result).toEqual({
      ok: true,
      subjectUserId: ACTOR,
      isOnBehalf: false,
      actorUserId: ACTOR,
      actorName: 'Staff Actor',
    });
    expect(mocks.superAdmin).not.toHaveBeenCalled();
    expect(mocks.findAssignment).not.toHaveBeenCalled();
  });

  it('returns 404 for a missing or deleted subject before checking authority', async () => {
    mocks.findUser.mockImplementation(async ({ where }: { where: { id: string } }) => (
      where.id === ACTOR ? { fullName: 'Staff Actor' } : null
    ));
    const result = await resolveActOnBehalf(ACTOR, 'ghost');
    expect(result).toEqual({ ok: false, status: 404, error: 'Member not found' });
    expect(mocks.findUser).toHaveBeenCalledWith({
      where: { id: 'ghost', deletedAt: null },
      select: { id: true, organizationId: true },
    });
    expect(mocks.superAdmin).not.toHaveBeenCalled();
    expect(mocks.findAssignment).not.toHaveBeenCalled();
  });

  it('lets a super-admin act across tenants without an assignment', async () => {
    mocks.superAdmin.mockResolvedValue(true);
    mocks.admin.mockResolvedValue(true);
    const result = await resolveActOnBehalf(ACTOR, MEMBER);
    expect(result).toMatchObject({ ok: true, subjectUserId: MEMBER, isOnBehalf: true, actorUserId: ACTOR });
    expect(mocks.adminInOrg).not.toHaveBeenCalled();
    expect(mocks.findAssignment).not.toHaveBeenCalled();
  });

  it('lets a same-org admin act without an assignment', async () => {
    mocks.admin.mockResolvedValue(true);
    mocks.adminInOrg.mockImplementation(async (userId: string, orgId: string) => userId === ACTOR && orgId === ORG);
    const result = await resolveActOnBehalf(ACTOR, MEMBER);
    expect(result).toMatchObject({ ok: true, isOnBehalf: true, subjectUserId: MEMBER });
    expect(mocks.adminInOrg).toHaveBeenCalledWith(ACTOR, ORG);
    expect(mocks.findAssignment).not.toHaveBeenCalled();
  });

  it('rejects a foreign-org admin who is not the assigned counselor', async () => {
    mocks.admin.mockResolvedValue(true);
    mocks.adminInOrg.mockResolvedValue(false);
    const result = await resolveActOnBehalf(ACTOR, MEMBER);
    expect(result).toEqual({
      ok: false,
      status: 403,
      error: 'You are not authorized to run tools on behalf of this member.',
    });
    expect(mocks.findAssignment).toHaveBeenCalledWith({
      where: {
        memberId: MEMBER,
        active: true,
        counselor: { userId: ACTOR, active: true },
      },
      select: { id: true },
    });
  });

  it('lets an actively assigned counselor act on that member', async () => {
    mocks.findAssignment.mockResolvedValue({ id: 'assignment-1' });
    const result = await resolveActOnBehalf(ACTOR, MEMBER);
    expect(result).toMatchObject({
      ok: true,
      isOnBehalf: true,
      subjectUserId: MEMBER,
      actorName: 'Staff Actor',
    });
  });
});
