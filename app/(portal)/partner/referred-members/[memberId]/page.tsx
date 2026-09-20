import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { CheckCircle } from 'lucide-react';

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
  return <h2 style={{ fontSize: '0.75rem', margin: 0, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{title}</h2>;
}

export default async function PartnerReferredMemberDetailPage({ params }: Props) {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/partner/referred-members');
  const readOnlyAudit = isReadOnlyPortalAuditHeader(await headers());

  const ctx = await getPartnerForUser(user.id);
  if (!ctx) redirect(await unlinkedPartnerHref(user.id));

  const { memberId } = await params;

  const referral = await prisma.partnerReferral.findFirst({
    where: {
      partnerId: ctx.partnerId,
      memberId,
      partner: { organizationId: ctx.partner.organizationId, active: true },
      member: { organizationId: ctx.partner.organizationId, deletedAt: null, ...MEMBER_ONLY_WHERE },
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
        select: {
          employerName: true,
          jobTitle: true,
          startDate: true,
          salaryOffered: true,
          placedAt: true,
          retentionStatus: true,
          retentionDecision: true,
          onboardingWindowEnd: true,
        },
      },
      userCertifications: { select: { certName: true, earnedAt: true }, orderBy: { earnedAt: 'desc' } },
      memberProgramProgress: {
        select: { programSlug: true, averagePercent: true, coursesCompleted: true },
      },
    },
  });

  if (!member) notFound();

  const [recentEvents, outreachLogs, placementConfirmations] = await Promise.all([
    prisma.memberEvent.findMany({
      where: { userId: memberId },
      orderBy: { createdAt: 'desc' },
      take: 8,
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
      select: { metadata: true, createdAt: true },
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
  const placed = !!member.placementRecord;
  const pendingPlacement = placementConfirmations[0] ?? null;
  const recentEvent = recentEvents[0] ?? null;
  const memberStatus = placed ? 'Placed' : pendingPlacement ? 'Offer reported — review pending' : progressPct >= 80 ? 'Course-complete' : 'In training';

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

  const journey = [
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
      detail: member.placementRecord ? `${member.placementRecord.jobTitle} @ ${member.placementRecord.employerName}` : 'Not placed yet',
      date: member.placementRecord?.placedAt ?? null,
      done: placed,
    },
    {
      key: 'retention',
      label: 'Retention / follow-up',
      detail:
        member.placementRecord?.retentionDecision ??
        member.placementRecord?.retentionStatus ??
        (member.placementRecord?.onboardingWindowEnd
          ? `Onboarding window through ${formatDate(member.placementRecord.onboardingWindowEnd)}`
          : 'Recorded after placement'),
      date: member.placementRecord?.onboardingWindowEnd ?? null,
      done: !!(member.placementRecord?.retentionStatus || member.placementRecord?.retentionDecision),
    },
  ];

  function formatEventLabel(event: (typeof recentEvents)[number]) {
    if (event.metadata && typeof event.metadata === 'object' && event.metadata !== null && 'label' in event.metadata) {
      return `${event.eventName} — ${String((event.metadata as { label?: string }).label)}`;
    }
    return event.eventName;
  }

  return (
    <PortalPageFrame>
      {readOnlyAudit ? <span hidden data-portal-audit-suppressed="partner-member-coursera-course-resolution" /> : null}
      <div style={{ paddingBottom: '6rem' }}>
        <Link href="/partner/referred-members" style={{ color: 'var(--wa-accent)', display: 'inline-block', marginBottom: '1rem' }}>
          ← Back to referred members
        </Link>
        <PageHeader
          title={member.fullName}
          subtitle="Read-only overview. Contact information, assessments, and benefit requests are not shown in the partner portal."
          breadcrumbs={[
            { label: 'Referred members', href: '/partner/referred-members' },
            { label: 'Member details' },
          ]}
        />

        <p className="wa-mb-4">
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
              <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: '0.65rem' }}>
                {journey.map((step, idx) => (
                  <li
                    key={step.key}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'auto 1fr',
                      gap: '0.65rem',
                      alignItems: 'flex-start',
                      padding: '0.65rem 0.75rem',
                      borderRadius: '0.75rem',
                      background: step.done ? 'color-mix(in srgb, var(--color-green) 10%, var(--surface-container-low))' : 'var(--surface-container-low)',
                      border: `1px solid ${step.done ? 'color-mix(in srgb, var(--color-green) 35%, transparent)' : 'var(--outline-variant)'}`,
                    }}
                  >
                    <span
                      aria-hidden
                      style={{
                        width: '1.75rem',
                        height: '1.75rem',
                        borderRadius: '999px',
                        background: step.done ? 'var(--color-green)' : 'var(--surface-container-highest)',
                        color: step.done ? 'var(--color-on-accent)' : 'var(--color-on-surface-variant)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 800,
                        fontSize: '0.75rem',
                      }}
                    >
                      {step.done ? '✓' : idx + 1}
                    </span>
                    <div>
                      <p style={{ margin: 0, fontWeight: 800 }}>
                        <span className="wa-sr-only">{step.done ? 'Completed: ' : 'Not yet reached: '}</span>
                        {step.label}
                      </p>
                      <p style={{ margin: '0.2rem 0 0', fontSize: '0.82rem', color: 'var(--color-on-surface-variant)' }}>{step.detail}</p>
                      {step.date ? (
                        <p style={{ margin: '0.25rem 0 0', fontSize: '0.72rem', color: 'var(--color-on-surface-variant)' }}>{formatDate(step.date)}</p>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ol>
            </section>

            <section className="portal-card portal-card--flat" style={{ padding: '1rem' }}>
              <p style={{ margin: 0, fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-on-surface-variant)' }}>
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
                    <div style={{ fontSize: '0.65rem', color: 'var(--color-on-surface-variant)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
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
                  <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--color-on-surface-variant)' }}>Enrolled</p>
                  <p style={{ margin: '0.2rem 0 0', fontWeight: 700 }}>{program?.title ?? '—'}</p>
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--color-on-surface-variant)' }}>Enrolled date</p>
                  <p style={{ margin: '0.2rem 0 0', fontWeight: 700 }}>{formatDate(member.enrolledAt)}</p>
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--color-on-surface-variant)' }}>Overall progress</p>
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
              {member.placementRecord ? (
                <div style={{ display: 'grid', gap: '0.7rem', marginTop: '0.75rem' }}>
                  <div>
                    <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--color-on-surface-variant)' }}>Employer</p>
                    <p style={{ margin: '0.2rem 0 0', fontWeight: 700 }}>{member.placementRecord.employerName}</p>
                  </div>
                  <div>
                    <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--color-on-surface-variant)' }}>Role</p>
                    <p style={{ margin: '0.2rem 0 0', fontWeight: 700 }}>{member.placementRecord.jobTitle}</p>
                  </div>
                  <div>
                    <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--color-on-surface-variant)' }}>Placed</p>
                    <p style={{ margin: '0.2rem 0 0', fontWeight: 700 }}>{formatDate(member.placementRecord.placedAt)}</p>
                  </div>
                  <div>
                    <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--color-on-surface-variant)' }}>Salary</p>
                    <p className="wa-tabular-nums" style={{ margin: '0.2rem 0 0', fontWeight: 700 }}>
                      {formatSalary(member.placementRecord.salaryOffered)}
                    </p>
                  </div>
                </div>
              ) : pendingPlacement ? (
                <div style={{ marginTop: '0.75rem' }}>
                  <div
                    style={{
                      background: 'color-mix(in srgb, var(--color-gold) 18%, transparent)',
                      border: '1px solid color-mix(in srgb, var(--color-gold) 40%, transparent)',
                      borderRadius: '0.75rem',
                      padding: '0.875rem 1rem',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '0.625rem',
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ color: 'var(--color-gold)', flexShrink: 0 }} aria-hidden="true">pending</span>
                    <div>
                      <p style={{ margin: '0 0 0.25rem', fontWeight: 700, fontSize: '0.9375rem', color: 'var(--color-on-surface)' }}>Offer reported — under review</p>
                      <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', lineHeight: 1.55 }}>
                        This member self-reported accepting a job offer. WorkforceAP staff are reviewing the report before finalizing the placement.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <p style={{ color: 'var(--color-on-surface-variant)', margin: '0.75rem 0 0' }}>Not placed yet.</p>
              )}
            </section>

            <section className="portal-card portal-card--flat" style={{ padding: '1rem' }}>
              {sectionHeading('Recent activity')}
              {recentEvents.length === 0 ? (
                <p style={{ color: 'var(--color-on-surface-variant)', margin: '0.75rem 0 0' }}>No recent member activity recorded yet.</p>
              ) : (
                <div style={{ display: 'grid', gap: '0.75rem', marginTop: '0.75rem' }}>
                  {recentEvents.map((event) => (
                    <div key={event.id} style={{ padding: '0.8rem', borderRadius: '0.75rem', background: 'var(--surface-container-low)' }}>
                      <p style={{ margin: 0, fontWeight: 700 }}>{formatEventLabel(event)}</p>
                      <p style={{ margin: '0.25rem 0 0', fontSize: '0.78rem', color: 'var(--color-on-surface-variant)' }}>{formatDateTime(event.createdAt)}</p>
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
                      <p style={{ margin: '0.25rem 0 0', fontSize: '0.78rem', color: 'var(--color-on-surface-variant)' }}>
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
                  <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--color-on-surface-variant)' }}>Status</p>
                  <p style={{ margin: '0.3rem 0 0', fontWeight: 700 }}>{memberStatus}</p>
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--color-on-surface-variant)' }}>Latest activity</p>
                  <p style={{ margin: '0.3rem 0 0', fontWeight: 700 }}>{recentEvent ? formatEventLabel(recentEvent) : '—'}</p>
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--color-on-surface-variant)' }}>Latest outreach</p>
                  <p style={{ margin: '0.3rem 0 0', fontWeight: 700 }}>{outreachLogs[0] ? formatDateTime(outreachLogs[0].createdAt) : 'No outreach yet'}</p>
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--color-on-surface-variant)' }}>Certifications</p>
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
