import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { GraduationCap } from 'lucide-react';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { prisma } from '@/lib/db/prisma';
import { PROGRAMS, getProgramBySlug } from '@/lib/content/programs';
import { isWorkforceApCourse, workforceApCourseHref } from '@/lib/content/courseDelivery';
import { DISCOVERED_COURSERA_PROGRAMS } from '@/lib/content/courseraDiscoveredCatalog';
import { fetchLearnerProgressFromB4B } from '@/lib/coursera/learnerProgress';
import { loadMemberProgramTrainingView } from '@/lib/member/memberProgramTrainingView';
import { getActiveProgramForDashboard } from '@/lib/member/getActiveProgramForDashboard';
import { getActiveProgramsResult } from '@/lib/platform/programCatalog';
import ProgramPicker from '@/components/portal/ProgramPicker';
import { ProgramIcon } from '@/components/ProgramIcon';
import MobileBottomNav from '@/components/MobileBottomNav';
import PageHeader from '@/components/portal/PageHeader';
import PortalCard from '@/components/portal/ui/PortalCard';
import ProgramChangeRequestModal from '@/components/portal/ProgramChangeRequestModal';
import { canBypassMemberAssessment } from '@/lib/auth/roles';
import StaffViewBanner from '@/components/portal/StaffViewBanner';
import CourseraProgressCoverageNotice from '@/components/portal/CourseraProgressCoverageNotice';
import { formatDate } from '@/lib/i18n/date';
import { DesignSurface, PageOpener } from '@/components/portal/kit';
import { MemberProgramKit } from '@/components/portal/kit/pages/member/MemberProgramKit';
import { describeCourseDenominator } from '@/lib/coursera/progressTileSummary';
import { isReadOnlyPortalAuditHeader } from '@/lib/audit/readOnlyPortalAudit';
import { getProgramCoursesForCurriculumVersion } from '@/lib/member/curriculumAssignment';
import { loadTrainingWorkspace } from '@/lib/member/loadTrainingWorkspace';
import { assignedSyllabusBreakdown } from '@/lib/member/trainingWorkspace';
import { loadTrainingCoursePractice } from '@/lib/member/trainingCoursePractice';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard');
  return buildPageMetadataAsync({
    title: t('programMetaTitle'),
    description: t('programMetaDesc'),
    path: '/dashboard/program',
  });
}

export default async function ProgramPage({
  searchParams,
}: {
  searchParams?: Promise<{ ui?: string; course?: string }>;
}) {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/dashboard/program');

  const params = await searchParams;
  const requestedUi = typeof params?.ui === 'string' ? params.ui : null;
  const readOnlyAudit = isReadOnlyPortalAuditHeader(await headers());

  const [dbUser, activeProgramView] = await Promise.all([
    prisma.user.findUnique({
      where: { id: user.id },
      select: {
        enrolledProgram: true,
        organizationId: true,
        enrolledAt: true,
        workspaceEmail: true,
        workspaceEmailProvisioned: true,
        courseEnrollments: {
          select: {
            id: true,
            programSlug: true,
            curriculumVersion: true,
            isPrimary: true,
            workspaceEmail: true,
            workspaceEmailProvisioned: true,
            enrolledAt: true,
          },
          orderBy: [{ isPrimary: 'desc' }, { enrolledAt: 'desc' }],
        },
      },
    }),
    getActiveProgramForDashboard({ userId: user.id }),
  ]);
  const catalogResult = await getActiveProgramsResult(dbUser?.organizationId, { readOnlyAudit });
  let pickerPrograms = catalogResult.programs
    .map((v) => v.static)
    .filter((p): p is NonNullable<typeof p> => !!p);
  if (pickerPrograms.length === 0) pickerPrograms = PROGRAMS;

  // Match the launch handler's enrollment resolution. The legacy User field can
  // drift from the primary CourseEnrollment and must not render a different course.
  const enrolledSlug = activeProgramView.activeProgramSlug;
  const program = enrolledSlug ? getProgramBySlug(enrolledSlug) : null;
  const activeEnrollment =
    dbUser?.courseEnrollments.find((row) => row.programSlug === enrolledSlug) ??
    dbUser?.courseEnrollments[0];
  const enrolledAt = activeEnrollment?.enrolledAt ?? dbUser?.enrolledAt ?? null;
  const staffViewer = await canBypassMemberAssessment(user.id);
  const otherPrograms = pickerPrograms.filter((p) => p.slug !== enrolledSlug);
  const pendingRequest = await prisma.programChangeRequest.findFirst({
    where: { userId: user.id, status: 'PENDING' },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });
  // Product stake: members can choose an initial program, but self-serve switching should not
  // become a public free-for-all. Keep later reassignment counselor/admin-driven.
  if (!enrolledSlug || !program) {
    return (
      <DesignSurface surface="warm">
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: 'var(--wa-pad-sm)' }} className="wa-space-y-6">
          {catalogResult.loadFailed ? <span hidden data-portal-error-state="member-program-catalog-load" /> : null}
          {staffViewer && <StaffViewBanner page="program" />}
          <PageOpener
            kicker="Program"
            title="Choose your program"
            lede="Funding covers one program at a time. Your counselor can help you switch later."
            icon={<GraduationCap size={13} aria-hidden="true" />}
          />
          <ProgramPicker programs={pickerPrograms.length ? pickerPrograms : []} />
        </div>
      </DesignSurface>
    );
  }

  const curriculumCourses = getProgramCoursesForCurriculumVersion(
    program,
    activeEnrollment?.curriculumVersion ?? 'legacy-v1',
  );

  const tenantCourseMappings = dbUser?.organizationId
    ? await prisma.course.findMany({
        where: {
          organizationId: dbUser.organizationId,
          programSlug: enrolledSlug,
          courseraSlug: { not: null },
        },
        select: { courseSlug: true, courseraSlug: true },
      })
    : [];
  const launchableCourseSlugs = new Set([
    ...tenantCourseMappings
      .filter((course) => Boolean(course.courseraSlug?.trim()))
      .map((course) => course.courseSlug),
    ...(DISCOVERED_COURSERA_PROGRAMS[enrolledSlug]?.courses
      .filter((course) => Boolean(course.courseId?.trim()))
      .map((course) => course.slug) ?? []),
    // Board-approved syllabus courses carry verified public Coursera slugs.
    // Keep those launchable while the Enterprise discovery snapshot catches
    // up; the launch route resolves them before any index-based legacy map.
    ...curriculumCourses
      .filter((course) => Boolean(course.courseraSlug?.trim()))
      .map((course) => course.slug),
  ]);

  const courseraProgramId = DISCOVERED_COURSERA_PROGRAMS[enrolledSlug]?.courseraProgramId;
  const b4bProgress =
    user.email && enrolledSlug
      ? await fetchLearnerProgressFromB4B(user.email, {
          programId: courseraProgramId,
          readOnlyAudit,
        }).catch((err: unknown) => {
          console.warn('[dashboard/program] B4B learner progress unavailable:', err);
          return new Map();
        })
      : new Map();

  const [trainingView, workspaceResult] = await Promise.all([loadMemberProgramTrainingView({
    userId: user.id,
    programSlug: enrolledSlug,
    b4bProgress,
    readOnlyAudit,
  }), requestedUi !== 'legacy'
    ? loadTrainingWorkspace({ userId: user.id, programSlug: enrolledSlug })
        .then((workspace) => ({ workspace, failed: false }))
        .catch(() => {
          console.error('[dashboard/program] Training workspace unavailable.');
          return { workspace: null, failed: true };
        })
    : Promise.resolve({ workspace: null, failed: false }),
  ]);
  const completedSet = new Set(trainingView?.completedSlugsAuthoritative ?? []);
  const completedCount = trainingView?.completedCount ?? 0;
  const nextCourseSlug =
    trainingView?.nextIncompleteCourseSlug ??
    curriculumCourses.find((c) => !completedSet.has(c.slug))?.slug ??
    null;

  // ── v2 KIT is the DEFAULT for the My Program page (real data); legacy view
  // stays reachable via ?ui=legacy. Reuses the enrollment/progress already
  // loaded above. Renders only when a program is actually enrolled — the
  // unenrolled "choose your program" picker above keeps its own legacy UI.
  if (requestedUi !== 'legacy') {
    const coursePractice = workspaceResult.workspace
      ? await loadTrainingCoursePractice({ userId: user.id, workspace: workspaceResult.workspace, completedCourseSlugs: [...completedSet] })
          .then((missions) => ({ missions, unavailable: false }))
          .catch(() => ({ missions: [], unavailable: true }))
      : { missions: [], unavailable: false };
    const totalCourses = curriculumCourses.length;
    const progressPercent =
      trainingView?.progressPercentDisplay ??
      (totalCourses > 0 ? Math.round((completedCount / totalCourses) * 100) : 0);
    const nextCourseLaunchHref = nextCourseSlug && launchableCourseSlugs.has(nextCourseSlug)
      ? `/api/member/coursera/launch?course=${encodeURIComponent(nextCourseSlug)}`
      : undefined;

    // Per-course state: completed → done, the resolved "next" course → active,
    // everything else → locked. WorkforceAP-authored programs (Digital Literacy)
    // are self-paced and not sequential — every unfinished module stays open,
    // and completed modules remain reopenable.
    const workforceApProgram = curriculumCourses.length > 0
      && curriculumCourses.every((course) => isWorkforceApCourse(course));
    const modules = curriculumCourses.map((c) => {
      const done = completedSet.has(c.slug);
      const isNext = !done && c.slug === nextCourseSlug;
      return {
        title: c.name,
        slug: c.slug,
        launchHref: launchableCourseSlugs.has(c.slug)
          ? `/api/member/coursera/launch?course=${encodeURIComponent(c.slug)}`
          : undefined,
        // A WorkforceAP-authored course never has a Coursera launch, so without
        // this its CTA fell through to the Learning Hub anchor, which renders no
        // module content.
        moduleHref: isWorkforceApCourse(c)
          ? workforceApCourseHref(c.slug, enrolledSlug)
          : undefined,
        state: done
          ? ('done' as const)
          : workforceApProgram || isNext
            ? ('active' as const)
            : ('locked' as const),
      };
    });

    // Remaining effort estimate from the static catalog hours on not-yet-done
    // courses (readily available; no extra query).
    const hoursRemaining = curriculumCourses
      .filter((c) => !completedSet.has(c.slug))
      .reduce((sum, c) => sum + (c.estimatedHours ?? 0), 0);

    return (
      <>
      {readOnlyAudit ? <span hidden data-portal-audit-suppressed="member-program-coursera-course-resolution" /> : null}
      {catalogResult.loadFailed ? <span hidden data-portal-error-state="member-program-catalog-load" /> : null}
      {activeProgramView.noProgram ? (
        <div className="wa-kit-card wa-mb-4" role="status">
          <strong>Your Coursera progress is saved.</strong>{' '}
          A counselor still needs to enroll you in a WorkforceAP program.
        </div>
      ) : null}
      <CourseraProgressCoverageNotice coverage={trainingView?.providerCoverage} />
      <MemberProgramKit
        trainingWorkspace={workspaceResult.workspace ? {
          workspace: workspaceResult.workspace,
          programTitle: program.title,
          completedSlugs: [...completedSet],
          practiceMissions: coursePractice.missions,
          practiceUnavailable: coursePractice.unavailable,
          initialCourseSlug: typeof params?.course === 'string' ? params.course : undefined,
          syllabusHours: program.syllabus?.totalHours,
          syllabusBreakdown: assignedSyllabusBreakdown(curriculumCourses, program.syllabus),
          trainingEmail: activeEnrollment?.workspaceEmail ?? dbUser?.workspaceEmail,
          destinations: curriculumCourses.map((course) => ({
            slug: course.slug,
            ...(course.kind === 'workforceap'
              ? { moduleHref: workforceApCourseHref(course.slug, enrolledSlug) }
              : launchableCourseSlugs.has(course.slug)
                ? { launchHref: `/api/member/coursera/launch?course=${encodeURIComponent(course.slug)}` }
                : {}),
          })),
        } : undefined}
        programTitle={program.title}
        progressPercent={progressPercent}
        modulesComplete={completedCount}
        modulesTotal={totalCourses}
        modulesNote={describeCourseDenominator(curriculumCourses)}
        estRemaining={hoursRemaining > 0 ? `${hoursRemaining} hrs remaining` : undefined}
        resumeHref="/dashboard/learning"
        courseraLaunchHref={nextCourseLaunchHref}
        modules={modules}
        // Live session + missions aren't loaded on this route — keep the kit
        // defaults and point the missions CTA at the live missions page.
        missionsHref="/dashboard/missions"
      />
      {workspaceResult.failed ? <p className="wa-kit-training-notice" role="status">Your saved training workspace could not be loaded. Your course progress is still available above. Reload to try again.</p> : null}
      </>
    );
  }

  return (
    <>
      {catalogResult.loadFailed ? <span hidden data-portal-error-state="member-program-catalog-load" /> : null}
      <div className="portal-pad-x" style={{ paddingBottom: '6rem' }}>
        {activeProgramView.noProgram ? (
          <div className="wa-kit-card wa-mb-4" role="status">
            <strong>Your Coursera progress is saved.</strong>{' '}
            A counselor still needs to enroll you in a WorkforceAP program.
          </div>
        ) : null}
        {staffViewer && <StaffViewBanner page="program" />}
        <PageHeader
          title="My Program"
          subtitle={enrolledAt ? `Enrolled ${formatDate(enrolledAt)}` : undefined}
          breadcrumbs={[{ label: 'Member Portal', href: '/dashboard' }, { label: 'My Program' }]}
        />

        <PortalCard>
          <CourseraProgressCoverageNotice coverage={trainingView?.providerCoverage} />
          <div style={{ marginBottom: '1rem', padding: '0.9rem 1rem', borderRadius: '0.75rem', background: 'var(--surface-container-low)', border: '1px solid var(--outline-variant)' }}>
            <p style={{ margin: 0, fontSize: '0.8125rem', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-on-surface-variant)' }}>
              Coursera & training email
            </p>
            <p style={{ margin: '0.35rem 0 0', fontSize: '0.9rem', lineHeight: 1.55 }}>
              {activeEnrollment?.workspaceEmailProvisioned || dbUser?.workspaceEmailProvisioned
                ? 'Your WorkforceAP training seat is on file. Use the training email below when opening Coursera links so progress syncs.'
                : 'Staff still provisions Coursera under your assigned WorkforceAP workspace email when your seat is ready — watch Counselor Chat for the exact address.'}
            </p>
            {(activeEnrollment?.workspaceEmail || dbUser?.workspaceEmail) && (
              <p style={{ margin: '0.5rem 0 0', fontWeight: 700, wordBreak: 'break-all' }}>
                {activeEnrollment?.workspaceEmail ?? dbUser?.workspaceEmail}
              </p>
            )}
            <div style={{ marginTop: '0.75rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              <Link href="/dashboard/program/start" className="btn btn-outline btn-small">
                Path to certification
              </Link>
              <Link href="/dashboard" className="btn btn-primary btn-small">
                Open Training
              </Link>
            </div>
          </div>
          <div className="dashboard-program-detail" style={{ borderLeft: `4px solid ${program.borderColor}` }}>
            <div className="dashboard-program-detail-header">
              <span className="dashboard-program-detail-icon">
                <ProgramIcon program={program} size={28} />
              </span>
              <div>
                <h2 className="portal-section-heading" style={{ fontSize: '1.25rem', marginBottom: '0.25rem' }}>
                  {program.title}
                </h2>
                <span
                  style={{
                    background: program.categoryColor,
                    color: 'white',
                    padding: '0.2rem 0.6rem',
                    borderRadius: '50px',
                    fontSize: '0.8125rem',
                    fontWeight: 600,
                  }}
                >
                  {program.categoryLabel}
                </span>
              </div>
            </div>
            <div className="dashboard-program-detail-meta">
              <span>⏱ {program.duration}</span>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-on-surface-variant)' }}>
              Progress: {completedCount} of {curriculumCourses.length} courses complete
            </p>
            <div
              style={{
                height: '6px',
                background: 'var(--surface-container-highest)',
                borderRadius: '3px',
                marginBottom: '1.5rem',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${curriculumCourses.length > 0 ? (completedCount / curriculumCourses.length) * 100 : 0}%`,
                  background: program.categoryColor,
                  borderRadius: '3px',
                }}
              />
            </div>
            <h3 className="portal-section-heading" style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>
              Course list
            </h3>
            <ul className="dashboard-program-course-list">
              {curriculumCourses.map((c) => {
                const done = completedSet.has(c.slug);
                const isNext = !done && c.slug === nextCourseSlug;
                const isLocked = !done && !isNext;
                return (
                  <li
                    key={c.slug}
                    className={done ? 'is-done' : isNext ? 'is-next' : isLocked ? 'is-locked' : ''}
                  >
                    <span className="dashboard-program-course-name">
                      {done ? (
                        <span className="dashboard-program-course-check material-symbols-outlined" aria-hidden>
                          check_circle
                        </span>
                      ) : null}
                      {isLocked ? (
                        <span className="dashboard-program-course-lock material-symbols-outlined" aria-hidden>
                          lock
                        </span>
                      ) : null}
                      <span className={done ? 'dashboard-program-course-title--done' : undefined}>{c.name}</span>
                      {isNext ? <span className="dashboard-program-up-next">Up next</span> : null}
                    </span>
                    <span className={`dashboard-program-badge ${done ? 'complete' : isNext ? 'next' : 'pending'}`}>
                      {done ? 'Complete' : isNext ? 'Current' : 'Locked'}
                    </span>
                  </li>
                );
              })}
            </ul>
            <div style={{ marginTop: '1rem', display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
              <Link href="/dashboard" className="btn btn-primary">
                Go to Training
              </Link>
              <ProgramChangeRequestModal
                currentProgram={program}
                programs={otherPrograms}
                hasPendingRequest={!!pendingRequest}
              />
            </div>
          </div>
        </PortalCard>

      </div>
      <MobileBottomNav variant="portal" />
    </>
  );
}
