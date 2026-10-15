import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getUser } from '@/lib/auth/server';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import { withTenantScope } from '@/lib/tenant/withTenantScope';
import { getProgramBySlug } from '@/lib/content/programs';
import { programSlugsEquivalent } from '@/lib/content/programSlug';
import { isWorkforceApCourse, workforceApCourseHref } from '@/lib/content/courseDelivery';
import { getProgramCoursesForCurriculumVersion } from '@/lib/member/curriculumAssignment';
import { resolveActiveDashboardProgram } from '@/lib/member/resolveActiveDashboardProgram';
import { hasMemberCourseraCourseAccess } from '@/lib/coursera/memberCourseAccess';
import { DesignSurface, PageOpener } from '@/components/portal/kit';
import TrainingCourseList from '@/components/portal/TrainingCourseList';

/** Explicit enrollment handoff; rendering this page never provisions a seat. */
export default async function CourseraEnrollmentPage({ searchParams }: {
  searchParams: Promise<{ program?: string; course?: string }>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams({ ...(params.program ? { program: params.program } : {}), ...(params.course ? { course: params.course } : {}) });
  const user = await getUser();
  if (!user) redirect(`/login?redirectTo=${encodeURIComponent(`/dashboard/program/coursera-enrollment?${query}`)}`);
  const organizationId = await getActorOrganizationId(user.id);
  const member = await withTenantScope(organizationId, (db) => db.user.findUnique({
    where: { id: user.id },
    select: {
      organizationId: true, enrolledProgram: true, courseraEnrollmentApproved: true,
      courseEnrollments: {
        select: { id: true, programSlug: true, curriculumVersion: true, isPrimary: true, enrolledAt: true },
        orderBy: [{ isPrimary: 'desc' }, { enrolledAt: 'desc' }],
      },
    },
  }));
  if (!member) redirect('/dashboard/program');
  const { activeProgramSlug } = resolveActiveDashboardProgram({
    enrollments: member.courseEnrollments,
    legacyEnrolledProgram: member.enrolledProgram,
    requestedProgramSlug: params.program,
  });
  const program = activeProgramSlug ? getProgramBySlug(activeProgramSlug) : null;
  const curriculumVersion = member.courseEnrollments.find((row) => activeProgramSlug && programSlugsEquivalent(row.programSlug, activeProgramSlug))?.curriculumVersion ?? 'legacy-v1';
  const course = program && getProgramCoursesForCurriculumVersion(program, curriculumVersion).find((row) => row.slug === params.course);
  if (!program || !activeProgramSlug || !course) redirect('/dashboard/program?error=course_not_assigned');
  if (isWorkforceApCourse(course)) redirect(workforceApCourseHref(course.slug, activeProgramSlug));
  const hasAccess = await hasMemberCourseraCourseAccess({
    userId: user.id, email: user.email, organizationId: member.organizationId, programSlug: activeProgramSlug,
    curriculumVersion, courseSlug: course.slug, courseraCourseId: course.courseraCourseId,
  });
  const backHref = `/dashboard/program?${new URLSearchParams({ program: activeProgramSlug, course: course.slug })}`;
  return (
    <DesignSurface surface="warm">
      <div className="wa-space-y-6 wa-p-6">
        <PageOpener kicker="My program" title="Course access" lede="Enroll before opening a new Coursera course. If Coursera sends an invitation, accept it in your email, then return here and enroll again." />
        {course.courseraCourseId || hasAccess ? (
          <TrainingCourseList courses={[course]} completedSlugs={[]} programSlug={activeProgramSlug}
            enrollmentProgramSlug={member.courseEnrollments.some((row) => programSlugsEquivalent(row.programSlug, activeProgramSlug)) ? activeProgramSlug : undefined}
            eligibilityApproved={member.courseraEnrollmentApproved}
            enrolledCourseraCourseIds={hasAccess && course.courseraCourseId ? [course.courseraCourseId] : []} />
        ) : <p role="status">This course is still being set up for enrollment. Message your counselor for help.</p>}
        <Link href={backHref} className="wa-kit-cta wa-kit-cta--ghost wa-kit-focus">Back to My Program</Link>
      </div>
    </DesignSurface>
  );
}
