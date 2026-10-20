import { describe, expect, it, vi } from 'vitest';
import { resolvePortalCMemberRouteFixtures } from '../lib/portal-c/memberRouteFixtures';
import { IT_SUPPORT_LAB_PROGRAM_SLUG } from '../lib/content/itSupportLabs';
import { APPROVED_CURRICULUM_VERSION, LEGACY_CURRICULUM_VERSION } from '../lib/content/programCurriculumManifest';
import { DEV_MEMBER_VIEWS } from '../app/dev/member/harness/registry';
import { parseMemberRouteFixtures } from '../scripts/lib/portal-c-member-routes.mjs';

function database(complete = true) {
  return {
    organization: { findFirst: vi.fn(async () => ({ id: 'portal-qa' })) },
    user: { findFirst: vi.fn(async () => ({ id: 'member-fixture', organizationId: 'portal-qa' })) },
    courseEnrollment: { findMany: vi.fn(async (): Promise<Array<{ programSlug: string; curriculumVersion: string }>> => complete ? [{ programSlug: IT_SUPPORT_LAB_PROGRAM_SLUG, curriculumVersion: LEGACY_CURRICULUM_VERSION }] : []) },
    aIToolResult: { findFirst: vi.fn(async () => complete ? { id: 'owned-session' } : null) },
    mentor: { findFirst: vi.fn(async () => complete ? { id: 'approved-qa-mentor' } : null) },
  };
}
const resolve = (prisma: ReturnType<typeof database>) => resolvePortalCMemberRouteFixtures(prisma as unknown as Parameters<typeof resolvePortalCMemberRouteFixtures>[0]);

describe('existing synthetic member route fixtures', () => {
  it('resolves actual catalog routes and scoped records without a writer or provider client', async () => {
    const prisma = database();
    const result = await resolve(prisma);
    expect(result.missing).toEqual([]);
    expect(Object.keys(result.fixtures)).toHaveLength(5);
    expect(parseMemberRouteFixtures(JSON.stringify(result.fixtures), DEV_MEMBER_VIEWS)).toEqual(result.fixtures);
    expect(result.fixtures['counselor-detail']).toBe('/dashboard/counselor/owned-session');
    expect(result.fixtures['mentor-profile']).toBe('/dashboard/mentors/approved-qa-mentor');
    expect(prisma.aIToolResult.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'member-fixture', toolType: 'career_counselor' } }));
    expect(prisma.courseEnrollment.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'member-fixture', organizationId: 'portal-qa' } }));
    expect(prisma.mentor.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: {
      isActive: true, approvedAt: { not: null }, user: { organizationId: 'portal-qa', deletedAt: null, email: { endsWith: '-test@workforceap.org', mode: 'insensitive' } },
    } }));
  });
  it('reports missing assignments, sessions and mentors without inventing them or substituting an access-denied page', async () => {
    const result = await resolve(database(false));
    expect(result.missing).toEqual(['lab', 'counselor-detail', 'mentor-profile']);
    expect(result.fixtures).not.toHaveProperty('lab');
    expect(result.fixtures).toHaveProperty('learning-module');
    expect(result.fixtures).toHaveProperty('career-brief-detail');
  });
  it('keeps a newer curriculum from being reinterpreted as the historical lab assignment', async () => {
    const prisma = database();
    prisma.courseEnrollment.findMany.mockResolvedValueOnce([{ programSlug: IT_SUPPORT_LAB_PROGRAM_SLUG, curriculumVersion: APPROVED_CURRICULUM_VERSION }]);
    expect((await resolve(prisma)).missing).toEqual(['lab']);
  });
  it('refuses discovery before any detail read when the dedicated member is absent', async () => {
    const prisma = database();
    prisma.user.findFirst.mockResolvedValueOnce(null as never);
    await expect(resolve(prisma)).rejects.toThrow('Fixture member');
    expect(prisma.courseEnrollment.findMany).not.toHaveBeenCalled();
    expect(prisma.aIToolResult.findFirst).not.toHaveBeenCalled();
    expect(prisma.mentor.findFirst).not.toHaveBeenCalled();
  });
});
