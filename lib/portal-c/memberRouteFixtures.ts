import type { Prisma } from '@prisma/client';
import fixture from '@/scripts/lib/preview-e2e-member-fixture.cjs';
import { DIGITAL_LITERACY_PROGRAM_SLUG } from '@/shared/digitalLiteracyPathway';
import { resolveWorkforceApModule } from '@/lib/content/workforceApModule';
import { IT_SUPPORT_LAB_COURSE_SLUG, listPracticeLabsForAssignment } from '@/lib/content/itSupportLabs';
import { canonicalizeProgramSlug } from '@/lib/content/programSlug';
import { getCareerBriefContent, getCareerBriefs } from '@/lib/content/careerBriefs';
import { withTenantScope } from '@/lib/tenant/withTenantScope';

type FixtureDatabase = Prisma.TransactionClient;
const REQUIRED = ['learning-module', 'lab', 'counselor-detail', 'mentor-profile', 'career-brief-detail'] as const;

/** Resolve existing authorized records only; never enroll, generate AI output, or publish a mentor. */
export async function resolvePortalCMemberRouteFixtures(prisma: FixtureDatabase) {
  const member = await fixture.findFixtureMember(prisma);
  if (!member.organizationId) throw new Error('The synthetic member organization was not confirmed.');
  const [enrollments, session, mentor] = await withTenantScope(member.organizationId, db => Promise.all([
    db.courseEnrollment.findMany({
      where: { userId: member.id, organizationId: member.organizationId },
      orderBy: [{ isPrimary: 'desc' }, { enrolledAt: 'desc' }],
      select: { programSlug: true, curriculumVersion: true },
    }),
    db.aIToolResult.findFirst({
      where: { userId: member.id, toolType: 'career_counselor' },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], select: { id: true },
    }),
    db.mentor.findFirst({
      where: { isActive: true, approvedAt: { not: null }, user: {
        organizationId: member.organizationId, deletedAt: null,
        email: { endsWith: '-test@workforceap.org', mode: 'insensitive' },
      } },
      orderBy: { id: 'asc' }, select: { id: true },
    }),
  ]), prisma);
  const fixtures: Record<string, string> = {};
  // Digital literacy explicitly permits every authenticated member, without an enrollment.
  const courseSlug = `${DIGITAL_LITERACY_PROGRAM_SLUG}-course-1`;
  if (resolveWorkforceApModule({ programSlug: DIGITAL_LITERACY_PROGRAM_SLUG, curriculumVersion: '', courseSlug })) {
    fixtures['learning-module'] = `/dashboard/learning/modules/${courseSlug}?program=${DIGITAL_LITERACY_PROGRAM_SLUG}`;
  }
  for (const enrollment of enrollments) {
    const labs = listPracticeLabsForAssignment({
      programSlug: canonicalizeProgramSlug(enrollment.programSlug),
      curriculumVersion: enrollment.curriculumVersion,
      courseSlug: IT_SUPPORT_LAB_COURSE_SLUG,
    });
    if (labs[0]) { fixtures.lab = `/dashboard/learning/labs/${labs[0].id}`; break; }
  }
  if (session) fixtures['counselor-detail'] = `/dashboard/counselor/${session.id}`;
  if (mentor) fixtures['mentor-profile'] = `/dashboard/mentors/${mentor.id}`;
  // The current readiness overview no longer links the historical brief catalog.
  const brief = getCareerBriefs().find(candidate => getCareerBriefContent(candidate.slug));
  if (brief) fixtures['career-brief-detail'] = `/dashboard/career-brief/${brief.slug}`;
  return { fixtures, missing: REQUIRED.filter(slug => !fixtures[slug]) };
}
