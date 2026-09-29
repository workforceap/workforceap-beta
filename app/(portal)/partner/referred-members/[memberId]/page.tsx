import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { CheckCircle } from 'lucide-react';
import PartnerMemberJourney, { type PartnerJourneyStep } from '@/components/partner/PartnerMemberJourney';
import PartnerPlacementCard, { type PartnerPlacementView } from '@/components/partner/PartnerPlacementCard';
import PartnerStageBadge from '@/components/partner/PartnerStageBadge';

import { buildPageMetadataAsync } from '@/app/seo';
import PageHeader from '@/components/portal/PageHeader';
import PortalPageFrame from '@/components/portal/PortalPageFrame';
import { getPartnerForUser } from '@/lib/auth/roles';
import { unlinkedPartnerHref } from '@/lib/auth/portalGuards';
import { getUser } from '@/lib/auth/server';
import { getProgramBySlug } from '@/lib/content/programs';
import { programSlugsEquivalent } from '@/lib/content/programSlug';
import { DISCOVERED_COURSERA_PROGRAMS } from '@/lib/content/courseraDiscoveredCatalog';
import { prisma } from '@/lib/db/prisma';
import { formatPortalDate, formatPortalDateTime } from '@/lib/formatDate';
import { fetchLearnerProgressFromB4B } from '@/lib/coursera/learnerProgress';
import { isReadOnlyPortalAuditHeader } from '@/lib/audit/readOnlyPortalAudit';
import { loadMemberProgramTrainingView } from '@/lib/member/memberProgramTrainingView';
import { memberProgramCompleted, memberProgramProgressPct } from '@/lib/partner/memberProgress';
import { loadMemberSkillsetProgress } from '@/lib/coursera/memberSkillsetProgress';
import SkillsetProgressList from '@/components/portal/SkillsetProgressList';
import { getProgramCoursesForCurriculumVersion } from '@/lib/member/curriculumAssignment';
import { resolveTrainingProgressAssignment } from '@/lib/member/trainingProgress';
import { MEMBER_ONLY_WHERE } from '@/lib/admin/memberOnlyWhere';
import { eventNameReadCandidates } from '@/lib/events/names';
import { PARTNER_PLACEMENT_LABELS, partnerEventLabel, partnerVisibleEventNames } from '@/lib/partner/partnerVisibleEvents';
import { partnerMemberStage } from '@/lib/partner/memberStage';
import {
  partnerDataAccess,
  partnerVisiblePlacement,
  withPartnerMemberVisibility,
} from '@/lib/partner/dataAccess';

type Props = {
  params: Promise<{ memberId: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { memberId } = await params;
  return buildPageMetadataAsync({
    title: 'Member overview',
    description: 'Referred member progress (read-only).',
    path: `/partner/referred-members/${memberId}`,
  });
}

// Pinned to PORTAL_TIMEZONE: the server renders in UTC, so an evening Central
// instant otherwise showed as the next morning (and the next calendar day).
function formatDate(value: Date | null | undefined) {
  return value ? formatPortalDate(value) || '—' : '—';
}

function formatDateTime(value: Date | null | undefined) {
  return value ? formatPortalDateTime(value) || '—' : '—';
}

function formatSalary(value: number | null | undefined) {
  return value != null
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)
    : '—';
}

function sectionHeading(title: string) {
  return <h2 style={{ fontSize: '0.8125rem', margin: 0, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{title}</h2>;
}

export default async function PartnerReferredMemberDetailPage({ params }: Props) {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/partner/referred-members');
  const readOnlyAudit = isReadOnlyPortalAuditHeader(await headers());

  const ctx = await getPartnerForUser(user.id);
  if (!ctx) redirect(await unlinkedPartnerHref(user.id));

  const { memberId } = await params;

  // Tier + minor rule (lib/partner/dataAccess.ts): a hidden minor is a 404,
  // and a restricted (referral-track) partner never loads job details. The
  // partner type comes from the stored partner row via getPartnerForUser.
  const access = partnerDataAccess(ctx.partner);

  const referral = await prisma.partnerReferral.findFirst({
    where: {
      partnerId: ctx.partnerId,
      memberId,
      partner: { organizationId: ctx.partner.organizationId, active: true },
      member: withPartnerMemberVisibility(
        { organizationId: ctx.partner.organizationId, deletedAt: null, ...MEMBER_ONLY_WHERE },
        access,
      ),
    },
    select: { id: true, referredAt: true },
  });
  if (!referral) notFound();

  const member = await prisma.user.findUnique({
    where: { id: memberId, organizationId: ctx.partner.organizationId, deletedAt: null, AND: MEMBER_ONLY_WHERE },
    select: {
      id: true,
      fullName: true,
      email: true,
      enrolledProgram: true,
      enrolledAt: true,
      courseEnrollments: {
        orderBy: [{ isPrimary: 'desc' }, { enrolledAt: 'desc' }],
        select: {
          programSlug: true,
          curriculumVersion: true,
          isPrimary: true,
          enrolledAt: true,
        },
      },
      courseProgress: {
        where: { status: 'COMPLETED' },
        select: { programSlug: true, courseSlug: true },
      },
      placementRecord: {
        select: access.canSeePlacementDetails
          ? {
              employerName: true,
              jobTitle: true,
              salaryOffered: true,
              placedAt: true,
              startDateVerified: true,
              retentionStatus: true,
              retentionDecision: true,
              onboardingWindowEnd: true,
            }
          : { placedAt: true, startDateVerified: true },
      },
      userCertifications: { select: { certName: true, earnedAt: true }, orderBy: { earnedAt: 'desc' } },
      memberProgramProgress: {
        select: { programSlug: true, averagePercent: true, coursesCompleted: true },
      },
    },
  });

  if (!member) notFound();

  const [recentEvents, outreachLogs, placementConfirmations] = await Promise.all([
    // Partner-visible milestone events only (Vision C3, privacy §3.3); the
    // metadata column is never read.
    prisma.memberEvent.findMany({
      where: { userId: memberId, eventName: { in: partnerVisibleEventNames() } },
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: { id: true, eventName: true, createdAt: true },
    }),
    prisma.partnerOutreachLog.findMany({
      where: { partnerId: ctx.partnerId, memberId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: {
        createdBy: { select: { fullName: true } },
      },
    }),
    prisma.memberEvent.findMany({
      where: { userId: memberId, eventName: { in: eventNameReadCandidates('placement_confirmation_submitted') } },
      orderBy: { createdAt: 'desc' },
      take: 1,
      select: { id: true, createdAt: true },
    }),
  ]);

  const trainingAssignment = resolveTrainingProgressAssignment(
    member.enrolledProgram,
    member.courseEnrollments,
  );
  const activeProgramSlug = trainingAssignment.programSlug;
  const activeEnrollment = activeProgramSlug
    ? member.courseEnrollments.find((row) =>
        programSlugsEquivalent(row.programSlug, activeProgramSlug),
      ) ?? null
    : null;
  const curriculumVersion = trainingAssignment.curriculumVersion;
  const program = activeProgramSlug ? getProgramBySlug(activeProgramSlug) : null;
  const curriculumCourses = program && curriculumVersion
    ? getProgramCoursesForCurriculumVersion(
        program,
        curriculumVersion,
      )
    : [];
  const courseraProgramId =
    program != null
      ? DISCOVERED_COURSERA_PROGRAMS[program.slug]?.courseraProgramId
      : undefined;
  const b4bProgress =
    member.email?.trim() && activeProgramSlug
      ? await fetchLearnerProgressFromB4B(member.email, {
          programId: courseraProgramId,
          readOnlyAudit,
        }).catch((err: unknown) => {
          console.warn('[partner/referred-members] B4B learner progress unavailable:', err);
          return new Map();
        })
      : new Map();

  const trainingView = activeProgramSlug
      ? await loadMemberProgramTrainingView({
        userId: member.id,
        programSlug: activeProgramSlug,
        b4bProgress,
        readOnlyAudit,
      })
    : null;

  const coursesDone = activeProgramSlug
    ? member.courseProgress
        .filter((row) => programSlugsEquivalent(row.programSlug, activeProgramSlug))
        .map((row) => row.courseSlug)
    : [];
  const progressPct =
    trainingView?.progressPercentDisplay ??
    memberProgramProgressPct({
      enrolledProgram: activeProgramSlug,
      curriculumVersion,
      coursesCompleted: null,
      liveProgress: member.memberProgramProgress,
    });
  const skillsetProgress = await loadMemberSkillsetProgress(memberId);
  const certificateCount = member.userCertifications.length;
  const outreachCount = outreachLogs.length;
  const placement = partnerVisiblePlacement(access, member.placementRecord);
  const showJobDetails = access.canSeePlacementDetails;
  const placed = placement?.startDateVerified === true;
  const reportedPlacement = !!placement;
  const pendingPlacement = placementConfirmations[0] ?? null;
  const recentActivity = recentEvents.flatMap((event) => {
    const label = partnerEventLabel(event.eventName);
    return label ? [{ id: event.id, label, createdAt: event.createdAt }] : [];
  });
  const recentEvent = recentActivity[0] ?? null;
  const stage = partnerMemberStage({
    placedVerified: placed,
    placementReported: reportedPlacement || !!pendingPlacement,
    enrolled: !!(activeEnrollment?.enrolledAt ?? member.enrolledAt),
    progressPct,
  });

  const lastCertAt = member.userCertifications[0]?.earnedAt ?? null;
  const allCoursesDone =
    trainingView?.allCoursesComplete ??
    memberProgramCompleted({
      enrolledProgram: activeProgramSlug,
      curriculumVersion,
      coursesCompleted: null,
      liveProgress: member.memberProgramProgress,
    });
  const certPhaseLabel = certificateCount > 0 || allCoursesDone ? 'In progress or complete' : 'Pending';

  const journeySteps = [
    { key: 'intake', label: 'Intake', detail: 'Referral on file', date: referral?.referredAt ?? null, done: !!referral },
    {
      key: 'training',
      label: 'Training',
      detail: program?.title ?? 'Program',
      date: activeEnrollment?.enrolledAt ?? member.enrolledAt,
      done: !!(activeEnrollment?.enrolledAt ?? member.enrolledAt),
    },
    {
      key: 'cert',
      label: 'Certification',
      detail: certPhaseLabel,
      date: lastCertAt,
      done: certificateCount > 0 || allCoursesDone,
    },
    {
      key: 'placement',
      label: 'Placement',
      detail: placed && placement
        ? placement.jobTitle && placement.employerName
          ? `${placement.jobTitle} @ ${placement.employerName}`
          : PARTNER_PLACEMENT_LABELS.verifiedWithoutDetails
        : reportedPlacement || pendingPlacement ? PARTNER_PLACEMENT_LABELS.pendingVerification : 'Not placed yet',
      date: placed ? placement?.placedAt ?? null : null,
      done: placed,
      pending: !placed && (reportedPlacement || !!pendingPlacement),
    },
    // Retention is job detail: restricted partners see placed yes/no + date only.
    ...(showJobDetails
      ? [{
          key: 'retention',
          label: 'Retention / follow-up',
          detail:
            (placed ? placement?.retentionDecision : null) ??
            (placed ? placement?.retentionStatus : null) ??
            (placed && placement?.onboardingWindowEnd
              ? `Onboarding window through ${formatDate(placement.onboardingWindowEnd)}`
              : 'Awaiting verified placement'),
          date: placed ? placement?.onboardingWindowEnd ?? null : null,
          done: placed && !!(placement?.retentionStatus || placement?.retentionDecision),
        }]
      : []),
  ];
  const journey: PartnerJourneyStep[] = journeySteps.map((step) => ({
    ...step,
    date: step.date ? formatDate(step.date) : null,
  }));

  const placementView: PartnerPlacementView = placed && placement
    ? {
        state: 'verified',
        placedOn: formatDate(placement.placedAt),
        details: showJobDetails
          ? {
              employerName: placement.employerName ?? null,
              jobTitle: placement.jobTitle ?? null,
              salary: formatSalary(placement.salaryOffered),
            }
          : null,
      }
    : reportedPlacement || pendingPlacement
      ? { state: 'pending', showJobDetails }
      : { state: 'none' };

  return (
    <PortalPageFrame>
      {readOnlyAudit ? <span hidden data-portal-audit-suppressed="partner-member-coursera-course-resolution" /> : null}
      <div style={{ paddingBottom: '6rem' }}>
        <Link href="/partner/referred-members" style={{ color: 'var(--wa-accent)', display: 'inline-block', marginBottom: '1rem' }}>
          ← Back to referred members
        </Link>
        <PageHeader
          title={member.fullName}
          subtitle={showJobDetails
            ? 'Read-only overview. Contact information, assessments, and benefit requests are not shown in the partner portal.'
            : 'Read-only status overview. Referral partners see application status, program, progress, certifications, and whether and when a member was placed.'}
          breadcrumbs={[
            { label: 'Referred members', href: '/partner/referred-members' },
            { label: 'Member details' },
          ]}
        />

        <p className="wa-mb-4" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.75rem' }}>
          <PartnerStageBadge stage={stage} />
          <Link href={`/partner/messages?memberId=${encodeURIComponent(member.id)}`} className="wa-kit-focus">
            Ask WorkforceAP about this member
          </Link>
        </p>

        <div className="wa-grid wa-grid-cols-1 md:wa-grid-cols-[minmax(0,2fr)_minmax(280px,1fr)] wa-gap-4 md:wa-gap-6">
          <div className="wa-grid wa-grid-cols-1 wa-gap-4">
            <section className="portal-card portal-card--flat" style={{ padding: '1rem' }}>
              {sectionHeading('Member journey')}
              <p style={{ margin: '0.5rem 0 0.75rem', fontSize: '0.85rem', color: 'var(--color-on-surface-variant)', lineHeight: 1.5 }}>
                Intake through training, certification, placement, and retention follow-up. Dates show the latest signal we have in each phase.
              </p>
              <PartnerMemberJourney steps={journey} />
            </section>

            <section className="portal-card portal-card--flat" style={{ padding: '1rem' }}>
              <p style={{ margin: 0, fontSize: '0.8125rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-on-surface-variant)' }}>
                Member snapshot
              </p>
              <p style={{ margin: '0.35rem 0 0.2rem', fontSize: '1.25rem', fontWeight: 800 }}>{member.fullName}</p>
              <p style={{ margin: 0, color: 'var(--color-on-surface-variant)' }}>{program?.title ?? 'No program selected'}</p>
              <div className="wa-grid wa-grid-cols-3 wa-gap-2" style={{ marginTop: '0.85rem' }}>
                {[
                  { label: 'Progress', value: `${progressPct}%` },
                  { label: 'Certificates', value: String(certificateCount) },
                  { label: 'Outreach', value: String(outreachCount) },
                ].map((item) => (
                  <div
                    key={item.label}
                    style={{ padding: '0.75rem', borderRadius: '0.75rem', background: 'var(--surface-container-low)' }}
                  >
                    <div className="wa-tabular-nums" style={{ fontSize: '1rem', fontWeight: 800 }}>{item.value}</div>
                    <div style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      {item.label}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="portal-card portal-card--flat" style={{ padding: '1rem' }}>
              {sectionHeading('Program')}
              <div style={{ display: 'grid', gap: '0.7rem', marginTop: '0.75rem' }}>
                <div>
                  <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>Enrolled</p>
                  <p style={{ margin: '0.2rem 0 0', fontWeight: 700 }}>{program?.title ?? '—'}</p>
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>Enrolled date</p>
                  <p style={{ margin: '0.2rem 0 0', fontWeight: 700 }}>{formatDate(member.enrolledAt)}</p>
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>Overall progress</p>
                  <p className="wa-tabular-nums" style={{ margin: '0.2rem 0 0', fontWeight: 700 }}>{progressPct}%</p>
                </div>
              </div>
            </section>

            {program ? (
              <section className="portal-card portal-card--flat" style={{ padding: '1rem' }}>
                {sectionHeading('Course completions')}
                <ul style={{ margin: '0.75rem 0 0', padding: 0, listStyle: 'none' }}>
                  {curriculumCourses.map((course) => {
                    const done = coursesDone.includes(course.slug);
                    return (
                      <li key={course.slug} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.45rem' }}>
                        {done ? (
                          <CheckCircle size={18} aria-hidden style={{ color: 'var(--color-green)', flexShrink: 0 }} />
                        ) : (
                          <span
                            aria-hidden
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
                        <span>
                          <span className="wa-sr-only">{done ? 'Completed: ' : 'Not yet completed: '}</span>
                          {course.name}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                <SkillsetProgressList rows={skillsetProgress} variant="compact" />
              </section>
            ) : null}

            <section className="portal-card portal-card--flat" style={{ padding: '1rem' }}>
              {sectionHeading('Placement')}
              <PartnerPlacementCard placement={placementView} />
            </section>

            <section className="portal-card portal-card--flat" style={{ padding: '1rem' }}>
              {sectionHeading('Recent activity')}
              {recentActivity.length === 0 ? (
                <p style={{ color: 'var(--color-on-surface-variant)', margin: '0.75rem 0 0' }}>No recent member activity recorded yet.</p>
              ) : (
                <div style={{ display: 'grid', gap: '0.75rem', marginTop: '0.75rem' }}>
                  {recentActivity.map((event) => (
                    <div key={event.id} style={{ padding: '0.8rem', borderRadius: '0.75rem', background: 'var(--surface-container-low)' }}>
                      <p style={{ margin: 0, fontWeight: 700 }}>{event.label}</p>
                      <p style={{ margin: '0.25rem 0 0', fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>{formatDateTime(event.createdAt)}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="portal-card portal-card--flat" style={{ padding: '1rem' }}>
              {sectionHeading('Partner outreach')}
              {outreachLogs.length === 0 ? (
                <p style={{ color: 'var(--color-on-surface-variant)', margin: '0.75rem 0 0' }}>No outreach logged yet for this member.</p>
              ) : (
                <div style={{ display: 'grid', gap: '0.75rem', marginTop: '0.75rem' }}>
                  {outreachLogs.map((log) => (
                    <div key={log.id} style={{ padding: '0.8rem', borderRadius: '0.75rem', background: 'var(--surface-container-low)' }}>
                      <p style={{ margin: 0, fontWeight: 700, textTransform: 'capitalize' }}>{log.channel}</p>
                      <p style={{ margin: '0.25rem 0 0', fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>
                        {log.createdBy?.fullName ?? 'User'} · {formatDateTime(log.createdAt)}
                      </p>
                      <p style={{ color: 'var(--color-on-surface-variant)', margin: '0.45rem 0 0', lineHeight: 1.5 }}>{log.note}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          <aside style={{ display: 'grid', gap: '1rem', alignContent: 'start' }}>
            <section className="portal-card portal-card--flat" style={{ padding: '1rem' }}>
              {sectionHeading('At a glance')}
              <div style={{ display: 'grid', gap: '0.85rem', marginTop: '0.9rem' }}>
                <div>
                  <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>Status</p>
                  <p style={{ margin: '0.3rem 0 0' }}>
                    <PartnerStageBadge stage={stage} />
                  </p>
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>Latest activity</p>
                  <p style={{ margin: '0.3rem 0 0', fontWeight: 700 }}>{recentEvent ? recentEvent.label : '—'}</p>
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>Latest outreach</p>
                  <p style={{ margin: '0.3rem 0 0', fontWeight: 700 }}>{outreachLogs[0] ? formatDateTime(outreachLogs[0].createdAt) : 'No outreach yet'}</p>
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>Certifications</p>
                  <p style={{ margin: '0.3rem 0 0', fontWeight: 700 }}>
                    {certificateCount === 0 ? 'None on file' : `${certificateCount} certificate${certificateCount === 1 ? '' : 's'} earned`}
                  </p>
                </div>
              </div>
            </section>
          </aside>
        </div>
      </div>
    </PortalPageFrame>
  );
}
