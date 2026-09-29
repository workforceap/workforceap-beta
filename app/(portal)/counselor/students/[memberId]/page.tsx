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
import { badgeVariantToKitTone } from '@/lib/ui/statusToneAdapters';
import { getProgramBySlug } from '@/lib/content/programs';
import { programDisplayTitle } from '@/lib/content/programTitle';
import { programSlugsEquivalent } from '@/lib/content/programSlug';
import { getProgramCoursesForCurriculumVersion } from '@/lib/member/curriculumAssignment';
import { resolveTrainingProgressAssignment } from '@/lib/member/trainingProgress';
import { resolveActiveDashboardProgram } from '@/lib/member/resolveActiveDashboardProgram';
import { DISCOVERED_COURSERA_PROGRAMS } from '@/lib/content/courseraDiscoveredCatalog';
import { fetchLearnerProgressFromB4B } from '@/lib/coursera/learnerProgress';
import { isReadOnlyPortalAuditHeader } from '@/lib/audit/readOnlyPortalAudit';
import { loadMemberProgramTrainingView } from '@/lib/member/memberProgramTrainingView';
import CounselorNotesPanel from './CounselorNotesPanel';
import styles from './studentDetail.module.css';
import CounselorTrainingHandoff from '@/components/portal/counselor/CounselorTrainingHandoff';
import { StatusTag, TabPanel, Tabs, type KitTone } from '@/components/portal/kit';
import {
  STUDENT_DETAIL_TABS,
  STUDENT_DETAIL_TABS_ID_BASE,
  STUDENT_DETAIL_TAB_PARAM,
  parseStudentDetailTab,
} from './studentDetailTabs';
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
import { employerJobPostingApplicationStatusBadgeVariant } from '@/lib/employer/jobPostingApplicationStatus';
import { jobApplicationStatusLabel } from '@/lib/status/jobApplicationStatusVocabulary';
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
import { buildPlacementStage } from '@/lib/counselor/placementTimelineStage';
import { getRiskLevel } from '@/lib/member/atRiskScoring';
import type { CareerMatchResult } from '@/lib/onet/types';

type Props = {
  params: Promise<{ memberId: string }>;
  /** `?tab=profile|training|notes|messages` picks the opening record tab (default Profile). */
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export default async function CounselorStudentDetailPage({ params, searchParams }: Props) {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/counselor/students');

  if (!(await isCounselor(user.id)) && !(await isAdmin(user.id))) redirect('/dashboard');
  const readOnlyAudit = isReadOnlyPortalAuditHeader(await headers());

  const { memberId } = await params;
  const query = searchParams ? await searchParams : {};
  const initialTab = parseStudentDetailTab(query[STUDENT_DETAIL_TAB_PARAM]);

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
          id: true,
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
  // The placement stage reads the staff placement record (C05), never the
  // `placement_recorded` event: see lib/counselor/placementTimelineStage.ts.
  const [memberEvents, applicationCount, placementRecord] = await Promise.all([
    prisma.memberEvent.findMany({
      // Only the 4 milestone events below are ever read from this array, and
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
          ],
        },
      },
      orderBy: { createdAt: 'asc' },
      select: { eventName: true, createdAt: true },
    }),
    prisma.jobPostingApplication.count({ where: { studentId: memberId } }),
    prisma.placementRecord.findUnique({
      where: { userId: memberId },
      select: { placedAt: true, startDate: true, startDateVerified: true },
    }),
  ]);

  const enrollmentEvent = memberEvents.find((e) => e.eventName === 'program_enrolled');
  const assessmentEvent = memberEvents.find((e) => e.eventName === 'assessment_completed');
  const firstCourseEvent = memberEvents.find((e) => e.eventName === 'course_completed');
  const certEvent = memberEvents.find((e) => e.eventName === 'certification_earned');
  const placementStage = buildPlacementStage(placementRecord, applicationCount);

  function daysBetween(a: Date | null, b: Date | null): number | null {
    if (!a || !b) return null;
    return Math.max(0, Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24)));
  }

  // C05 part 2: the member's real enrollment is the primary CourseEnrollment
  // row (resolveActiveDashboardProgram: primary row, else the row matching the
  // legacy pointer), not `courseEnrollments[0]` and not only the legacy
  // `User.enrolledProgram` pointer, which is NULL for some enrolled members.
  const { primaryProgramSlug } = resolveActiveDashboardProgram({
    enrollments: member.courseEnrollments,
    legacyEnrolledProgram: member.enrolledProgram,
  });
  const primaryEnrollmentRow =
    member.courseEnrollments.find((row) => row.isPrimary) ??
    (primaryProgramSlug
      ? member.courseEnrollments.find((row) => programSlugsEquivalent(row.programSlug, primaryProgramSlug))
      : undefined) ??
    // Rows exist but none is primary or matches the pointer: the earliest row
    // (the select orders by enrolledAt) still dates the enrollment.
    member.courseEnrollments[0] ??
    null;
  /** The program the member is enrolled in, or null when they are not enrolled. */
  const enrolledProgramSlug = primaryProgramSlug ?? primaryEnrollmentRow?.programSlug ?? null;
  const enrolledAt = primaryEnrollmentRow?.enrolledAt ?? null;

  const timelineEvents: TimelineEvent[] = [
    {
      stage: 'enrollment',
      label: 'Enrollment',
      // Not enrolled: no date (the timeline prints "Pending"), never the signup date.
      date: enrolledAt?.toISOString() ?? null,
      durationDays: daysBetween(member.createdAt, enrolledAt),
      status: member.courseEnrollments.length > 0 ? 'completed' : 'pending',
    },
    {
      stage: 'assessment',
      label: 'Assessment',
      date: assessmentEvent?.createdAt.toISOString() ?? null,
      durationDays: daysBetween(
        enrolledAt ?? member.createdAt,
        assessmentEvent?.createdAt ?? null,
      ),
      status: assessmentEvent ? 'completed' : member.assessmentScorePct != null ? 'in_progress' : 'pending',
    },
    {
      stage: 'training',
      label: 'Training',
      date: firstCourseEvent?.createdAt.toISOString() ?? null,
      durationDays: daysBetween(
        assessmentEvent?.createdAt ?? enrolledAt ?? member.createdAt,
        firstCourseEvent?.createdAt ?? null,
      ),
      status: firstCourseEvent ? 'completed' : enrolledProgramSlug ? 'in_progress' : 'pending',
    },
    {
      stage: 'certification',
      label: 'Certification',
      date: certEvent?.createdAt.toISOString() ?? null,
      durationDays: daysBetween(
        firstCourseEvent?.createdAt ?? assessmentEvent?.createdAt ?? enrolledAt ?? member.createdAt,
        certEvent?.createdAt ?? null,
      ),
      status: certEvent ? 'completed' : enrolledProgramSlug ? 'in_progress' : 'pending',
    },
    {
      stage: 'placement',
      label: 'Placement',
      date: placementStage.date,
      durationDays: daysBetween(
        certEvent?.createdAt ?? firstCourseEvent?.createdAt ?? assessmentEvent?.createdAt ?? enrolledAt ?? member.createdAt,
        placementRecord?.placedAt ?? null,
      ),
      status: placementStage.status,
      note: placementStage.note,
    },
  ];

  // "Avg program: Nd" used to be computed as 100 / mean(rollup average_percent)
  // * 30 — a completion percentage inverted into a made-up day count (375d for
  // software-dev, 1143d for ai-practitioner), with no org, time-window or
  // completion filter, and it drove the per-stage "On track / Slower than avg"
  // verdict. Removed until a real cohort duration exists to compare against.

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
  // The program of interest shows only when the member is not enrolled at all.
  const storedProgram = enrolledProgramSlug ?? member.programInterest;
  // Header/subtitle print a title (alias-resolved, or humanised when the
  // catalog has no entry), never the raw stored slug.
  const program = storedProgram ? programDisplayTitle(storedProgram) : '—';
  const enrollmentBadge = counselorStudentStatusBadge({
    enrolledProgram: enrolledProgramSlug,
    assessmentScorePct: member.assessmentScorePct,
  });
  const enrollmentBadgeVariant = counselorStudentStatusBadgeVariant({
    enrolledProgram: enrolledProgramSlug,
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
  // Per-course reconciliation rows behind the header percentage. Rendering the
  // course list from `completedSlugs` alone printed "Not started" beside
  // courses the same reconciliation already credits at 31-93%.
  const courseProgressBySlug = new Map(
    (trainingView?.courseRows ?? []).map((row) => [row.courseSlug, row]),
  );
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
  function pitchOutcomeTone(outcome: PitchOutcome | undefined): KitTone {
    switch (outcome) {
      case 'interview': return 'ok';
      case 'pending': return 'warn';
      default: return 'muted';
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
  const barrierTypes = member.profile?.hasEmploymentBarrier ? member.profile.barrierTypes : [];

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
          <div className={styles.headerActions}>
            <Link href={messageHref} className="btn btn-outline btn-sm">
              <span className={`material-symbols-outlined ${styles.actionIcon}`} aria-hidden="true">
                chat
              </span>
              {t('priorityQueueActionMessage')}
            </Link>
            <Link href={sessionHref} className="btn btn-primary btn-sm">
              <span className={`material-symbols-outlined ${styles.actionIcon}`} aria-hidden="true">
                event
              </span>
              <span className="wa-block md:wa-hidden">{t('startSession')}</span>
              <span className="wa-hidden md:wa-block">{t('startInOfficeSession')}</span>
            </Link>
          </div>
        }
      />

      {/* ── Record tabs ─────────────────────────────────────────
          Counselor audit §6 item 3 / §2 item 4: the ~15 record sections are
          grouped under Profile / Training / Notes / Messages. Every panel is
          server-rendered here (no second fetch); the kit Tabs island only
          toggles `hidden`. `?tab=` picks the opening tab; the roster's
          `#counselor-member-messages` deep link opens Messages on load. */}
      <Tabs
        items={STUDENT_DETAIL_TABS}
        defaultValue={initialTab}
        label="Member record"
        idBase={STUDENT_DETAIL_TABS_ID_BASE}
        urlParam={STUDENT_DETAIL_TAB_PARAM}
        className={styles.tabs}
      >
        {/* ── Profile ─────────────────────────────────────────── */}
        <TabPanel value="profile">
          <div className={styles.stack}>
            <section className="wa-kit-card" aria-label="Member identity">
              <div className={styles.identity}>
                <div className={styles.avatar} aria-hidden="true">{initials}</div>
                <div className={styles.identityCopy}>
                  <p title={member.fullName ?? undefined} className={`wa-truncate ${styles.identityName}`}>
                    {memberTitle}
                  </p>
                  <p className={`wa-truncate ${styles.identityMeta}`}>{member.email ? `${program} · ${member.email}` : program}</p>
                  <StatusTag tone={badgeVariantToKitTone(enrollmentBadgeVariant)}>{enrollmentBadge.label}</StatusTag>
                </div>
              </div>
              {barrierTypes.length > 0 ? (
                <div className={styles.chips} aria-label="Employment barriers">
                  {barrierTypes.map((bt) => (
                    <StatusTag key={bt} tone="warn">
                      {bt.replace(/_/g, ' ')}
                    </StatusTag>
                  ))}
                </div>
              ) : null}
            </section>

            {intakeReviewPanel}

            {wioaSnap ? (
              <WioaScreeningReadonly
                snapshot={wioaSnap}
                reviewStatus={member.wioaReviewStatus}
                reviewedAt={member.wioaReviewedAt?.toISOString() ?? null}
                reviewerName={wioaReviewerName}
                reviewNotes={member.wioaReviewNotes}
              />
            ) : null}

            {assessmentRows ? (
              <AssessmentAnswersReadonly
                rows={assessmentRows}
                score={member.assessmentScore}
                scorePct={member.assessmentScorePct}
                completedAt={member.assessmentCompletedAt}
                programInterest={member.programInterest}
              />
            ) : null}

            {/* Counselor 360 signals — at-risk, career quiz, next-best-actions */}
            <section aria-labelledby="counselor-member-360-title">
              <h2 id="counselor-member-360-title" className={styles.sectionTitle}>Counselor 360 Signals</h2>
              <Counselor360Signals
                atRiskAlert={atRiskAlertDisplay}
                topOccupations={topOccupations}
                nextBestActions={pendingNextBestActions}
              />
            </section>

            <section className={styles.narrow} aria-label="Progress timeline">
              <MemberProgressTimeline events={timelineEvents} />
            </section>

            {memberPts ? (
              <section className={styles.narrower} aria-labelledby="counselor-member-points-title">
                <h2 id="counselor-member-points-title" className={styles.sectionTitle}>Member Points</h2>
                <PointsWidget total={memberPts.total} level={memberPts.level} recent={recentTx} />
                <div className="wa-mt-3">
                  <AwardPointsButton
                    memberId={member.id}
                    memberName={member.fullName ?? 'this member'}
                    apiHref={`/api/counselor/members/${member.id}/award-points`}
                  />
                </div>
              </section>
            ) : null}

            <section aria-labelledby="counselor-member-resumes-title">
              <h2 id="counselor-member-resumes-title" className={styles.sectionTitle}>Resumes</h2>
              <div className="wa-kit-card">
                <StaffMemberResumePanel memberId={member.id} />
              </div>
            </section>

            {/* Job Pipeline */}
            <section aria-labelledby="counselor-member-jobs-title">
              <h2 id="counselor-member-jobs-title" className={styles.sectionTitle}>Job Pipeline</h2>
              <div className="wa-kit-card">
                {applications.length === 0 && aiMatches.length === 0 ? (
                  <p className={styles.emptyCopy}>No applications or AI matches yet.</p>
                ) : null}

                {applications.length > 0 ? (
                  <div className={styles.group}>
                    <h3 className={`wa-kit-stat-label ${styles.groupLabel}`}>Applications</h3>
                    <ul className={styles.list}>
                      {applications.map((app) => (
                        <li key={app.id} className={`${styles.row} ${styles.rowStart}`}>
                          <div className={styles.rowCopy}>
                            <p className={styles.rowTitle}>{app.job.title}</p>
                            <p className={styles.rowMeta}>{app.job.employer.companyName}</p>
                          </div>
                          {/* A counselor reads the member's journey, not the employer's queue. */}
                          <StatusTag tone={badgeVariantToKitTone(employerJobPostingApplicationStatusBadgeVariant(app.status))}>
                            {jobApplicationStatusLabel(app.status, 'member')}
                          </StatusTag>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {aiMatches.length > 0 ? (
                  <div className={styles.group}>
                    <h3 className={`wa-kit-stat-label ${styles.groupLabel}`}>AI Matches</h3>
                    <ul className={styles.list}>
                      {aiMatches.map((m) => (
                        <li key={m.id} className={`${styles.row} ${styles.rowStart}`}>
                          <div className={styles.rowCopy}>
                            <p className={styles.rowTitle}>{m.job.title}</p>
                            <p className={styles.rowMeta}>{m.job.employer.companyName}</p>
                          </div>
                          <div className={styles.rowEnd}>
                            <div className={styles.accentValue}>{matchScoreAsPercent(m.matchScore)}%</div>
                            <div>
                              <StatusTag tone={badgeVariantToKitTone(employerAiMatchStatusBadgeVariant(m.status))}>
                                {employerMatchPipelineLabel(m.status)}
                              </StatusTag>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </section>

            {/* Elevator pitch deployments */}
            <section className={styles.narrow} aria-labelledby="counselor-member-pitch-title">
              <h2 id="counselor-member-pitch-title" className={styles.sectionTitle}>Elevator Pitch Usage</h2>
              <div className="wa-kit-card">
                <p className={styles.lede}>
                  <strong className={styles.strong}>Elevator pitch uses:</strong>{' '}
                  {typedPitchDeployments.length}
                </p>
                {typedPitchDeployments.length === 0 ? (
                  <p className={styles.emptyCopy}>No pitch deployments logged yet.</p>
                ) : (
                  <ul className={styles.list}>
                    {typedPitchDeployments.map((ev) => (
                      <li key={ev.id} className={styles.row}>
                        <div className={styles.rowCopy}>
                          <p className={styles.rowTitle}>{ev.meta.employer ?? '—'}</p>
                          <p className={styles.rowMeta}>{formatPortalDate(ev.meta.usedAt ?? ev.createdAt)}</p>
                        </div>
                        <StatusTag tone={pitchOutcomeTone(ev.meta.outcome)}>{pitchOutcomeLabel(ev.meta.outcome)}</StatusTag>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>

            {adminUser ? (
              <p className={styles.footerNote}>
                <Link href={`/admin/members/${member.id}`} className="btn btn-outline btn-sm">
                  Open full member record (admin)
                </Link>
              </p>
            ) : null}
          </div>
        </TabPanel>

        {/* ── Training ────────────────────────────────────────── */}
        <TabPanel value="training">
          <div className={styles.stack}>
            {trainingHandoff}

            {/* Program Progress — real data from enrolled program courses */}
            <section className="wa-kit-card" aria-labelledby="counselor-member-progress-title">
              <h2 id="counselor-member-progress-title" className={styles.sectionTitle}>Program Progress</h2>
              {programCourses.length === 0 ? (
                <p className={styles.emptyCopy}>
                  {activeProgramSlug ? 'No course data available for this program.' : 'Not enrolled in a program yet.'}
                </p>
              ) : (
                <>
                  <div className={styles.progressHead}>
                    <span>Overall Completion</span>
                    <span className={styles.accentValue}>{progressPct}%</span>
                  </div>
                  <div className={styles.progressTrack} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progressPct} aria-label="Overall completion">
                    <div className={styles.progressFill} style={{ width: `${progressPct}%` }} />
                  </div>
                  {trainingView?.averageGradePercentDisplay != null ? (
                    <div className={styles.progressHead}>
                      <span>Grade (avg, scored courses)</span>
                      <span className={styles.accentValue}>{trainingView.averageGradePercentDisplay}%</span>
                    </div>
                  ) : null}
                  <div className={styles.courses}>
                    {programCourses.map((course) => {
                      const reconciled = courseProgressBySlug.get(course.slug);
                      const done = reconciled?.displayCompleted ?? completedSlugs.has(course.slug);
                      const coursePct = done ? 100 : Math.round(reconciled?.displayPercent ?? 0);
                      return (
                        <div key={course.slug} className={styles.courseRow} data-done={done ? 'true' : 'false'} data-course-percent={coursePct}>
                          <span>{course.name}</span>
                          {done ? (
                            <span className={`material-symbols-outlined ${styles.doneIcon}`} aria-label="Completed" role="img">check_circle</span>
                          ) : coursePct > 0 ? (
                            <span>{coursePct}%</span>
                          ) : (
                            <span>Not started</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <SkillsetProgressList rows={skillsetProgress} variant="compact" />
                </>
              )}
            </section>

            {/* Other programs this student is in — multi-program-aware. Hidden
                when only the primary enrollment exists, preserving the
                single-program UX. */}
            {otherProgramEnrollments.length > 0 ? (
              <section className={`wa-kit-card ${styles.narrow}`} aria-labelledby="counselor-member-other-programs-title">
                <h2 id="counselor-member-other-programs-title" className={`${styles.sectionTitle} ${styles.sectionTitleTight}`}>
                  Other programs this student is in
                </h2>
                <p className={styles.lede}>
                  Secondary enrollments outside the primary program ({activeProgramSlug ? programDisplayTitle(activeProgramSlug) : '—'}).
                </p>
                <ul className={styles.list}>
                  {otherProgramEnrollments.map((row) => (
                    <li key={row.programSlug} className={styles.row}>
                      <span className={styles.rowTitle}>{row.programTitle}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <section className="wa-kit-card" aria-labelledby="counselor-member-billing-title">
              <h2 id="counselor-member-billing-title" className={`${styles.sectionTitle} ${styles.sectionTitleTight}`}>
                Training invoice &amp; cover letter (J5 / J6)
              </h2>
              <p className={styles.lede}>
                Signed by the office and emailed to you and the student. Download the PDFs here anytime.
              </p>
              <BillingPacketList packets={billingPackets} emptyText="No signed invoice packet for this student yet." />
            </section>
          </div>
        </TabPanel>

        {/* ── Notes ───────────────────────────────────────────── */}
        <TabPanel value="notes">
          <div className={styles.stack}>
            <section aria-labelledby="counselor-member-notes-title">
              <h2 id="counselor-member-notes-title" className={styles.sectionTitle}>Counselor Notes</h2>
              <CounselorNotesPanel key={member.id} memberId={member.id} />
            </section>

            <section aria-labelledby="counselor-member-session-notes-title">
              <h2 id="counselor-member-session-notes-title" className={styles.sectionTitle}>Session Notes</h2>
              <AdvisorSessionNotesPanel key={member.id} memberId={member.id} />
            </section>
          </div>
        </TabPanel>

        {/* ── Messages ────────────────────────────────────────── */}
        {/* `counselor-member-messages` is the public anchor the roster and the
            at-risk page deep-link to (counselor audit §6 item 2); the Tabs
            island opens this panel when the hash names it. */}
        <TabPanel value="messages">
          <section
            id="counselor-member-messages"
            aria-labelledby="counselor-member-messages-title"
          >
            <div className="wa-kit-card">
              <h2 id="counselor-member-messages-title" className={styles.sectionTitle}>
                Messages
              </h2>
              {readOnlyAudit && <span hidden data-portal-audit-suppressed="counselor-member-message-thread-create-read-receipt-and-realtime" />}
              {messagesTruncated ? (
                <p className={`wa-kit-meta ${styles.lede}`}>
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
            </div>
          </section>
        </TabPanel>
      </Tabs>
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
    <div className={styles.signals}>
      <AtRiskSignalCard alert={atRiskAlert} />
      <CareerQuizRecommendationCard occupations={topOccupations} />
      <NextBestActionsCard actions={nextBestActions} />
    </div>
  );
}

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

/** Risk tier → kit tone (docs/KIT_GUIDE.md §4): critical reads as brand attention, not true red. */
const AT_RISK_LEVEL_TONE: Record<ReturnType<typeof getRiskLevel>, KitTone> = {
  CRITICAL: 'alert',
  HIGH: 'warn',
  MEDIUM: 'info',
  LOW: 'ok',
};

function AtRiskSignalCard({ alert }: { alert: AtRiskAlertDisplay }) {
  if (!alert) {
    return (
      <div className="wa-kit-card wa-kit-card--sm">
        <h3 className={styles.cardTitle}>At-Risk Signal</h3>
        <p className={styles.emptyCopy}>
          No at-risk alert on file — the nightly risk scan hasn&apos;t flagged this member.
        </p>
      </div>
    );
  }
  const level = getRiskLevel(alert.score);
  return (
    <div className={`wa-kit-card wa-kit-card--sm wa-kit-tone-edge wa-kit-tone--${AT_RISK_LEVEL_TONE[level]}`} data-risk-level={level}>
      <div className={styles.cardHead}>
        <h3 className={styles.cardTitle}>At-Risk Signal</h3>
        <span className="wa-kit-tone-text">
          {level} · {alert.score}
        </span>
      </div>
      <div className={styles.factors}>
        {alert.factors.length > 0 ? (
          alert.factors.map((f) => (
            <span key={f.name} title={`weight ${f.weight}`} className={styles.factor}>
              {f.description}
            </span>
          ))
        ) : (
          <span className={styles.emptyCopy}>No specific factors recorded.</span>
        )}
      </div>
      <p className={styles.emptyCopy}>
        Status: <strong className={styles.strong}>{atRiskAlertStatusLabel(alert.status)}</strong> · scanned{' '}
        {formatPortalDate(alert.createdAt)}
      </p>
    </div>
  );
}

function CareerQuizRecommendationCard({ occupations }: { occupations: CareerMatchResult['topOccupations'] }) {
  return (
    <div className="wa-kit-card wa-kit-card--sm">
      <h3 className={styles.cardTitle}>Career Quiz Recommendation</h3>
      {occupations.length === 0 ? (
        <p className={styles.emptyCopy}>
          This member hasn&apos;t completed the career quiz yet.
        </p>
      ) : (
        <ul className={styles.list}>
          {occupations.map((o, idx) => (
            <li key={o.onetCode ?? o.title} className={styles.cardHead}>
              <span className={idx === 0 ? styles.rowTitle : undefined}>{o.title}</span>
              {typeof o.confidence === 'number' ? (
                <span className={styles.accentValue}>
                  {Math.round(o.confidence)}% match
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NextBestActionsCard({ actions }: { actions: NextBestActionRow[] }) {
  return (
    <div className="wa-kit-card wa-kit-card--sm">
      <h3 className={styles.cardTitle}>Next Best Actions</h3>
      {actions.length === 0 ? (
        <p className={styles.emptyCopy}>
          No pending next-best-actions queued for this member.
        </p>
      ) : (
        <ul className={styles.list}>
          {actions.map((a) => (
            <li key={a.id} className={styles.nba}>
              <span className={`material-symbols-outlined ${styles.nbaIcon}`} aria-hidden="true">
                {a.icon || 'bolt'}
              </span>
              <div className={styles.rowCopy}>
                <p className={styles.rowTitle}>{a.title}</p>
                <p className={styles.rowMeta}>{a.description}</p>
                <p className={styles.rowMeta}>{a.ctaLabel}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
