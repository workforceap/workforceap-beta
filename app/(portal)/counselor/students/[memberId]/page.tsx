import { getTranslations } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getUser } from '@/lib/auth/server';
import { isAdmin, isCounselor } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';
import { formatPortalDate } from '@/lib/formatDate';
import { MEMBER_HISTORY_CAP, isListTruncated, showingFirstLabel } from '@/lib/db/queryCaps';
import PageHeader from '@/components/portal/PageHeader';
import PortalPageFrame from '@/components/portal/PortalPageFrame';
import AdminMemberCounselorChatClient from '@/components/admin/AdminMemberCounselorChatClient';
import Link from 'next/link';
import { compactStringIds, getMessageAuthorName, getOrCreateMemberCounselorThread, serializeMessage } from '@/lib/messages/counselorThread';
import { counselorStudentStatusBadge, counselorStudentStatusBadgeVariant } from '@/lib/counselor/memberStatus';
import StatusBadge from '@/components/portal/StatusBadge';
import { getProgramBySlug } from '@/lib/content/programs';
import { programDisplayTitle } from '@/lib/content/programTitle';
import { programSlugsEquivalent } from '@/lib/content/programSlug';
import { getProgramCoursesForCurriculumVersion } from '@/lib/member/curriculumAssignment';
import { resolveTrainingProgressAssignment } from '@/lib/member/trainingProgress';
import { DISCOVERED_COURSERA_PROGRAMS } from '@/lib/content/courseraDiscoveredCatalog';
import { fetchLearnerProgressFromB4B } from '@/lib/coursera/learnerProgress';
import { isReadOnlyPortalAuditHeader } from '@/lib/audit/readOnlyPortalAudit';
import { loadMemberProgramTrainingView } from '@/lib/member/memberProgramTrainingView';
import CounselorNotesPanel from './CounselorNotesPanel';
import CounselorTrainingHandoff from '@/components/portal/counselor/CounselorTrainingHandoff';
import { assertStaffCanAccessMemberRecord } from '@/lib/counselor/staffMemberAccess';
import AdvisorSessionNotesPanel from './AdvisorSessionNotesPanel';
import StaffMemberResumePanel from '@/components/counselor/StaffMemberResumePanel';
import CounselorIntakeReviewPanel from '@/components/counselor/CounselorIntakeReviewPanel';
import BillingPacketList from '@/components/billing/BillingPacketList';
import { listPacketsForMember } from '@/lib/billing/packetAccess';
import WioaScreeningReadonly from '@/components/admin/WioaScreeningReadonly';
import AssessmentAnswersReadonly from '@/components/admin/AssessmentAnswersReadonly';
import { buildAssessmentReviewRows } from '@/lib/assessment/reviewRows';
import { parseWioaQualificationSnapshot } from '@/lib/wioa/wioaQualification';
import {
  employerJobPostingApplicationStatusBadgeVariant,
  employerJobPostingApplicationStatusLabel,
} from '@/lib/employer/jobPostingApplicationStatus';
import {
  employerAiMatchStatusBadgeVariant,
  employerMatchPipelineLabel,
} from '@/lib/employer/aiMatchPipelineLabels';
import { matchScoreAsPercent } from '@/lib/employer/matchScoreDisplay';
import PointsWidget from '@/components/portal/PointsWidget';
import AwardPointsButton from '@/components/portal/AwardPointsButton';
import { getMemberPoints } from '@/lib/member/points';
import SkillsetProgressList from '@/components/portal/SkillsetProgressList';
import { loadMemberSkillsetProgress } from '@/lib/coursera/memberSkillsetProgress';
import MemberProgressTimeline from '@/components/portal/counselor/MemberProgressTimeline';
import type { TimelineEvent } from '@/components/portal/counselor/MemberProgressTimeline';
import { getRiskLevel } from '@/lib/member/atRiskScoring';
import type { CareerMatchResult } from '@/lib/onet/types';

type Props = { params: Promise<{ memberId: string }> };

function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export default async function CounselorStudentDetailPage({ params }: Props) {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/counselor/students');

  if (!(await isCounselor(user.id)) && !(await isAdmin(user.id))) redirect('/dashboard');
  const readOnlyAudit = isReadOnlyPortalAuditHeader(await headers());

  const { memberId } = await params;

  const [counselor, adminUser] = await Promise.all([
    prisma.counselor.findFirst({
      where: { userId: user.id, active: true },
    }),
    isAdmin(user.id),
  ]);
  if (!counselor && !adminUser) redirect('/dashboard');

  const t = await getTranslations('counselor');
  if (!(await assertStaffCanAccessMemberRecord(user.id, memberId))) notFound();

  const member = await prisma.user.findFirst({
    where: { id: memberId, deletedAt: null },
    select: {
      id: true,
      fullName: true,
      email: true,
      enrolledProgram: true,
      courseraEnrollmentApproved: true,
      programInterest: true,
      assessmentScorePct: true,
      assessmentScore: true,
      assessmentCompleted: true,
      assessmentCompletedAt: true,
      assessmentAnswers: true,
      wioaQualificationJson: true,
      wioaReviewStatus: true,
      wioaReviewedAt: true,
      wioaReviewedByUserId: true,
      wioaReviewNotes: true,
      careerRecommendationJson: true,
      createdAt: true,
      // Multi-program-aware: load ALL course enrollments so we can render
      // secondary programs below the primary block (instead of hiding them
      // when `User.enrolledProgram` is set to just the primary slug).
      courseEnrollments: {
        select: {
          programSlug: true,
          curriculumVersion: true,
          isPrimary: true,
          enrolledAt: true,
          fundingSource: true,
        },
        orderBy: [{ isPrimary: 'desc' }, { enrolledAt: 'asc' }],
      },
      profile: {
        select: {
          resumeOriginalPath: true,
          resumeEnhancedPath: true,
          hasEmploymentBarrier: true,
          barrierTypes: true,
        },
      },
    },
  });
  if (!member) notFound();

  if (counselor) {
    const assign = await prisma.counselorAssignment.findFirst({
      where: { counselorId: counselor.id, memberId, active: true },
    });
    if (!assign) notFound();
  } else if (!adminUser) {
    notFound();
  }

  // ── Timeline data fetch ───────────────────────────────────────────
  // applicationCount is queried up-front (rather than reading
  // applications.length later) because the placement-stage status row
  // below references it. The full `applications` array is still fetched
  // below for the actual UI display — this is just the 1-bit
  // "has the member applied yet?" signal that the timeline needs early.
  const [memberEvents, programAvg, applicationCount] = await Promise.all([
    prisma.memberEvent.findMany({
      // Only the 5 milestone events below are ever read from this array, and
      // `metadata` is never inspected — narrowing both keeps this to a few
      // dozen rows off the existing @@index([userId, eventName, createdAt])
      // instead of the member's entire event history with JSON payloads.
      where: {
        userId: memberId,
        eventName: {
          in: [
            'program_enrolled',
            'assessment_completed',
            'course_completed',
            'certification_earned',
            'placement_recorded',
          ],
        },
      },
      orderBy: { createdAt: 'asc' },
      select: { eventName: true, createdAt: true },
    }),
    member.enrolledProgram
      ? prisma.memberProgramProgress.groupBy({
          by: ['programSlug'],
          where: { programSlug: member.enrolledProgram },
          _avg: { averagePercent: true },
        })
      : Promise.resolve([]),
    prisma.jobPostingApplication.count({ where: { studentId: memberId } }),
  ]);

  const enrollmentEvent = memberEvents.find((e) => e.eventName === 'program_enrolled');
  const assessmentEvent = memberEvents.find((e) => e.eventName === 'assessment_completed');
  const firstCourseEvent = memberEvents.find((e) => e.eventName === 'course_completed');
  const certEvent = memberEvents.find((e) => e.eventName === 'certification_earned');
  const placementEvent = memberEvents.find((e) => e.eventName === 'placement_recorded');

  function daysBetween(a: Date | null, b: Date | null): number | null {
    if (!a || !b) return null;
    return Math.max(0, Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24)));
  }

  const timelineEvents: TimelineEvent[] = [
    {
      stage: 'enrollment',
      label: 'Enrollment',
      date: member.courseEnrollments[0]?.enrolledAt?.toISOString() ?? member.createdAt.toISOString(),
      durationDays: daysBetween(
        member.createdAt,
        member.courseEnrollments[0]?.enrolledAt ?? member.createdAt,
      ),
      status: member.courseEnrollments.length > 0 ? 'completed' : 'pending',
    },
    {
      stage: 'assessment',
      label: 'Assessment',
      date: assessmentEvent?.createdAt.toISOString() ?? null,
      durationDays: daysBetween(
        member.courseEnrollments[0]?.enrolledAt ?? member.createdAt,
        assessmentEvent?.createdAt ?? null,
      ),
      status: assessmentEvent ? 'completed' : member.assessmentScorePct != null ? 'in_progress' : 'pending',
    },
    {
      stage: 'training',
      label: 'Training',
      date: firstCourseEvent?.createdAt.toISOString() ?? null,
      durationDays: daysBetween(
        assessmentEvent?.createdAt ?? member.courseEnrollments[0]?.enrolledAt ?? member.createdAt,
        firstCourseEvent?.createdAt ?? null,
      ),
      status: firstCourseEvent ? 'completed' : member.enrolledProgram ? 'in_progress' : 'pending',
    },
    {
      stage: 'certification',
      label: 'Certification',
      date: certEvent?.createdAt.toISOString() ?? null,
      durationDays: daysBetween(
        firstCourseEvent?.createdAt ?? assessmentEvent?.createdAt ?? member.courseEnrollments[0]?.enrolledAt ?? member.createdAt,
        certEvent?.createdAt ?? null,
      ),
      status: certEvent ? 'completed' : member.enrolledProgram ? 'in_progress' : 'pending',
    },
    {
      stage: 'placement',
      label: 'Placement',
      date: placementEvent?.createdAt.toISOString() ?? null,
      durationDays: daysBetween(
        certEvent?.createdAt ?? firstCourseEvent?.createdAt ?? assessmentEvent?.createdAt ?? member.courseEnrollments[0]?.enrolledAt ?? member.createdAt,
        placementEvent?.createdAt ?? null,
      ),
      status: placementEvent ? 'completed' : applicationCount > 0 ? 'in_progress' : 'pending',
    },
  ];

  const programAvgDays = programAvg[0]?._avg.averagePercent
    ? Math.round(100 / (programAvg[0]._avg.averagePercent || 1) * 30)
    : null;

  let counselor360LoadFailed = false;
  const markCounselor360LoadFailure = <T,>(fallback: T) => (error: unknown): T => {
    counselor360LoadFailed = true;
    console.error('[counselor/students] 360 panel load failed', error);
    return fallback;
  };
  const [applications, aiMatches, memberPts, recentTx, pitchDeployments, latestAtRiskAlert, pendingNextBestActions] = await Promise.all([
    prisma.jobPostingApplication.findMany({
      take: MEMBER_HISTORY_CAP,
      where: { studentId: memberId },
      orderBy: { appliedAt: 'desc' },
      include: {
        job: { select: { id: true, title: true, employer: { select: { companyName: true } } } },
      },
    }),
    prisma.aIJobMatch.findMany({
      take: MEMBER_HISTORY_CAP,
      where: { studentId: memberId },
      orderBy: { matchScore: 'desc' },
      include: {
        job: { select: { id: true, title: true, employer: { select: { companyName: true } } } },
      },
    }),
    getMemberPoints(memberId).catch(markCounselor360LoadFailure(null)),
    prisma.pointsTransaction.findMany({
      where: { userId: memberId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, event: true, points: true, note: true, createdAt: true },
    }).catch(markCounselor360LoadFailure([])),
    prisma.memberEvent.findMany({
      where: { userId: memberId, eventName: 'pitch_deployed' },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, metadata: true, createdAt: true },
    }).catch(markCounselor360LoadFailure([])),
    // Counselor 360: latest persisted at-risk classification (nightly scan —
    // see lib/member/atRiskScoring.ts). Composition only, no rescoring here.
    prisma.atRiskAlert.findFirst({
      where: { userId: memberId },
      orderBy: { createdAt: 'desc' },
      select: { score: true, status: true, factors: true, createdAt: true },
    }).catch(markCounselor360LoadFailure(null)),
    // Counselor 360: member's current persisted next-best-action queue
    // (same model + shape as the member dashboard's career-brief widget).
    prisma.memberNextBestAction.findMany({
      where: { memberId, status: 'PENDING' },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      take: 5,
      select: { id: true, title: true, description: true, ctaLabel: true, ctaHref: true, icon: true, priority: true },
    }).catch(markCounselor360LoadFailure([])),
  ]);

  // Counselor 360: at-risk tier + factors (composition of the persisted alert row).
  type AtRiskFactorDisplay = { name: string; weight: number; description: string };
  function asAtRiskFactors(value: unknown): AtRiskFactorDisplay[] {
    if (!Array.isArray(value)) return [];
    return value.filter(
      (f): f is AtRiskFactorDisplay =>
        typeof f === 'object' && f !== null && typeof (f as { description?: unknown }).description === 'string',
    );
  }
  const atRiskAlertDisplay = latestAtRiskAlert
    ? {
        score: latestAtRiskAlert.score,
        status: latestAtRiskAlert.status,
        createdAt: latestAtRiskAlert.createdAt,
        factors: asAtRiskFactors(latestAtRiskAlert.factors),
      }
    : null;

  // Counselor 360: career-quiz top occupations (same JSON column + shape the
  // member dashboard and AI coach context already read — see
  // lib/ai/aiCoachContext.ts and lib/member/getMemberState.ts).
  const careerRecommendation = member.careerRecommendationJson as CareerMatchResult | null;
  const topOccupations = Array.isArray(careerRecommendation?.topOccupations)
    ? careerRecommendation.topOccupations.slice(0, 3)
    : [];

  const thread = readOnlyAudit
    ? await prisma.messageThread.findUnique({ where: { memberId } })
    : await getOrCreateMemberCounselorThread(memberId);
  const [messagesNewestFirst, messageTotal] = thread
    ? await Promise.all([
        prisma.message.findMany({
          take: MEMBER_HISTORY_CAP,
          where: { threadId: thread.id },
          orderBy: { createdAt: 'desc' },
        }),
        prisma.message.count({ where: { threadId: thread.id } }),
      ])
    : [[], 0];
  const messages = messagesNewestFirst.slice().reverse();
  const authorIds = compactStringIds(messages.map((m) => m.authorId));
  const authors =
    authorIds.length > 0
      ? await prisma.user.findMany({ take: MEMBER_HISTORY_CAP, where: { id: { in: authorIds } }, select: { id: true, fullName: true } })
      : [];
  const messagesTruncated = isListTruncated(messages.length, MEMBER_HISTORY_CAP, messageTotal);
  const messagesLabel = showingFirstLabel(messages.length, messageTotal, 'messages');
  const nameById = new Map(authors.map((a) => [a.id, a.fullName]));

  const trainingHandoff = (
    <CounselorTrainingHandoff
      memberId={member.id}
      courseraEnrollmentApproved={member.courseraEnrollmentApproved}
      enrollments={member.courseEnrollments.map((enrollment) => ({
        programSlug: enrollment.programSlug,
        programTitle: programDisplayTitle(enrollment.programSlug),
        isPrimary: enrollment.isPrimary,
        fundingSource: enrollment.fundingSource,
      }))}
    />
  );

  const initials = getInitials(member.fullName ?? 'U');
  const storedProgram = member.enrolledProgram ?? member.programInterest;
  // Header/subtitle print a title (alias-resolved, or humanised when the
  // catalog has no entry), never the raw stored slug.
  const program = storedProgram ? programDisplayTitle(storedProgram) : '—';
  const enrollmentBadge = counselorStudentStatusBadge({
    enrolledProgram: member.enrolledProgram,
    assessmentScorePct: member.assessmentScorePct,
  });
  const enrollmentBadgeVariant = counselorStudentStatusBadgeVariant({
    enrolledProgram: member.enrolledProgram,
    assessmentScorePct: member.assessmentScorePct,
  });

  // Program progress — real data from enrolled program courses
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
  const programMeta = activeProgramSlug ? getProgramBySlug(activeProgramSlug) : null;
  const programCourses = programMeta && curriculumVersion
    ? getProgramCoursesForCurriculumVersion(programMeta, curriculumVersion)
    : [];
  const courseraProgramId =
    activeProgramSlug != null
      ? DISCOVERED_COURSERA_PROGRAMS[activeProgramSlug]?.courseraProgramId
      : undefined;
  const b4bProgress =
    member.email?.trim() && activeProgramSlug
      ? await fetchLearnerProgressFromB4B(member.email, {
          programId: courseraProgramId,
          readOnlyAudit,
        }).catch((err: unknown) => {
          console.warn('[counselor/students] B4B learner progress unavailable:', err);
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
  const completedSlugs = new Set(trainingView?.completedSlugsAuthoritative ?? []);
  const progressPct = trainingView?.progressPercentDisplay ?? 0;
  const skillsetProgress = await loadMemberSkillsetProgress(member.id);

  // Multi-program-aware: any course_enrollments rows whose programSlug isn't
  // the primary one we already render above. Single-program members produce
  // an empty list and the section is skipped, preserving today's UX.
  const otherProgramEnrollments = member.courseEnrollments
    .filter((row) =>
      activeProgramSlug ? !programSlugsEquivalent(row.programSlug, activeProgramSlug) : true,
    )
    .map((row) => ({
      programSlug: row.programSlug,
      programTitle: programDisplayTitle(row.programSlug),
      enrolledAt: row.enrolledAt,
    }));

  type PitchOutcome = 'interview' | 'no_response' | 'pending' | 'other';
  type PitchMeta = { employer: string; usedAt: string; outcome: PitchOutcome };
  const typedPitchDeployments = pitchDeployments.map((ev) => ({
    id: ev.id,
    createdAt: ev.createdAt,
    meta: (ev.metadata ?? {}) as Partial<PitchMeta>,
  }));

  function pitchOutcomeLabel(outcome: PitchOutcome | undefined): string {
    switch (outcome) {
      case 'interview': return 'Got interview';
      case 'no_response': return 'No response';
      case 'pending': return 'Pending';
      default: return 'Other';
    }
  }
  function pitchOutcomeColor(outcome: PitchOutcome | undefined): string {
    switch (outcome) {
      case 'interview': return 'var(--color-green, #16a34a)';
      case 'pending': return 'var(--color-warning-on-surface, #d97706)';
      default: return 'var(--color-on-surface-variant)';
    }
  }

  const wioaSnap = parseWioaQualificationSnapshot(member.wioaQualificationJson);
  // Ops (9/2/26): the preassessment answer sheet sits with the WIOA screening so
  // counselors review both in one place.
  const assessmentRows =
    member.assessmentCompleted && member.assessmentAnswers
      ? buildAssessmentReviewRows(member.assessmentAnswers)
      : null;
  let wioaReviewerName: string | null = null;
  if (member.wioaReviewedByUserId) {
    const rev = await prisma.user.findUnique({
      where: { id: member.wioaReviewedByUserId },
      select: { fullName: true },
    });
    wioaReviewerName = rev?.fullName ?? null;
  }

  const billingPackets = await listPacketsForMember(member.id);

  // Counselor approvals (Mike, 2026-09-19): counselors approve/deny the
  // member's program application(s) and record WIOA intake verification
  // from this page. The routes behind the panel scope counselors to their
  // assigned members (lib/counselor/applicationReviewAccess.ts).
  const programApplications = await prisma.application.findMany({
    where: { userId: member.id },
    orderBy: { createdAt: 'desc' },
    select: { id: true, status: true, programInterest: true, submittedAt: true },
  });
  const intakeReviewPanel = (
    <CounselorIntakeReviewPanel
      key={member.id}
      memberId={member.id}
      applications={programApplications.map((row) => ({
        id: row.id,
        status: row.status,
        programTitle: programDisplayTitle(row.programInterest) || row.programInterest,
        submittedAt: row.submittedAt?.toISOString() ?? null,
      }))}
      wioa={{
        hasScreening: wioaSnap != null,
        submittedAt: wioaSnap?.submittedAt ?? null,
        reviewStatus: member.wioaReviewStatus,
        reviewedAt: member.wioaReviewedAt?.toISOString() ?? null,
        reviewNotes: member.wioaReviewNotes,
      }}
    />
  );

  const memberTitle = member.fullName ?? t('member');
  const messageHref = `/counselor/messages?memberId=${encodeURIComponent(member.id)}`;
  const sessionHref = `/counselor/sessions/${memberId}/run`;

  return (
    <PortalPageFrame>
      {counselor360LoadFailed ? <span hidden data-portal-error-state="counselor-member-360-load" /> : null}
      {readOnlyAudit ? <span hidden data-portal-audit-suppressed="counselor-member-coursera-course-resolution" /> : null}

      <PageHeader
        title={memberTitle}
        subtitle={
          <>
            <span className="wa-block md:wa-hidden">{program}</span>
            <span className="wa-hidden md:wa-block">{member.email}</span>
          </>
        }
        breadcrumbs={[
          { label: t('members'), href: '/counselor/students' },
          { label: t('memberDetails') },
        ]}
        action={
          <>
            <div className="md:wa-hidden" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <Link href={messageHref} className="btn btn-outline btn-sm">
                <span className="material-symbols-outlined" style={{ fontSize: '1rem' }} aria-hidden="true">
                  chat
                </span>
                {t('priorityQueueActionMessage')}
              </Link>
              <Link href={sessionHref} className="btn btn-primary btn-sm">
                <span className="material-symbols-outlined" style={{ fontSize: '1rem' }} aria-hidden="true">
                  event
                </span>
                {t('startSession')}
              </Link>
            </div>
            <div className="wa-hidden md:wa-block">
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <Link href={messageHref} className="btn btn-outline">
                  {t('priorityQueueActionMessage')}
                </Link>
                <Link
                  href={sessionHref}
                  className="btn btn-primary"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                >
                  {t('startInOfficeSession')}
                </Link>
              </div>
            </div>
          </>
        }
      />

      {/* ── Mobile ─────────────────────────────────────────── */}
      <div className="wa-block md:wa-hidden" style={{ paddingBottom: '6rem' }}>
        {/* Member identity card */}
        <div style={{ padding: '0 1rem 1rem' }}>
          <div
            style={{
              background: 'var(--wa-surface)',
              borderRadius: 'var(--wa-radius)',
              padding: '1.25rem',
              border: '1px solid var(--wa-border)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 'var(--wa-radius-sm)',
                  background: 'var(--wa-accent)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <span style={{ color: 'var(--wa-on-accent)', fontWeight: 900, fontSize: '1.25rem' }}>{initials}</span>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p
                  title={member.fullName ?? undefined}
                  className="wa-truncate"
                  style={{ fontSize: '1.125rem', fontWeight: 800, color: 'var(--wa-text)', margin: '0 0 0.125rem' }}
                >
                  {memberTitle}
                </p>
                <p
                  className="wa-truncate"
                  style={{ fontSize: '0.8rem', color: 'var(--wa-muted)', margin: '0 0 0.5rem' }}
                >
                  {program}
                </p>
                <StatusBadge label={enrollmentBadge.label} variant={enrollmentBadgeVariant} />
              </div>
            </div>

            {member.profile?.hasEmploymentBarrier && member.profile.barrierTypes.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
                {member.profile.barrierTypes.map((bt) => (
                  <span
                    key={bt}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      padding: '0.15rem 0.5rem',
                      borderRadius: '9999px',
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      background: 'var(--wa-gold-soft)',
                      color: 'var(--wa-gold-dark)',
                      border: '1px solid color-mix(in srgb, var(--wa-gold) 32%, transparent)',
                    }}
                  >
                    {bt.replace(/_/g, ' ')}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div style={{ padding: '0 1rem 1rem' }}>{trainingHandoff}</div>

        {/* Program Progress */}
        <div style={{ padding: '0 1rem 1rem' }}>
          <div
            style={{
              background: 'var(--surface-container-lowest)',
              borderRadius: '0.75rem',
              padding: '1.25rem',
              border: '1px solid var(--outline-variant)',
            }}
          >
            <h2 style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--color-on-surface)', margin: '0 0 1rem' }}>
              Program Progress
            </h2>
            {programCourses.length === 0 ? (
              <p style={{ fontSize: '0.8rem', color: 'var(--color-on-surface-variant)' }}>
                {activeProgramSlug ? 'No course data available for this program.' : 'Not enrolled in a program yet.'}
              </p>
            ) : (
              <>
                {/* Overall progress bar */}
                <div style={{ marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.375rem' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-on-surface-variant)' }}>
                      Overall Completion
                    </span>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-accent)' }}>{progressPct}%</span>
                  </div>
                  <div style={{ height: 6, background: 'var(--surface-container)', borderRadius: '9999px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${progressPct}%`, background: 'var(--color-accent)', borderRadius: '9999px' }} />
                  </div>
                  {trainingView?.averageGradePercentDisplay != null ? (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem' }}>
                      <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--color-on-surface-variant)' }}>
                        Grade (avg, scored courses)
                      </span>
                      <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-info-on-surface)' }}>
                        {trainingView.averageGradePercentDisplay}%
                      </span>
                    </div>
                  ) : null}
                </div>
                {/* Course list */}
                {programCourses.map((course) => {
                  const done = completedSlugs.has(course.slug);
                  return (
                    <div
                      key={course.slug}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: '0.8rem',
                        padding: '0.375rem 0',
                        borderTop: '1px solid var(--outline-variant)',
                        opacity: done ? 1 : 0.6,
                      }}
                    >
                      <span style={{ color: 'var(--color-on-surface-variant)' }}>{course.name}</span>
                      {done ? (
                        <span className="material-symbols-outlined" style={{ fontSize: '1rem', color: 'var(--color-green)' }} aria-hidden="true">check_circle</span>
                      ) : (
                        <span style={{ fontSize: '0.7rem', color: 'var(--color-on-surface-variant)' }}>Not started</span>
                      )}
                    </div>
                  );
                })}
                <SkillsetProgressList rows={skillsetProgress} variant="compact" />
              </>
            )}
          </div>
        </div>

        {/* Other programs this student is in — multi-program-aware. Hidden
            when the learner only has the primary enrollment, so the
            single-program experience is unchanged. */}
        {otherProgramEnrollments.length > 0 ? (
          <div style={{ padding: '0 1rem 1rem' }}>
            <div
              style={{
                background: 'var(--surface-container-lowest)',
                borderRadius: '0.75rem',
                padding: '1.25rem',
                border: '1px solid var(--outline-variant)',
              }}
            >
              <h2 style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--color-on-surface)', margin: '0 0 0.5rem' }}>
                Other programs this student is in
              </h2>
              <p style={{ fontSize: '0.75rem', color: 'var(--color-on-surface-variant)', margin: '0 0 0.75rem' }}>
                Secondary enrollments outside the primary program shown above.
              </p>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {otherProgramEnrollments.map((row) => (
                  <li key={row.programSlug} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.625rem', borderRadius: '0.5rem', background: 'var(--surface-container-low)' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                      {row.programTitle}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}

        {/* Points */}
        {memberPts && (
          <div style={{ padding: '0 1rem 1rem' }}>
            <PointsWidget total={memberPts.total} level={memberPts.level} recent={recentTx} />
            <div style={{ marginTop: '0.75rem' }}>
              <AwardPointsButton
                memberId={member.id}
                memberName={member.fullName ?? 'this member'}
                apiHref={`/api/counselor/members/${member.id}/award-points`}
              />
            </div>
          </div>
        )}

        {/* Counselor 360 signals — at-risk, career quiz, next-best-actions */}
        <div style={{ padding: '0 1rem 1rem' }}>
          <h2 style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--color-on-surface)', margin: '0 0 0.75rem' }}>
            Counselor 360 Signals
          </h2>
          <Counselor360Signals
            atRiskAlert={atRiskAlertDisplay}
            topOccupations={topOccupations}
            nextBestActions={pendingNextBestActions}
          />
        </div>

        {/* Progress Timeline */}
        <div style={{ padding: '0 1rem 1rem' }}>
          <MemberProgressTimeline events={timelineEvents} programAvgDays={programAvgDays} />
        </div>

        {/* Counselor Notes */}
        <div style={{ padding: '0 1rem 1rem' }}>
          <CounselorNotesPanel key={member.id} memberId={member.id} />
        </div>

        {/* Session Notes */}
        <div style={{ padding: '0 1rem 1rem' }}>
          <AdvisorSessionNotesPanel key={member.id} memberId={member.id} />
        </div>

        {/* Elevator pitch deployments — mobile */}
        <div style={{ padding: '0 1rem 1rem' }}>
          <div
            style={{
              background: 'var(--surface-container-lowest)',
              borderRadius: '0.75rem',
              padding: '1.25rem',
              border: '1px solid var(--outline-variant)',
            }}
          >
            <h2 style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--color-on-surface)', margin: '0 0 0.5rem' }}>
              Elevator Pitch
            </h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--color-on-surface-variant)', margin: '0 0 0.875rem' }}>
              <strong style={{ color: 'var(--color-on-surface)' }}>Pitch uses:</strong>{' '}
              {typedPitchDeployments.length}
            </p>
            {typedPitchDeployments.length === 0 ? (
              <p style={{ fontSize: '0.8rem', color: 'var(--color-on-surface-variant)' }}>
                No pitch deployments logged yet.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {typedPitchDeployments.map((ev) => (
                  <div
                    key={ev.id}
                    style={{
                      padding: '0.625rem 0.75rem',
                      borderRadius: '0.5rem',
                      background: 'var(--surface-container-low)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '0.5rem',
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--color-on-surface)', margin: 0 }}>
                        {ev.meta.employer ?? '—'}
                      </p>
                      <p style={{ fontSize: '0.7rem', color: 'var(--color-on-surface-variant)', margin: '0.125rem 0 0' }}>
                        {formatPortalDate(ev.meta.usedAt ?? ev.createdAt)}
                      </p>
                    </div>
                    <span
                      style={{
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        color: pitchOutcomeColor(ev.meta.outcome),
                        flexShrink: 0,
                      }}
                    >
                      {pitchOutcomeLabel(ev.meta.outcome)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {wioaSnap ? (
          <div style={{ padding: '0 1rem 1rem' }}>
            <WioaScreeningReadonly
              snapshot={wioaSnap}
              reviewStatus={member.wioaReviewStatus}
              reviewedAt={member.wioaReviewedAt?.toISOString() ?? null}
              reviewerName={wioaReviewerName}
              reviewNotes={member.wioaReviewNotes}
            />
          </div>
        ) : null}
        <div style={{ padding: '0 1rem 1rem' }}>{intakeReviewPanel}</div>
        {assessmentRows ? (
          <div style={{ padding: '0 1rem 1rem' }}>
            <AssessmentAnswersReadonly
              rows={assessmentRows}
              score={member.assessmentScore}
              scorePct={member.assessmentScorePct}
              completedAt={member.assessmentCompletedAt}
              programInterest={member.programInterest}
            />
          </div>
        ) : null}

        <div style={{ padding: '0 1rem 1.5rem' }}>
          <div
            style={{
              background: 'var(--surface-container-lowest)',
              borderRadius: '0.75rem',
              padding: '1.25rem',
              border: '1px solid var(--outline-variant)',
            }}
          >
            <h2 style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--color-on-surface)', margin: '0 0 1rem' }}>
              Resumes
            </h2>
            <StaffMemberResumePanel memberId={member.id} />
          </div>
        </div>

        <div style={{ padding: '0 1rem 1.5rem' }}>
          <div
            style={{
              background: 'var(--surface-container-lowest)',
              borderRadius: '0.75rem',
              padding: '1.25rem',
              border: '1px solid var(--outline-variant)',
            }}
          >
            <h2 style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--color-on-surface)', margin: '0 0 0.35rem' }}>
              Training invoice &amp; cover letter (J5 / J6)
            </h2>
            <p style={{ margin: '0 0 1rem', fontSize: '0.85rem', color: 'var(--color-muted)' }}>
              Signed by the office and emailed to you and the student. Download the PDFs here anytime.
            </p>
            <BillingPacketList packets={billingPackets} emptyText="No signed invoice packet for this student yet." />
          </div>
        </div>

        {/* Job Pipeline */}
        <div style={{ padding: '0 1rem 1.5rem' }}>
          <div
            style={{
              background: 'var(--surface-container-lowest)',
              borderRadius: '0.75rem',
              padding: '1.25rem',
              border: '1px solid var(--outline-variant)',
            }}
          >
            <h2 style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--color-on-surface)', margin: '0 0 1rem' }}>
              Job Pipeline
            </h2>

            {applications.length === 0 && aiMatches.length === 0 ? (
              <p style={{ fontSize: '0.8rem', color: 'var(--color-on-surface-variant)' }}>
                No applications or AI matches yet.
              </p>
            ) : null}

            {applications.length > 0 ? (
              <div style={{ marginBottom: '1rem' }}>
                <p style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-on-surface-variant)', margin: '0 0 0.5rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Applications
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {applications.map((app) => (
                    <div
                      key={app.id}
                      style={{
                        padding: '0.75rem',
                        borderRadius: '0.5rem',
                        background: 'var(--surface-container-low)',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                        <div style={{ minWidth: 0 }}>
                          <p style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--color-on-surface)', margin: 0 }}>{app.job.title}</p>
                          <p style={{ fontSize: '0.75rem', color: 'var(--color-on-surface-variant)', margin: '0.125rem 0 0' }}>{app.job.employer.companyName}</p>
                        </div>
                        <StatusBadge
                          label={employerJobPostingApplicationStatusLabel(app.status)}
                          variant={employerJobPostingApplicationStatusBadgeVariant(app.status)}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {aiMatches.length > 0 ? (
              <div>
                <p style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-on-surface-variant)', margin: '0 0 0.5rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  AI Matches
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {aiMatches.map((m) => (
                    <div
                      key={m.id}
                      style={{
                        padding: '0.75rem',
                        borderRadius: '0.5rem',
                        background: 'var(--surface-container-low)',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                        <div style={{ minWidth: 0 }}>
                          <p style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--color-on-surface)', margin: 0 }}>{m.job.title}</p>
                          <p style={{ fontSize: '0.75rem', color: 'var(--color-on-surface-variant)', margin: '0.125rem 0 0' }}>{m.job.employer.companyName}</p>
                        </div>
                        <div style={{ flexShrink: 0, textAlign: 'right' }}>
                          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-accent)' }}>{matchScoreAsPercent(m.matchScore)}%</div>
                          <div style={{ marginTop: '0.25rem' }}>
                            <StatusBadge
                              label={employerMatchPipelineLabel(m.status)}
                              variant={employerAiMatchStatusBadgeVariant(m.status)}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* ── Desktop ─────────────────────────────────────────── */}
      <div className="wa-hidden md:wa-block">
        <div className="portal-main-content">
          <div className="wa-mt-4 wa-mb-4">{trainingHandoff}</div>

          {/* Employment barrier chips — desktop */}
          {member.profile?.hasEmploymentBarrier && member.profile.barrierTypes.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem', margin: '1rem 0' }}>
              {member.profile.barrierTypes.map((bt) => (
                <span
                  key={bt}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    padding: '0.15rem 0.5rem',
                    borderRadius: '9999px',
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    background: 'var(--wa-gold-soft)',
                    color: 'var(--wa-gold-dark)',
                    border: '1px solid color-mix(in srgb, var(--wa-gold) 32%, transparent)',
                  }}
                >
                  {bt.replace(/_/g, ' ')}
                </span>
              ))}
            </div>
          )}

          {wioaSnap ? (
            <section style={{ marginTop: '1.5rem' }}>
              <WioaScreeningReadonly
                snapshot={wioaSnap}
                reviewStatus={member.wioaReviewStatus}
                reviewedAt={member.wioaReviewedAt?.toISOString() ?? null}
                reviewerName={wioaReviewerName}
                reviewNotes={member.wioaReviewNotes}
              />
            </section>
          ) : null}
          <section style={{ marginTop: '1.5rem' }}>{intakeReviewPanel}</section>
          {assessmentRows ? (
            <section style={{ marginTop: '1.5rem' }}>
              <AssessmentAnswersReadonly
                rows={assessmentRows}
                score={member.assessmentScore}
                scorePct={member.assessmentScorePct}
                completedAt={member.assessmentCompletedAt}
                programInterest={member.programInterest}
              />
            </section>
          ) : null}

          {/* Other programs this student is in — multi-program-aware. Hidden
              when only the primary enrollment exists, preserving the
              single-program UX. */}
          {otherProgramEnrollments.length > 0 ? (
            <section style={{ marginTop: '1.5rem', maxWidth: 640 }}>
              <h2 style={{ fontSize: '1.1rem', marginBottom: '0.5rem', fontWeight: 700 }}>
                Other programs this student is in
              </h2>
              <p style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', color: 'var(--color-on-surface-variant)' }}>
                Secondary enrollments outside the primary program ({activeProgramSlug ? programDisplayTitle(activeProgramSlug) : '—'}).
              </p>
              <div className="portal-card portal-card--flat" style={{ padding: '1rem', border: '1px solid var(--outline-variant)' }}>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {otherProgramEnrollments.map((row) => (
                    <li
                      key={row.programSlug}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '0.5rem',
                        padding: '0.55rem 0.75rem',
                        borderRadius: '0.5rem',
                        background: 'var(--surface-container-low)',
                      }}
                    >
                      <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>
                        {row.programTitle}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          ) : null}

          {/* Progress Timeline */}
          <section style={{ marginTop: '1.5rem', maxWidth: 640 }}>
            <MemberProgressTimeline events={timelineEvents} programAvgDays={programAvgDays} />
          </section>

          {memberPts && (
            <section style={{ marginTop: '1.5rem', maxWidth: 480 }}>
              <h2 className="portal-section-heading" style={{ marginBottom: '0.75rem' }}>Member Points</h2>
              <PointsWidget total={memberPts.total} level={memberPts.level} recent={recentTx} />
              <div style={{ marginTop: '0.75rem' }}>
                <AwardPointsButton
                  memberId={member.id}
                  memberName={member.fullName ?? 'this member'}
                  apiHref={`/api/counselor/members/${member.id}/award-points`}
                />
              </div>
            </section>
          )}

          {/* Counselor 360 signals — at-risk, career quiz, next-best-actions */}
          <section style={{ marginTop: '1.5rem' }}>
            <h2 style={{ fontSize: '1.1rem', marginBottom: '0.75rem', fontWeight: 700 }}>Counselor 360 Signals</h2>
            <Counselor360Signals
              atRiskAlert={atRiskAlertDisplay}
              topOccupations={topOccupations}
              nextBestActions={pendingNextBestActions}
            />
          </section>

          {/* Elevator pitch deployments — desktop */}
          <section style={{ marginTop: '1.5rem', maxWidth: 640 }}>
            <h2 style={{ fontSize: '1.1rem', marginBottom: '0.75rem', fontWeight: 700 }}>Elevator Pitch Usage</h2>
            <div
              className="portal-card portal-card--flat"
              style={{ padding: '1.25rem', border: '1px solid var(--outline-variant)' }}
            >
              <p style={{ fontSize: '0.875rem', marginBottom: '0.875rem', color: 'var(--color-on-surface)' }}>
                <strong>Elevator pitch uses:</strong>{' '}
                {typedPitchDeployments.length}
              </p>
              {typedPitchDeployments.length === 0 ? (
                <p style={{ fontSize: '0.875rem', color: 'var(--color-on-surface-variant)' }}>
                  No pitch deployments logged yet.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr auto auto',
                      gap: '0.5rem',
                      padding: '0 0.5rem 0.375rem',
                      borderBottom: '1px solid var(--outline-variant)',
                    }}
                  >
                    <span style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-on-surface-variant)' }}>Employer</span>
                    <span style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-on-surface-variant)', textAlign: 'right' }}>Outcome</span>
                    <span style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-on-surface-variant)', textAlign: 'right' }}>Date</span>
                  </div>
                  {typedPitchDeployments.map((ev) => (
                    <div
                      key={ev.id}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr auto auto',
                        gap: '0.5rem',
                        padding: '0.375rem 0.5rem',
                        borderRadius: '0.375rem',
                        background: 'var(--surface-container-lowest)',
                        alignItems: 'center',
                      }}
                    >
                      <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-on-surface)' }}>
                        {ev.meta.employer ?? '—'}
                      </span>
                      <span
                        style={{
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          color: pitchOutcomeColor(ev.meta.outcome),
                          textAlign: 'right',
                        }}
                      >
                        {pitchOutcomeLabel(ev.meta.outcome)}
                      </span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--color-on-surface-variant)', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {formatPortalDate(ev.meta.usedAt ?? ev.createdAt)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section style={{ marginTop: '1.5rem' }}>
            <h2 style={{ fontSize: '1.1rem', marginBottom: '0.75rem', fontWeight: 700 }}>Resumes</h2>
            <div
              className="portal-card portal-card--flat"
              style={{ padding: '1.25rem', border: '1px solid var(--outline-variant)' }}
            >
              <StaffMemberResumePanel memberId={member.id} />
            </div>
          </section>

          <section style={{ marginTop: '1.5rem' }}>
            <h2 style={{ fontSize: '1.1rem', marginBottom: '0.75rem', fontWeight: 700 }}>Counselor Notes</h2>
            <CounselorNotesPanel key={member.id} memberId={member.id} />
          </section>

          <section style={{ marginTop: '1.5rem' }}>
            <h2 style={{ fontSize: '1.1rem', marginBottom: '0.75rem', fontWeight: 700 }}>Session Notes</h2>
            <AdvisorSessionNotesPanel key={member.id} memberId={member.id} />
          </section>

          <section id="counselor-member-messages" style={{ marginTop: '1.5rem' }}>
            {readOnlyAudit && <span hidden data-portal-audit-suppressed="counselor-member-message-thread-create-read-receipt-and-realtime" />}
            {messagesTruncated ? (
              <p style={{ fontSize: '0.8rem', color: 'var(--color-on-surface-variant)', margin: '0 0 0.5rem' }}>
                {messagesLabel}
              </p>
            ) : null}
            {readOnlyAudit && thread ? (
              <p>Counselor conversation is available. Live sync and read receipts are paused for this audit.</p>
            ) : thread ? <AdminMemberCounselorChatClient
              readCursorMode
              messagesApiBase={`/api/counselor/members/${member.id}/messages`}
              initial={{
                staffUserId: user.id,
                member: { id: member.id, fullName: member.fullName },
                thread: {
                  id: thread.id,
                  memberId: thread.memberId,
                  counselorUserId: thread.counselorUserId,
                  memberLastReadAt: thread.memberLastReadAt?.toISOString() ?? null,
                  counselorLastReadAt: thread.counselorLastReadAt?.toISOString() ?? null,
                },
                messages: messages.map((m) => ({
                  ...serializeMessage(m),
                  authorName: getMessageAuthorName(nameById, m.authorId),
                })),
              }}
            /> : <p>No counselor conversation has started yet.</p>}
          </section>

          {/* Job Pipeline — Desktop */}
          <section style={{ marginTop: '1.5rem' }}>
            <h2 style={{ fontSize: '1.1rem', marginBottom: '0.75rem', fontWeight: 700 }}>Job Pipeline</h2>
            {applications.length === 0 && aiMatches.length === 0 ? (
              <div className="portal-card portal-card--flat" style={{ padding: '1.25rem', border: '1px solid var(--outline-variant)' }}>
                <p style={{ color: 'var(--color-on-surface-variant)' }}>No applications or AI matches yet.</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '1rem' }}>
                {applications.length > 0 ? (
                  <div className="portal-card portal-card--flat" style={{ padding: '1.25rem', border: '1px solid var(--outline-variant)' }}>
                    <h3 style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.75rem', color: 'var(--color-on-surface-variant)' }}>Applications</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {applications.map((app) => (
                        <div key={app.id} style={{ padding: '0.75rem', borderRadius: '0.5rem', background: 'var(--surface-container-low)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                            <div>
                              <p style={{ fontWeight: 700, margin: 0 }}>{app.job.title}</p>
                              <p style={{ fontSize: '0.8rem', color: 'var(--color-on-surface-variant)', margin: '0.125rem 0 0' }}>{app.job.employer.companyName}</p>
                            </div>
                            <StatusBadge
                              label={employerJobPostingApplicationStatusLabel(app.status)}
                              variant={employerJobPostingApplicationStatusBadgeVariant(app.status)}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
                {aiMatches.length > 0 ? (
                  <div className="portal-card portal-card--flat" style={{ padding: '1.25rem', border: '1px solid var(--outline-variant)' }}>
                    <h3 style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.75rem', color: 'var(--color-on-surface-variant)' }}>AI Matches</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {aiMatches.map((m) => (
                        <div key={m.id} style={{ padding: '0.75rem', borderRadius: '0.5rem', background: 'var(--surface-container-low)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                            <div>
                              <p style={{ fontWeight: 700, margin: 0 }}>{m.job.title}</p>
                              <p style={{ fontSize: '0.8rem', color: 'var(--color-on-surface-variant)', margin: '0.125rem 0 0' }}>{m.job.employer.companyName}</p>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-accent)' }}>{matchScoreAsPercent(m.matchScore)}%</div>
                              <div style={{ marginTop: '0.25rem' }}>
                                <StatusBadge
                                  label={employerMatchPipelineLabel(m.status)}
                                  variant={employerAiMatchStatusBadgeVariant(m.status)}
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </section>

          {adminUser ? (
            <p style={{ marginTop: '1rem', fontSize: '0.9rem' }}>
              <Link href={`/admin/members/${member.id}`} className="btn btn-outline btn-sm">
                Open full member record (admin)
              </Link>
            </p>
          ) : null}
        </div>
      </div>

    </PortalPageFrame>
  );
}

// ─── Counselor 360 signals ──────────────────────────────────────────────────
// Three compact, read-only cards composed entirely from data already
// computed elsewhere (persisted at-risk alert, career-quiz JSON, and the
// member's persisted next-best-action queue). No new scoring/derivation.

type AtRiskAlertDisplay = {
  score: number;
  status: string;
  createdAt: Date;
  factors: { name: string; weight: number; description: string }[];
} | null;

type NextBestActionRow = {
  id: string;
  title: string;
  description: string;
  ctaLabel: string;
  ctaHref: string;
  icon: string | null;
  priority: number;
};

function Counselor360Signals({
  atRiskAlert,
  topOccupations,
  nextBestActions,
}: {
  atRiskAlert: AtRiskAlertDisplay;
  topOccupations: CareerMatchResult['topOccupations'];
  nextBestActions: NextBestActionRow[];
}) {
  return (
    <div style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
      <AtRiskSignalCard alert={atRiskAlert} />
      <CareerQuizRecommendationCard occupations={topOccupations} />
      <NextBestActionsCard actions={nextBestActions} />
    </div>
  );
}

const CARD_STYLE = { padding: '1.25rem', border: '1px solid var(--outline-variant)' } as const;

// Mirrors STATUS_LABEL in components/portal/counselor/AtRiskDashboard.tsx so the
// raw "acknowledged" / "escalated" enum never reaches the counselor's screen.
const AT_RISK_ALERT_STATUS_LABEL: Record<string, string> = {
  open: 'Open',
  acknowledged: 'Acknowledged',
  resolved: 'Resolved',
  escalated: 'Escalated',
};

function atRiskAlertStatusLabel(status: string): string {
  return AT_RISK_ALERT_STATUS_LABEL[status] ?? status;
}

function AtRiskSignalCard({ alert }: { alert: AtRiskAlertDisplay }) {
  if (!alert) {
    return (
      <div className="portal-card portal-card--flat" style={CARD_STYLE}>
        <h3 style={{ fontWeight: 700, fontSize: '0.9rem', margin: '0 0 0.5rem' }}>At-Risk Signal</h3>
        <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--color-on-surface-variant)' }}>
          No at-risk alert on file — the nightly risk scan hasn&apos;t flagged this member.
        </p>
      </div>
    );
  }
  const level = getRiskLevel(alert.score);
  const color =
    level === 'CRITICAL'
      ? 'var(--color-accent)'
      : level === 'HIGH'
        ? 'var(--color-gold)'
        : level === 'MEDIUM'
          ? 'var(--color-blue)'
          : 'var(--color-green)';
  return (
    <div className="portal-card portal-card--flat" style={{ ...CARD_STYLE, borderLeft: `4px solid ${color}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
        <h3 style={{ fontWeight: 700, fontSize: '0.9rem', margin: 0 }}>At-Risk Signal</h3>
        <span style={{ fontWeight: 700, fontSize: '0.8rem', color, whiteSpace: 'nowrap' }}>
          {level} · {alert.score}
        </span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginBottom: '0.5rem' }}>
        {alert.factors.length > 0 ? (
          alert.factors.map((f) => (
            <span
              key={f.name}
              title={`weight ${f.weight}`}
              style={{
                fontSize: '0.75rem',
                padding: '0.2rem 0.5rem',
                borderRadius: '999px',
                background: 'var(--surface-container-high)',
                color: 'var(--color-on-surface-variant)',
                fontWeight: 500,
              }}
            >
              {f.description}
            </span>
          ))
        ) : (
          <span style={{ fontSize: '0.8rem', color: 'var(--color-on-surface-variant)' }}>No specific factors recorded.</span>
        )}
      </div>
      <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--color-on-surface-variant)' }}>
        Status: <strong style={{ color: 'var(--color-on-surface)' }}>{atRiskAlertStatusLabel(alert.status)}</strong> · scanned{' '}
        {formatPortalDate(alert.createdAt)}
      </p>
    </div>
  );
}

function CareerQuizRecommendationCard({ occupations }: { occupations: CareerMatchResult['topOccupations'] }) {
  return (
    <div className="portal-card portal-card--flat" style={CARD_STYLE}>
      <h3 style={{ fontWeight: 700, fontSize: '0.9rem', margin: '0 0 0.5rem' }}>Career Quiz Recommendation</h3>
      {occupations.length === 0 ? (
        <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--color-on-surface-variant)' }}>
          This member hasn&apos;t completed the career quiz yet.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {occupations.map((o, idx) => (
            <div key={o.onetCode ?? o.title} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: idx === 0 ? 700 : 500 }}>{o.title}</span>
              {typeof o.confidence === 'number' ? (
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-accent)', whiteSpace: 'nowrap' }}>
                  {Math.round(o.confidence)}% match
                </span>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function NextBestActionsCard({ actions }: { actions: NextBestActionRow[] }) {
  return (
    <div className="portal-card portal-card--flat" style={CARD_STYLE}>
      <h3 style={{ fontWeight: 700, fontSize: '0.9rem', margin: '0 0 0.5rem' }}>Next Best Actions</h3>
      {actions.length === 0 ? (
        <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--color-on-surface-variant)' }}>
          No pending next-best-actions queued for this member.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {actions.map((a) => (
            <div key={a.id} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', padding: '0.5rem', borderRadius: '0.5rem', background: 'var(--surface-container-low)' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '1.1rem', color: 'var(--color-accent)', flexShrink: 0 }} aria-hidden="true">
                {a.icon || 'bolt'}
              </span>
              <div style={{ minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 600 }}>{a.title}</p>
                <p style={{ margin: '0.15rem 0 0', fontSize: '0.78rem', color: 'var(--color-on-surface-variant)' }}>{a.description}</p>
                <p style={{ margin: '0.25rem 0 0', fontSize: '0.72rem', color: 'var(--color-on-surface-variant)' }}>{a.ctaLabel}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
