import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { CheckCircle } from 'lucide-react';

import { buildPageMetadataAsync } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { resolveAdminPageTenant, withAdminPageScope, inheritUserOrg, inheritMemberOrg, inheritLeaderOrg, inheritInvitedByOrg } from '@/lib/tenant/adminPageScope';
import { prisma } from '@/lib/db/prisma';
import { getProgramBySlug } from '@/lib/content/programs';
import { programSlugsEquivalent } from '@/lib/content/programSlug';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import { loadLearnerProgressByUserId } from '@/lib/coursera/progressQueries';

import PageHeader from '@/components/portal/PageHeader';
import MemberProgressStrip from '@/components/portal/MemberProgressStrip';
import AdminMemberResumeSection from '@/components/admin/AdminMemberResumeSection';
import { getProgramCoursesForCurriculumVersion } from '@/lib/member/curriculumAssignment';
import { reconcileProgramProgress } from '@/lib/coursera/progressReconciliation';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadataAsync({
    title: 'Stakeholder view',
    description: 'Read-only member summary for stakeholder review.',
    path: '/admin/members',
  });
}

type CourseProgressRow = {
  programSlug: string;
  courseSlug: string;
  courseId: string | null;
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
  percentComplete: number;
  lastUpdatedAt: Date;
};

const sectionStyle = {
  padding: '1.25rem',
  background: 'var(--color-light)',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--outline-variant)',
} as const;

const heroStyle = {
  padding: '1.5rem',
  background:
    'linear-gradient(135deg, color-mix(in srgb, var(--color-accent) 8%, transparent), var(--color-light))',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--outline-variant)',
} as const;

const sectionHeading = { fontSize: '1.05rem', margin: '0 0 0.75rem' } as const;

export default async function AdminMemberStakeholderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/admin/members');

  const scope = await resolveAdminPageTenant(user.id);
  if (!scope.ok) redirect('/dashboard');

  const { id } = await params;
  const orgId = await getActorOrganizationId(user.id);

  // Mirror the admin detail page select shape so the two views never
  // diverge on what counts as "current state".
  const member = await withAdminPageScope(scope, (db) => db.user.findFirst({
    where: { id },
    select: {
      id: true,
      email: true,
      fullName: true,
      deletedAt: true,
      enrolledProgram: true,
      enrolledAt: true,
      courseEnrollments: {
        where: { isPrimary: true },
        orderBy: { enrolledAt: 'desc' },
        take: 1,
        select: { programSlug: true, curriculumVersion: true },
      },
      assessmentCompleted: true,
      onboardingCompletedAt: true,
      courseProgress: {
        orderBy: { lastUpdatedAt: 'desc' },
        select: {
          programSlug: true,
          courseSlug: true,
          courseId: true,
          status: true,
          percentComplete: true,
          lastUpdatedAt: true,
        },
      },
      userCertifications: {
        orderBy: { earnedAt: 'desc' },
        select: { id: true, certName: true, earnedAt: true },
      },
    },
  }));

  if (!member || member.deletedAt) notFound();

  // Read placement data from the current source of truth (PlacementRecord),
  // falling back to the legacy PlacedOutcome table only if missing. This
  // ensures stakeholders see the same data as admins.
  const placementRecordRow = await prisma.placementRecord
    .findUnique({
      where: { userId: id },
      select: {
        employerName: true,
        jobTitle: true,
        salaryOffered: true,
        startDate: true,
        placedAt: true,
      },
    })
    .catch(() => null);

  const placedOutcomeLegacy = !placementRecordRow
    ? await prisma.placedOutcome
        .findUnique({
          where: { userId: id },
          select: {
            employerName: true,
            jobTitle: true,
            startingSalary: true,
            placedAt: true,
          },
        })
        .catch(() => null)
    : null;

  // Normalized placement row — always use PlacementRecord field names
  const placedOutcomeRow = placementRecordRow
    ? {
        employerName: placementRecordRow.employerName,
        jobTitle: placementRecordRow.jobTitle,
        startingSalary: placementRecordRow.salaryOffered,
        placedAt: placementRecordRow.startDate ?? placementRecordRow.placedAt,
      }
    : placedOutcomeLegacy
      ? {
          employerName: placedOutcomeLegacy.employerName,
          jobTitle: placedOutcomeLegacy.jobTitle,
          startingSalary: placedOutcomeLegacy.startingSalary,
          placedAt: placedOutcomeLegacy.placedAt,
        }
      : null;

  // Pre-screening flag drives the "intake" step on the journey strip,
  // mirroring the admin detail page logic exactly.
  const preScreening = await prisma.preScreeningResponse.findUnique({
    where: { userId: id },
  });

  const preScreeningCount = preScreening ? 1 : 0;

  const primaryEnrollment = member.courseEnrollments[0] ?? null;
  const activeProgramSlug = primaryEnrollment?.programSlug ?? member.enrolledProgram ?? null;
  const program = activeProgramSlug ? getProgramBySlug(activeProgramSlug) : null;
  const curriculumCourses = program
    ? getProgramCoursesForCurriculumVersion(
        program,
        primaryEnrollment?.curriculumVersion ?? 'legacy-v1',
      )
    : [];
  const liveCourseProgress = ((member.courseProgress ?? []) as CourseProgressRow[])
    .filter((row) =>
      activeProgramSlug ? programSlugsEquivalent(row.programSlug, activeProgramSlug) : false,
    );
  const liveProgressBySlug = new Map<string, CourseProgressRow>(
    liveCourseProgress.map((row) => [row.courseSlug, row]),
  );
  const programReconciliation = program
    ? reconcileProgramProgress({
        validatedCourses: curriculumCourses,
        localRows: liveCourseProgress.map((row) => ({
          courseSlug: row.courseSlug,
          courseId: row.courseId,
          status: row.status,
          percentComplete: row.percentComplete,
        })),
      })
    : null;
  const completedCount = programReconciliation?.completedCount ?? 0;

  const allCoursesComplete = programReconciliation?.allComplete ?? false;

  const progressStripProps = {
    intake: !!preScreening || !!(member as { onboardingCompletedAt?: unknown }).onboardingCompletedAt,
    assessment: !!member.assessmentCompleted,
    trainingStarted: liveCourseProgress.length > 0,
    certsComplete: allCoursesComplete,
    employed: !!placedOutcomeRow,
  };

  // Coursera training summary — same data source as the admin detail page.
  const courseraDetail = await loadLearnerProgressByUserId(member.id);
  const courseraCourseCount = courseraDetail?.courses.length ?? 0;
  const courseraCompletedCount =
    courseraDetail?.courses.filter((c) => c.isCompleted).length ?? 0;
  const courseraBadgeCount = courseraDetail?.badges.length ?? 0;
  const courseraCompletedBadgeCount =
    courseraDetail?.badges.filter((b) => b.badgeCompleted).length ?? 0;
  const courseraLastActivity = courseraDetail
    ? courseraDetail.courses.reduce<Date | null>((latest, c) => {
        if (!c.lastActivityTime) return latest;
        if (!latest || c.lastActivityTime > latest) return c.lastActivityTime;
        return latest;
      }, null)
    : null;

  const formatSalary = (value: number | null | undefined) => {
    if (value == null) return '—';
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0,
      }).format(value);
    } catch {
      return `$${value}`;
    }
  };

  return (
    <div>
      <PageHeader
        breadcrumbs={[
          { label: 'Admin', href: '/admin' },
          { label: 'Members', href: '/admin/members' },
          { label: member.fullName, href: `/admin/members/${id}` },
          { label: 'Stakeholder view' },
        ]}
        title={`${member.fullName} — stakeholder view`}
        subtitle="Read-only summary for admin review."
        action={
          <Link href={`/admin/members/${id}`} className="btn btn-outline">
            ← Back to admin detail
          </Link>
        }
      />

      {/* `minmax(0, 1fr)`: the auto track otherwise grows to the widest
          card's min-content (long untranslated labels once pushed it to
          1649px at a 1280px viewport). */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '1.5rem', maxWidth: '900px' }}>
        {/* Hero card */}
        <section className="content-card" style={heroStyle}>
          <p
            style={{
              fontSize: '0.7rem',
              fontWeight: 800,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'var(--color-accent)',
              margin: '0 0 0.4rem',
            }}
          >
            Member
          </p>
          <h2 style={{ fontSize: '1.6rem', margin: '0 0 0.75rem', lineHeight: 1.15 }}>
            {member.fullName}
          </h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '0.85rem 1.25rem',
              fontSize: '0.95rem',
            }}
          >
            <div>
              <p
                style={{
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: 'var(--color-on-surface-variant)',
                  margin: '0 0 0.2rem',
                }}
              >
                Program
              </p>
              <p style={{ margin: 0, fontWeight: 600 }}>
                {program?.title ?? 'Not enrolled'}
              </p>
            </div>
            <div>
              <p
                style={{
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: 'var(--color-on-surface-variant)',
                  margin: '0 0 0.2rem',
                }}
              >
                Enrolled
              </p>
              <p style={{ margin: 0, fontWeight: 600 }}>
                {member.enrolledAt
                  ? member.enrolledAt.toLocaleDateString('en-US', {
                      month: 'long',
                      day: 'numeric',
                      year: 'numeric',
                    })
                  : '—'}
              </p>
            </div>
          </div>
        </section>

        {/* Journey progress strip */}
        <section>
          <MemberProgressStrip {...progressStripProps} />
        </section>

        {/* Coursera training summary */}
        <section className="content-card" style={sectionStyle}>
          <h2 style={sectionHeading}>Coursera training</h2>
          {courseraDetail && (courseraCourseCount > 0 || courseraBadgeCount > 0) ? (
            <>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                  gap: '0.75rem',
                  marginBottom: '1rem',
                }}
              >
                <div>
                  <p
                    style={{
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      color: 'var(--color-on-surface-variant)',
                      margin: '0 0 0.2rem',
                    }}
                  >
                    Courses
                  </p>
                  <p style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>
                    {courseraCompletedCount}/{courseraCourseCount}{' '}
                    <span
                      style={{
                        fontSize: '0.8rem',
                        fontWeight: 500,
                        color: 'var(--color-on-surface-variant)',
                      }}
                    >
                      complete
                    </span>
                  </p>
                </div>
                <div>
                  <p
                    style={{
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      color: 'var(--color-on-surface-variant)',
                      margin: '0 0 0.2rem',
                    }}
                  >
                    Specializations
                  </p>
                  <p style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>
                    {courseraCompletedBadgeCount}/{courseraBadgeCount}{' '}
                    <span
                      style={{
                        fontSize: '0.8rem',
                        fontWeight: 500,
                        color: 'var(--color-on-surface-variant)',
                      }}
                    >
                      earned
                    </span>
                  </p>
                </div>
                <div>
                  <p
                    style={{
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      color: 'var(--color-on-surface-variant)',
                      margin: '0 0 0.2rem',
                    }}
                  >
                    Last activity
                  </p>
                  <p style={{ fontSize: '0.95rem', fontWeight: 600, margin: 0 }}>
                    {courseraLastActivity
                      ? courseraLastActivity.toLocaleDateString()
                      : '—'}
                  </p>
                </div>
              </div>

              {courseraCourseCount > 0 ? (
                <ul
                  style={{
                    margin: 0,
                    paddingLeft: 0,
                    listStyle: 'none',
                    display: 'grid',
                    gap: '0.4rem',
                  }}
                >
                  {courseraDetail.courses.map((c) => (
                    <li
                      key={c.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.65rem',
                        fontSize: '0.9rem',
                        padding: '0.5rem 0.65rem',
                        background: 'var(--surface-container-low)',
                        borderRadius: 'var(--radius-sm, 0.4rem)',
                        border: '1px solid var(--outline-variant)',
                      }}
                    >
                      {c.isCompleted ? (
                        <CheckCircle
                          size={16}
                          style={{ color: 'var(--wa-success-dark)', flexShrink: 0 }}
                        />
                      ) : (
                        <span
                          style={{
                            display: 'inline-block',
                            width: 16,
                            height: 16,
                            border: '2px solid var(--outline-variant)',
                            borderRadius: 4,
                            flexShrink: 0,
                          }}
                        />
                      )}
                      <span
                        style={{
                          flex: 1,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {c.courseName}
                      </span>
                      <span
                        style={{
                          fontSize: '0.8rem',
                          color: 'var(--color-on-surface-variant)',
                          flexShrink: 0,
                        }}
                      >
                        {Number(c.overallProgress).toFixed(0)}%
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          ) : (
            <p
              style={{
                fontSize: '0.9rem',
                color: 'var(--color-on-surface-variant)',
                margin: 0,
              }}
            >
              No Coursera activity recorded yet.
            </p>
          )}
        </section>

        {/* Program courses (catalog view) */}
        {program ? (
          <section className="content-card" style={sectionStyle}>
            <h2 style={sectionHeading}>Program curriculum</h2>
            <p
              style={{
                fontSize: '0.9rem',
                color: 'var(--color-on-surface-variant)',
                margin: '0 0 0.75rem',
              }}
            >
              {programReconciliation
                ? `${programReconciliation.programPercent}% overall · ${completedCount} of ${curriculumCourses.length} complete`
                : `${completedCount} of ${curriculumCourses.length} complete`}
            </p>
            <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none' }}>
              {curriculumCourses.map((c) => {
                const progress = liveProgressBySlug.get(c.slug);
                const completed = progress?.status === 'COMPLETED';
                return (
                  <li
                    key={c.slug}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.55rem',
                      marginBottom: '0.4rem',
                    }}
                  >
                    {completed ? (
                      <CheckCircle
                        size={18}
                        style={{ color: 'var(--wa-success-dark)', flexShrink: 0 }}
                      />
                    ) : (
                      <span
                        style={{
                          display: 'inline-block',
                          width: 18,
                          height: 18,
                          border: '2px solid var(--outline-variant)',
                          borderRadius: 4,
                          flexShrink: 0,
                        }}
                      />
                    )}
                    <span style={{ flex: 1 }}>
                      {c.name}
                      {progress ? (
                        <span
                          style={{
                            marginLeft: '0.5rem',
                            fontSize: '0.75rem',
                            color: 'var(--color-on-surface-variant)',
                          }}
                        >
                          {progress.percentComplete}% ·{' '}
                          {progress.status === 'COMPLETED'
                            ? 'completed'
                            : 'in progress'}
                        </span>
                      ) : null}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        {/* Resume */}
        <section className="content-card" style={sectionStyle}>
          <h2 style={sectionHeading}>Resume</h2>
          <AdminMemberResumeSection memberId={member.id} />
        </section>

        {/* Outcomes */}
        {placedOutcomeRow ? (
          <section className="content-card" style={sectionStyle}>
            <h2 style={sectionHeading}>Placement outcome</h2>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '0.85rem 1.25rem',
              }}
            >
              <div>
                <p
                  style={{
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: 'var(--color-on-surface-variant)',
                    margin: '0 0 0.2rem',
                  }}
                >
                  Employer
                </p>
                <p style={{ margin: 0, fontWeight: 600 }}>
                  {placedOutcomeRow.employerName}
                </p>
              </div>
              <div>
                <p
                  style={{
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: 'var(--color-on-surface-variant)',
                    margin: '0 0 0.2rem',
                  }}
                >
                  Job title
                </p>
                <p style={{ margin: 0, fontWeight: 600 }}>
                  {placedOutcomeRow.jobTitle}
                </p>
              </div>
              <div>
                <p
                  style={{
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: 'var(--color-on-surface-variant)',
                    margin: '0 0 0.2rem',
                  }}
                >
                  Start date
                </p>
                <p style={{ margin: 0, fontWeight: 600 }}>
                  {placedOutcomeRow.placedAt.toLocaleDateString('en-US', {
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </p>
              </div>
              <div>
                <p
                  style={{
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: 'var(--color-on-surface-variant)',
                    margin: '0 0 0.2rem',
                  }}
                >
                  Starting salary
                </p>
                <p style={{ margin: 0, fontWeight: 600 }}>
                  {formatSalary(placedOutcomeRow.startingSalary)}
                </p>
              </div>
            </div>
          </section>
        ) : null}

        {/* Certifications — clean stakeholder presentation. */}
        {member.userCertifications && member.userCertifications.length > 0 ? (
          <section className="content-card" style={sectionStyle}>
            <h2 style={sectionHeading}>Certifications</h2>
            <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none' }}>
              {member.userCertifications.map((cert) => (
                <li
                  key={cert.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '0.75rem',
                    padding: '0.55rem 0',
                    borderBottom: '1px solid var(--outline-variant)',
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <p style={{ margin: 0, fontWeight: 600 }}>{cert.certName}</p>
                    <p
                      style={{
                        margin: '0.15rem 0 0',
                        fontSize: '0.75rem',
                        color: 'var(--color-on-surface-variant)',
                      }}
                    >
                      Self-reported · Earned{' '}
                      {new Date(cert.earnedAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </div>
  );
}
