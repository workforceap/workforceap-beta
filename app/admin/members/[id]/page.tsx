import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { Prisma } from '@prisma/client';
import { notFound, redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { resolveAdminPageTenant, withAdminPageScope, inheritUserOrg, inheritMemberOrg, inheritLeaderOrg, inheritInvitedByOrg } from '@/lib/tenant/adminPageScope';
import { prisma } from '@/lib/db/prisma';
import { LOOKUP_LIST_CAP, MEMBER_HISTORY_CAP, isListTruncated } from '@/lib/db/queryCaps';
import { getProgramBySlug } from '@/lib/content/programs';
import { programDisplayTitle } from '@/lib/content/programTitle';
import { programSlugsEquivalent } from '@/lib/content/programSlug';
import { buildMemberProgramOptions } from '@/lib/admin/assignableProgramOptions';
import { isMemberWioaVerified } from '@/lib/platform/trainingEnrollmentGate';
import AdminMemberResumeSection from '@/components/admin/AdminMemberResumeSection';
// Use the client-safe questions file — the "Full Q&A" details list only
// renders question text + recorded answer, no correctness check.
import AssessmentAnswersReadonly from '@/components/admin/AssessmentAnswersReadonly';
import { buildAssessmentReviewRows } from '@/lib/assessment/reviewRows';
import MemberDetailActions from '@/components/admin/MemberDetailActions';
import MemberCourseraEnrollmentApproval from '@/components/admin/MemberCourseraEnrollmentApproval';
import AdminMemberConsentPanel from '@/components/admin/AdminMemberConsentPanel';
import AdminMemberDbActions from '@/components/admin/AdminMemberDbActions';
import AdminMemberQuickSummary from '@/components/admin/AdminMemberQuickSummary';
import AdminMemberSendLinks from '@/components/admin/AdminMemberSendLinks';
import MemberPartnerSection from '@/components/admin/MemberPartnerSection';
import MemberSubgroupSection from '@/components/admin/MemberSubgroupSection';
import AdminMemberCounselorChatClient from '@/components/admin/AdminMemberCounselorChatClient';
import AdminMemberCounselorAssign from '@/components/admin/AdminMemberCounselorAssign';
import AdminMemberPlacedOutcomeForm from '@/components/admin/AdminMemberPlacedOutcomeForm';
import AdminMemberEnrollmentFundingForm from '@/components/admin/AdminMemberEnrollmentFundingForm';
import AdminMemberWorkspaceEmail from '@/components/admin/AdminMemberWorkspaceEmail';
import { getWorkspaceEmailAvailability } from '@/lib/workspace-email/provider';
import CreateSuccessToast from './CreateSuccessToast';
import { formatPhone } from '@/lib/formatPhone';
import { compactStringIds, getMessageAuthorName, getOrCreateMemberCounselorThread, serializeMessage } from '@/lib/messages/counselorThread';
import { isReadOnlyPortalAuditHeader } from '@/lib/audit/readOnlyPortalAudit';
import { AlertTriangle, ClipboardList, CheckCircle } from 'lucide-react';
import { parseWioaQualificationSnapshot } from '@/lib/wioa/wioaQualification';
import type { WioaReviewStatus } from '@/lib/wioa/wioaReview';
import AdminMemberWioaReviewPanel from '@/components/admin/AdminMemberWioaReviewPanel';
import ApplicantTriageChecklist from '@/components/admin/ApplicantTriageChecklist';
import { localizeApplicantTriage } from '@/lib/admin/applicantTriage';
import { loadApplicantTriageByUserIds, type ApplicantTriageLoaded } from '@/lib/admin/applicantTriageLoad';
import { getTranslations } from 'next-intl/server';
import { loadWioaReviewSnapshots } from '@/lib/wioa/reviewSnapshot';
import PageHeader from '@/components/portal/PageHeader';
import AdminMemberAiMatches from './AdminMemberAiMatches';
import MemberProgressStrip from '@/components/portal/MemberProgressStrip';
import { loadLearnerProgressByUserId } from '@/lib/coursera/progressQueries';
import { SMALL_SAMPLE_THRESHOLD } from '@/lib/admin/boardOutcomes';
import { getMemberOutcomesSummary } from '@/lib/admin/memberOutcomesSummary';
import MemberCourseraDiagnoseButton from '@/components/admin/MemberCourseraDiagnoseButton';
import AdminMemberSkillCheckpointPanel from '@/components/admin/AdminMemberSkillCheckpointPanel';
import { loadSkillMissionSummary } from '@/lib/member/skillMissions';
import { deriveCareerPlanSignal } from '@/lib/admin/careerPlanSignal';
import { getProgramCoursesForCurriculumVersion } from '@/lib/member/curriculumAssignment';
import { reconcileProgramProgress } from '@/lib/coursera/progressReconciliation';
type AdminCourseProgressRow = {
  programSlug: string;
  courseSlug: string;
  courseId: string | null;
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
  percentComplete: number;
  lastUpdatedAt: Date;
};

type AdminMemberProgramProgressRow = {
  programSlug: string;
  averagePercent: number;
  coursesCompleted: number;
  lastUpdatedAt: Date;
};

const CAREER_PLAN_EVENT_NAMES = [
  'career_quiz_result_viewed',
  'career_plan_saved',
  'career_plan_commitment_shared',
  'career_plan_application_started',
  'career_plan_training_cta_clicked',
] satisfies string[];

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadataAsync({
  title: 'Member Detail',
  description: 'View and manage member.',
  path: '/admin/members',
});
}

export default async function AdminMemberDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const workspaceEmailAvailability = getWorkspaceEmailAvailability();
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/admin/members');

  const scope = await resolveAdminPageTenant(user.id);
  if (!scope.ok) redirect('/dashboard');
  const readOnlyAudit = isReadOnlyPortalAuditHeader(await headers());

  const { id } = await params;

  const fullMemberSelect = {
    id: true,
    organizationId: true,
    email: true,
    fullName: true,
    phone: true,
    deletedAt: true,
    enrolledProgram: true,
    enrolledAt: true,
    programChangedAt: true,
    assessmentCompleted: true,
    assessmentCompletedAt: true,
    assessmentScore: true,
    assessmentScorePct: true,
    programInterest: true,
    assessmentAnswers: true,
    interviewEligible: true,
    interviewRequestedAt: true,
    interviewCompletedAt: true,
    workspaceEmail: true,
    workspaceEmailProvisioned: true,
    careerRecommendationJson: true,
    applications: {
      orderBy: { createdAt: 'desc' },
      take: 3,
      select: {
        status: true,
        submittedAt: true,
        recommendedCareerTitle: true,
        programRankedSlugs: true,
      },
    },
    memberEvents: {
      where: {
        eventName: {
          in: CAREER_PLAN_EVENT_NAMES as string[],
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { eventName: true, createdAt: true, metadata: true },
    },
    wioaQualificationJson: true,
    wioaReviewStatus: true,
    wioaReviewedAt: true,
    wioaReviewedByUserId: true,
    wioaReviewNotes: true,
    courseraEnrollmentApproved: true,
    courseraEnrollmentApprovedAt: true,
    courseraEnrollmentApprovedById: true,
    profile: true,
    learningProgress: true,
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
    memberProgramProgress: {
      select: { programSlug: true, averagePercent: true, coursesCompleted: true, lastUpdatedAt: true },
    },
    userCertifications: true,
    aiJobMatches: {
      include: {
        job: {
          include: {
            employer: true,
          },
        },
      },
    },
  } as const;

  const fallbackMemberSelect = {
    id: true,
    organizationId: true,
    email: true,
    fullName: true,
    phone: true,
    deletedAt: true,
    enrolledProgram: true,
    enrolledAt: true,
    programChangedAt: true,
    assessmentCompleted: true,
    assessmentCompletedAt: true,
    assessmentScore: true,
    assessmentScorePct: true,
    programInterest: true,
    assessmentAnswers: true,
    interviewEligible: true,
    interviewRequestedAt: true,
    interviewCompletedAt: true,
    workspaceEmail: true,
    workspaceEmailProvisioned: true,
    careerRecommendationJson: true,
    applications: {
      orderBy: { createdAt: 'desc' },
      take: 3,
      select: {
        status: true,
        submittedAt: true,
        recommendedCareerTitle: true,
        programRankedSlugs: true,
      },
    },
    memberEvents: {
      where: {
        eventName: {
          in: CAREER_PLAN_EVENT_NAMES as string[],
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { eventName: true, createdAt: true, metadata: true },
    },
    courseraEnrollmentApproved: true,
    courseraEnrollmentApprovedAt: true,
    courseraEnrollmentApprovedById: true,
    profile: true,
  } as const;

  const placementRecordSafeSelect = {
    id: true,
    userId: true,
    employerName: true,
    jobTitle: true,
    startDate: true,
    salaryOffered: true,
    placedAt: true,
    placedBy: true,
    notes: true,
    createdAt: true,
    updatedAt: true,
    // WIOA / grant-reporting fields — needed by AdminMemberPlacedOutcomeForm's
    // "initial" prop (previously omitted here, so the form always rendered
    // these as blank/unset even when a value had been saved).
    programSlug: true,
    wageAtFollowUp: true,
    retentionStatus: true,
    startDateVerified: true,
    fundingSource: true,
    grantReportingNotes: true,
    onboardingWindowEnd: true,
    retentionDecision: true,
  } as const;

  const leaderOrg = inheritLeaderOrg(scope);
  const userOrg = inheritUserOrg(scope);
  const sharedQueries = (db: any) => [
    db.partner.findMany({
      take: LOOKUP_LIST_CAP,
      where: { active: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
    db.partnerReferral.findFirst({
      where: { memberId: id },
      select: { partnerId: true },
    }),
    db.subgroup.findMany({
      take: LOOKUP_LIST_CAP,
      where: { ...leaderOrg },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, type: true },
    }),
    db.memberSubgroup.findMany({
      take: LOOKUP_LIST_CAP,
      where: { memberId: id },
      select: { subgroupId: true },
    }),
    db.counselor.findMany({
      take: LOOKUP_LIST_CAP,
      where: { active: true, ...userOrg },
      orderBy: [{ partner: { name: 'asc' } }, { user: { fullName: 'asc' } }],
      include: {
        user: { select: { fullName: true } },
        partner: { select: { name: true } },
      },
    }),
    db.counselorAssignment.findFirst({
      where: { memberId: id, active: true },
      include: { counselor: { select: { userId: true, user: { select: { fullName: true } } } } },
    }),
    db.placementRecord.findFirst({ where: { userId: id }, select: placementRecordSafeSelect }).catch(() => null),
    // Multi-program: funding/workspace metadata lives on the primary
    // enrollment row. Secondary enrollments inherit nothing here.
    db.courseEnrollment.findFirst({
      where: { userId: id, isPrimary: true },
      orderBy: { enrolledAt: 'desc' },
      select: {
        programSlug: true,
        curriculumVersion: true,
        enrolledByAdminId: true,
        fundingSource: true,
        fundingNotes: true,
        workspaceEmail: true,
        workspaceEmailProvisioned: true,
      },
    }).catch(() => null),
    db.memberEvent.findMany({
      where: { userId: id, eventName: 'PLACEMENT_CONFIRMATION_SUBMITTED' },
      orderBy: { createdAt: 'desc' },
      take: 1,
      select: { metadata: true, createdAt: true },
    }).catch(() => []),
  ] as const;

  let member: any;
  let partners: any;
  let partnerReferral: any;
  let subgroups: any;
  let memberSubgroups: any;
  let counselorRows: any;
  let activeCounselorAssign: any;
  let placedOutcomeRow: any;
  let courseEnrollment: any;
  let pendingPlacementEvents: any;

  try {
    [member, partners, partnerReferral, subgroups, memberSubgroups, counselorRows, activeCounselorAssign, placedOutcomeRow, courseEnrollment, pendingPlacementEvents] =
      await withAdminPageScope(scope, (db) => Promise.all([
        db.user.findFirst({ where: { id }, select: fullMemberSelect }),
        ...sharedQueries(db),
      ]));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? '');
    const looksLikeSchemaDrift =
      error instanceof Prisma.PrismaClientKnownRequestError ||
      error instanceof Prisma.PrismaClientUnknownRequestError ||
      /wioa_|learning_progress|user_certifications|ai_job_matches|a_i_job_matches|organization_program_catalog/i.test(message);

    if (!looksLikeSchemaDrift) throw error;

    console.error('[admin/member-detail] falling back after optional data query failed', error);

    [member, partners, partnerReferral, subgroups, memberSubgroups, counselorRows, activeCounselorAssign, placedOutcomeRow, courseEnrollment, pendingPlacementEvents] =
      await withAdminPageScope(scope, (db) => Promise.all([
        db.user.findFirst({ where: { id }, select: fallbackMemberSelect }),
        ...sharedQueries(db),
      ]));

    if (member) {
      member = {
        ...member,
        learningProgress: [],
        userCertifications: [],
        aiJobMatches: [],
        wioaQualificationJson: null,
        wioaReviewStatus: null,
        wioaReviewedAt: null,
        wioaReviewedByUserId: null,
        wioaReviewNotes: null,
      };
    }
  }

  if (!member || member.deletedAt) notFound();

  let wioaReviewerName: string | null = null;
  if (member.wioaReviewedByUserId) {
    const rev = await withAdminPageScope(scope, (db) => db.user.findFirst({
      where: { id: member.wioaReviewedByUserId },
      select: { fullName: true },
    }));
    wioaReviewerName = rev?.fullName ?? null;
  }

  const preScreening = await prisma.preScreeningResponse.findUnique({
    where: { userId: member.id },
  });

  // Super-admins may deliberately open a member outside their home tenant.
  // Program choices and WIOA history must follow the subject member, not the actor.
  const organizationId = member.organizationId;
  const catalogPrograms = await prisma.organizationProgramCatalog.findMany({
    take: LOOKUP_LIST_CAP,
    where: { organizationId },
    orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
    select: { programSlug: true, name: true, status: true },
  });
  const programOptions =
    catalogPrograms.length > 0
      ? buildMemberProgramOptions(
          catalogPrograms.map((row) => ({
            slug: row.programSlug,
            name: row.name,
            status: row.status,
          })),
          (courseEnrollment?.programSlug ?? member.enrolledProgram)
            ? getProgramBySlug(courseEnrollment?.programSlug ?? member.enrolledProgram)?.slug ??
                courseEnrollment?.programSlug ??
                member.enrolledProgram
            : null,
        )
      : null;

  const gate = isMemberWioaVerified({
    wioaReviewStatus: member.wioaReviewStatus,
    enrolledByAdminId: courseEnrollment?.enrolledByAdminId,
  });
  const enrollmentGateBlocked = !gate.ok;

  const activeProgramSlug = courseEnrollment?.programSlug ?? member.enrolledProgram ?? null;
  const program = activeProgramSlug ? getProgramBySlug(activeProgramSlug) : null;
  const curriculumVersion =
    program &&
    courseEnrollment?.programSlug &&
    programSlugsEquivalent(courseEnrollment.programSlug, program.slug)
      ? courseEnrollment.curriculumVersion
      : 'legacy-v1';
  const curriculumCourses = program
    ? getProgramCoursesForCurriculumVersion(program, curriculumVersion)
    : [];
  const liveCourseProgress = ((member.courseProgress ?? []) as AdminCourseProgressRow[])
    .filter((row) =>
      activeProgramSlug ? programSlugsEquivalent(row.programSlug, activeProgramSlug) : false,
    );
  const liveProgressBySlug = new Map<string, AdminCourseProgressRow>(liveCourseProgress.map((row) => [row.courseSlug, row]));
  const liveProgramProgress = ((member.memberProgramProgress ?? []) as AdminMemberProgramProgressRow[])
    .find((row) =>
      activeProgramSlug ? programSlugsEquivalent(row.programSlug, activeProgramSlug) : false,
    ) ?? null;
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
  const careerPlanSignal = deriveCareerPlanSignal({
    careerRecommendationJson: member.careerRecommendationJson,
    applications: member.applications ?? [],
    events: member.memberEvents ?? [],
    enrolledProgram: activeProgramSlug,
    activeCourseCount: liveCourseProgress.filter((row) => row.status === 'IN_PROGRESS').length,
    progressPercent: programReconciliation?.programPercent ?? liveProgramProgress?.averagePercent ?? 0,
  });
  const assessmentAnswers = member.assessmentAnswers as Record<number, string> | null;

  // Progress strip props for admin view
  const adminAllCoursesComplete =
    programReconciliation?.allComplete ?? false;
  const adminProgressStripProps = {
    intake: !!preScreening || !!(member as { onboardingCompletedAt?: unknown }).onboardingCompletedAt,
    assessment: !!member.assessmentCompleted,
    trainingStarted: liveCourseProgress.length > 0,
    certsComplete: adminAllCoursesComplete,
    employed: !!placedOutcomeRow,
  };
  const chatThread = readOnlyAudit
    ? await prisma.messageThread.findUnique({ where: { memberId: member.id } })
    : await getOrCreateMemberCounselorThread(member.id);
  const [chatMsgsNewestFirst, chatMessageTotal] = chatThread
    ? await Promise.all([
        prisma.message.findMany({
          take: MEMBER_HISTORY_CAP,
          where: { threadId: chatThread.id },
          orderBy: { createdAt: 'desc' },
        }),
        prisma.message.count({ where: { threadId: chatThread.id } }),
      ])
    : [[], 0];
  const chatMsgs = chatMsgsNewestFirst.slice().reverse();
  const chatAuthorIds = compactStringIds(chatMsgs.map((m) => m.authorId));
  const chatAuthors =
    chatAuthorIds.length > 0
      ? await withAdminPageScope(scope, (db) => db.user.findMany({
        take: MEMBER_HISTORY_CAP,
          where: { id: { in: chatAuthorIds } },
          select: { id: true, fullName: true },
        }))
      : [];
  const chatNameById = new Map(chatAuthors.map((n) => [n.id, n.fullName]));
  const chatTruncated = isListTruncated(chatMsgs.length, MEMBER_HISTORY_CAP, chatMessageTotal);
  const chatLabel = `Showing latest ${chatMsgs.length} of ${chatMessageTotal} messages`;

  const wioaSnap = parseWioaQualificationSnapshot(member.wioaQualificationJson);
  const wioaDecisionHistory = await loadWioaReviewSnapshots(member.id, organizationId);

  // Applicant intake triage (read-only aid; shown only while an application is open).
  const applicantTriageLoaded = await withAdminPageScope(scope, (db) => loadApplicantTriageByUserIds(db, [member.id])).catch(
    (error: unknown) => {
      console.error('[admin/members/[id]] applicant triage load failed', error);
      return new Map<string, ApplicantTriageLoaded>();
    },
  );
  const applicantTriage = applicantTriageLoaded.get(member.id) ?? null;
  const tAdmin = await getTranslations('admin');
  const applicantTriageDisplay = applicantTriage ? localizeApplicantTriage(applicantTriage, (key) => tAdmin(key)) : null;

  // Coursera B4B / xAPI learner detail — surfaces CSV-imported course
  // progress, specialization badges, and last activity timestamps on the
  // main member detail so admins do not have to context-switch to
  // /admin/coursera/learners/[userId] to see what's actually flowing in.
  const courseraDetail = await loadLearnerProgressByUserId(member.id);
  const courseraCourseCount = courseraDetail?.courses.length ?? 0;
  const courseraCompletedCount = courseraDetail?.courses.filter((c) => c.isCompleted).length ?? 0;
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

  const completedCourseSlugs = liveCourseProgress
    .filter((row) => row.status === 'COMPLETED')
    .map((row) => row.courseSlug);
  const skillMissionSummary = await loadSkillMissionSummary({
    userId: member.id,
    programSlug: activeProgramSlug,
    curriculumVersion,
    completedCourseSlugs,
  });

  // Exact organization-scoped aggregates, without loading the board's sampled
  // placement list, demographic breakdowns or unrelated application funnel.
  const outcomesSummary = await getMemberOutcomesSummary(member.organizationId).catch(
    (err: unknown) => {
      console.error('[admin/member-detail] outcomes summary failed', err);
      return null;
    },
  );
  const placedLast90d = outcomesSummary?.placedLast90d ?? 0;
  const orgPlacementRate = outcomesSummary?.placementRate ?? null;
  const orgEnrolled = outcomesSummary?.membersEnrolled ?? 0;
  const orgPlaced = outcomesSummary?.membersPlaced ?? 0;
  const orgAvgWeeksToPlacement = outcomesSummary?.averageWeeksToPlacement ?? null;
  const orgAvgDaysToPlacement =
    orgAvgWeeksToPlacement === null ? null : Math.round(orgAvgWeeksToPlacement * 7);

  const counselorChatInitial = chatThread ? {
    staffUserId: user.id,
    member: { id: member.id, fullName: member.fullName },
    thread: {
      id: chatThread.id,
      memberId: chatThread.memberId,
      counselorUserId: chatThread.counselorUserId,
      memberLastReadAt: chatThread.memberLastReadAt?.toISOString() ?? null,
      counselorLastReadAt: chatThread.counselorLastReadAt?.toISOString() ?? null,
    },
    messages: chatMsgs.map((m) => ({
      ...serializeMessage(m),
      authorName: getMessageAuthorName(chatNameById, m.authorId),
    })),
  } : null;

  return (
    <div>
      <Suspense fallback={null}>
        <CreateSuccessToast />
      </Suspense>
      <PageHeader
        breadcrumbs={[{ label: 'Members', href: '/admin/members' }, { label: 'Member Details' }]}
        title={member.fullName}
        subtitle={chatTruncated ? `${member.email} · ${chatLabel}` : member.email}
        action={
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'stretch', flexWrap: 'wrap', maxWidth: 430 }}>
            <Link href={`/admin/members/${id}/stakeholder`} className="btn btn-outline" style={{ flex: '1 1 10rem', justifyContent: 'center', minHeight: 44, textAlign: 'center' }}>Open stakeholder view</Link>
            <Link href={`/admin/members/${id}/lifecycle`} className="btn btn-outline" style={{ flex: '1 1 8rem', justifyContent: 'center', minHeight: 44 }}>
              <span className="material-symbols-outlined" style={{ fontSize: '1.125rem', marginRight: '0.25rem', verticalAlign: 'middle' }} aria-hidden="true">timeline</span>
              Lifecycle
            </Link>
            <Link href={`/admin/members/${id}/readiness`} className="btn btn-outline" style={{ flex: '1 1 8rem', justifyContent: 'center', minHeight: 44 }}>
              <ClipboardList size={18} style={{ marginRight: '0.35rem', verticalAlign: 'middle' }} />
              Readiness
            </Link>
            <Link href={`/admin/members/${id}/billing`} className="btn btn-outline" style={{ flex: '1 1 10rem', justifyContent: 'center', minHeight: 44, textAlign: 'center' }}>J5 / J6 billing</Link>
            <Link href="/admin/members" className="btn btn-outline" style={{ flex: '1 1 10rem', justifyContent: 'center', minHeight: 44 }}>Back to Members</Link>
          </div>
        }
      />

      {/* ── Member journey progress strip ── */}
      <div style={{ maxWidth: '800px', marginBottom: '1.5rem' }}>
        <MemberProgressStrip {...adminProgressStripProps} />
      </div>

      {/* `minmax(0, 1fr)` + `minWidth: 0` on the cards: the auto track otherwise
          grows to the widest card's min-content (433px at a 390px viewport), the
          same guard the stakeholder page uses (#2359). */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '1.5rem', maxWidth: '800px' }}>
        {/* Admin DB actions — password reset, profile edit */}
        <section className="portal-profile-section-card">
          <div className="portal-profile-section-card__header">
            <h2 className="portal-profile-section-card__title">Admin Actions</h2>
            <span style={{ fontSize: '0.625rem', fontWeight: 800, padding: '0.15rem 0.4rem', borderRadius: '9999px', background: 'rgba(173,44,77,0.1)', color: 'var(--color-accent)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Super admin</span>
          </div>
          <div className="portal-profile-section-card__body">
            <AdminMemberDbActions
              memberId={id}
              memberName={member.fullName}
              memberEmail={member.email}
              currentFullName={member.fullName}
              currentPhone={member.phone}
              currentProfilePhone={member.profile?.profilePhone ?? null}
              currentProfileAddress={member.profile?.profileAddress ?? null}
              currentProfileBio={member.profile?.profileBio ?? null}
              currentProfileLinkedin={member.profile?.profileLinkedin ?? null}
            />
            <div style={{ marginTop: '1rem' }}>
              <AdminMemberQuickSummary memberId={id} />
            </div>
            <div style={{ marginTop: '1rem' }}>
              <p style={{ fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-on-surface-variant, #555)', margin: '0 0 0.5rem' }}>
                Send a link to this member
              </p>
              <AdminMemberSendLinks memberId={id} />
            </div>
          </div>
        </section>

        <section style={{ padding: '1rem', background: 'var(--color-light)', borderRadius: 'var(--radius-md)' }}>
          <h2 style={{ fontSize: '1.1rem', marginBottom: '0.75rem' }}>Profile</h2>
          <p><strong>Phone:</strong> {formatPhone(member.phone ?? member.profile?.profilePhone)}</p>
          <p><strong>Address:</strong> {member.profile?.profileAddress ?? member.profile?.address ?? '—'}</p>
          <p>
            <strong>Financial aid interest:</strong>{' '}
            {member.profile?.financialAidInterest === true
              ? 'Yes'
              : member.profile?.financialAidInterest === false
                ? 'No'
                : '—'}
          </p>
          <p><strong>LinkedIn:</strong> {member.profile?.profileLinkedin ? <a href={member.profile.profileLinkedin} target="_blank" rel="noopener noreferrer">{member.profile.profileLinkedin}</a> : '—'}</p>
          <p><strong>Bio:</strong> {member.profile?.profileBio ?? '—'}</p>
          <p>
            <strong>Employment status at enrollment:</strong>{' '}
            {member.profile?.employmentStatusAtEnroll
              ? (member.profile.employmentStatusAtEnroll as string).replace(/_/g, ' ')
              : '—'}
          </p>
          {member.profile?.hasEmploymentBarrier && member.profile.barrierTypes && (member.profile.barrierTypes as string[]).length > 0 && (
            <div style={{ marginTop: '0.5rem' }}>
              <strong>Employment barriers:</strong>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem', marginTop: '0.375rem' }}>
                {(member.profile.barrierTypes as string[]).map((bt: string) => (
                  <span
                    key={bt}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      padding: '0.15rem 0.5rem',
                      borderRadius: '9999px',
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      background: 'color-mix(in srgb, #f59e0b 12%, transparent)',
                      color: '#92400e',
                      border: '1px solid color-mix(in srgb, #f59e0b 25%, transparent)',
                    }}
                  >
                    {bt.replace(/_/g, ' ')}
                  </span>
                ))}
              </div>
            </div>
          )}
        </section>

        {applicantTriage && applicantTriageDisplay && (
          <ApplicantTriageChecklist
            triage={applicantTriageDisplay}
            copy={{
              title: tAdmin('applicantTriage.title'),
              description: tAdmin('applicantTriage.description'),
              reasonsHeading: tAdmin('applicantTriage.reasonsHeading'),
              checklistHeading: tAdmin('applicantTriage.checklistHeading'),
              applicationStatusLabel: tAdmin(
                applicantTriage.applicationStatus === 'NEEDS_INFO'
                  ? 'applicantTriage.applicationNeedsInfo'
                  : 'applicantTriage.applicationPending',
              ),
            }}
          />
        )}

        {wioaSnap && (
          <AdminMemberWioaReviewPanel
            memberId={member.id}
            snapshot={wioaSnap}
            reviewStatus={(member.wioaReviewStatus as WioaReviewStatus | null) ?? null}
            reviewedAt={member.wioaReviewedAt?.toISOString() ?? null}
            reviewerName={wioaReviewerName}
            reviewNotes={member.wioaReviewNotes}
            decisionHistory={wioaDecisionHistory}
          />
        )}

        {careerPlanSignal && (
          <section style={{ padding: '1rem', background: 'var(--color-light)', borderRadius: 'var(--radius-md)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
              <h2 style={{ fontSize: '1.1rem', margin: 0 }}>Career-plan signal</h2>
              <span style={{ fontSize: '0.7rem', fontWeight: 800, padding: '0.2rem 0.55rem', borderRadius: '999px', background: 'rgba(37,99,235,0.1)', color: '#1d4ed8', textTransform: 'capitalize' }}>
                {careerPlanSignal.stage.replace(/_/g, ' ')}
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.75rem', marginBottom: '0.75rem' }}>
              <div>
                <p style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-on-surface-variant)', margin: '0 0 0.2rem' }}>Career type</p>
                <p style={{ margin: 0, fontWeight: 700 }}>{careerPlanSignal.typeLabel ?? '—'}</p>
              </div>
              <div>
                <p style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-on-surface-variant)', margin: '0 0 0.2rem' }}>Target career</p>
                <p style={{ margin: 0, fontWeight: 700 }}>{careerPlanSignal.topCareerTitle ?? '—'}</p>
              </div>
              <div>
                <p style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-on-surface-variant)', margin: '0 0 0.2rem' }}>First program</p>
                <p style={{ margin: 0, fontWeight: 700 }}>{careerPlanSignal.selectedProgramSlug ?? '—'}</p>
              </div>
              <div>
                <p style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-on-surface-variant)', margin: '0 0 0.2rem' }}>Shared</p>
                <p style={{ margin: 0, fontWeight: 700 }}>
                  {careerPlanSignal.shareCount > 0 ? `Yes · ${careerPlanSignal.shareCount}` : 'No'}
                  {careerPlanSignal.committedAt ? ` · ${careerPlanSignal.committedAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}
                </p>
              </div>
            </div>
            <div style={{ padding: '0.75rem 0.875rem', borderRadius: 8, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.22)' }}>
              <p style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-on-surface-variant)', margin: '0 0 0.2rem' }}>Next counselor action</p>
              <p style={{ margin: 0, fontWeight: 700 }}>{careerPlanSignal.staffAction}</p>
            </div>
          </section>
        )}

        {preScreening && (
          <section style={{ padding: '1rem', background: 'var(--color-light)', borderRadius: 'var(--radius-md)' }}>
            <h2 style={{ fontSize: '1.1rem', marginBottom: '0.75rem' }}>Pre-screening</h2>
            <p><strong>Employment:</strong> {preScreening.employmentStatus}</p>
            <p><strong>Primary goal:</strong> {preScreening.primaryGoal}</p>
            <p><strong>Weekly hours:</strong> {preScreening.weeklyHours}</p>
            <p><strong>Barrier:</strong> {preScreening.barrier}</p>
            <p><strong>Heard about us:</strong> {preScreening.hearAbout}{preScreening.hearAboutOther ? ` — ${preScreening.hearAboutOther}` : ''}</p>
            <p><strong>Workforce assistance:</strong> {preScreening.workforceAssistance ? 'Yes' : 'No'}</p>
            <p><strong>Submitted:</strong> {preScreening.createdAt.toLocaleString()}</p>
            <p><strong>Interview eligible:</strong> {member.interviewEligible ? 'Yes' : 'No'}</p>
            {member.interviewRequestedAt && (
              <p><strong>Interview requested:</strong> {member.interviewRequestedAt.toLocaleString()}</p>
            )}
            {member.interviewCompletedAt && (
              <p><strong>Interview completed:</strong> {member.interviewCompletedAt.toLocaleString()}</p>
            )}
          </section>
        )}

        <section style={{ padding: '1rem', background: 'var(--color-light)', borderRadius: 'var(--radius-md)' }}>
          <h2 style={{ fontSize: '1.1rem', marginBottom: '0.75rem' }}>Program</h2>
          <p><strong>Enrolled:</strong> {activeProgramSlug ? programDisplayTitle(activeProgramSlug) : '—'}</p>
          <p><strong>Enrolled date:</strong> {member.enrolledAt?.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) ?? '—'}</p>
          {program ? (
            <p>
              <strong>Course progress:</strong>{' '}
              {programReconciliation
                ? `${programReconciliation.programPercent}% overall · ${completedCount} of ${curriculumCourses.length} complete`
                : `${completedCount} of ${curriculumCourses.length} complete`}
            </p>
          ) : (
            <p><strong>Course progress:</strong> No program enrolled</p>
          )}
          
          {member.learningProgress && member.learningProgress.length > 0 && (
            <div style={{ marginTop: '1rem', background: 'var(--surface-container-low)', padding: '1rem', borderRadius: '0.5rem' }}>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '0.5rem' }}>Active Training Data (External)</h3>
              {member.learningProgress.map((lp: any) => (
                <div key={lp.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>{lp.pathwayId}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{ width: '100px', height: '6px', background: 'var(--surface-container-highest)', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ width: `${lp.progress}%`, height: '100%', background: lp.completed ? 'var(--wa-success)' : 'var(--color-accent)' }} />
                    </div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--color-on-surface-variant)' }}>{lp.progress}%</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          <ul style={{ marginTop: '1rem', paddingLeft: '1.25rem', listStyle: 'none' }}>
            {curriculumCourses.map((c) => {
              const progress = liveProgressBySlug.get(c.slug);
              const completed = progress?.status === 'COMPLETED';
              return (
                <li key={c.slug} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                  {completed ? <CheckCircle size={18} style={{ color: 'var(--wa-success-dark)', flexShrink: 0 }} /> : <span style={{ display: 'inline-block', width: 18, height: 18, border: '2px solid var(--outline-variant)', borderRadius: 4, flexShrink: 0 }} />}
                  <span style={{ flex: 1 }}>
                    {c.name}
                    {progress ? (
                      <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', color: 'var(--color-on-surface-variant)' }}>
                        {progress.percentComplete}% · {progress.status === 'COMPLETED' ? 'completed' : 'in progress'}
                      </span>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>

          {member.userCertifications && member.userCertifications.length > 0 && (
            <div style={{ marginTop: '1.5rem', background: '#fff3cd', border: '1px solid #ffeeba', padding: '1rem', borderRadius: '0.5rem' }}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.95rem', fontWeight: 600, marginBottom: '0.5rem', color: '#856404' }}>
                <AlertTriangle size={16} aria-hidden />
                Unverified External Certifications
              </h3>
              <ul style={{ margin: 0, paddingLeft: '1.25rem', color: '#856404' }}>
                {member.userCertifications.map((cert: any) => (
                  <li key={cert.id}>
                    <strong>{cert.certName}</strong> (Earned: {new Date(cert.earnedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })})
                  </li>
                ))}
              </ul>
            </div>
          )}

          <MemberDetailActions
            userId={member.id}
            memberName={member.fullName}
            enrollmentGateBlocked={enrollmentGateBlocked}
            currentProgramSlug={
              activeProgramSlug
                ? getProgramBySlug(activeProgramSlug)?.slug ?? activeProgramSlug
                : null
            }
            assessmentCompleted={member.assessmentCompleted}
            programOptions={programOptions ?? []}
          />

          <AdminMemberConsentPanel
            memberId={member.id}
            profile={{
              isMinor: Boolean(member.profile?.isMinor),
              parentGuardianName: member.profile?.parentGuardianName ?? null,
              parentGuardianEmail: member.profile?.parentGuardianEmail ?? null,
              parentGuardianPhone: member.profile?.parentGuardianPhone ?? null,
              parentalConsentGiven: Boolean(member.profile?.parentalConsentGiven),
              parentalConsentDate: member.profile?.parentalConsentDate
                ? member.profile.parentalConsentDate.toISOString()
                : null,
              schoolName: member.profile?.schoolName ?? null,
              gradeLevel: member.profile?.gradeLevel ?? null,
            }}
          />

          {/* Coursera enrollment approval — gates the "Enroll in this course"
              button on the member's training page. Each approval can lead to
              a paid Coursera seat being consumed. See
              docs/COURSERA-ENROLLMENT-FLOW.md. */}
          <MemberCourseraEnrollmentApproval
            memberId={member.id}
            memberName={member.fullName}
            initialApproved={Boolean(member.courseraEnrollmentApproved)}
            approvedAt={
              member.courseraEnrollmentApprovedAt
                ? member.courseraEnrollmentApprovedAt.toISOString()
                : null
            }
            approvedByName={null}
            consentBlocked={Boolean(member.profile?.isMinor && !member.profile?.parentalConsentGiven)}
          />
        </section>

        {/* Outcomes summary — the same all-time definitions used by
            /admin/outcomes and /admin/outcomes/board.pdf. Shows the org-level
            cohort context (placement rate, time-to-placement, recent placement
            volume) so an admin reviewing one member can see how their case
            fits the board's headline numbers. Per-member outcome detail is
            shown when a placement_records row exists. */}
        <section style={{ padding: '1rem', background: 'var(--color-light)', borderRadius: 'var(--radius-md)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
            <h2 style={{ fontSize: '1.1rem', margin: 0 }}>Outcomes summary</h2>
            <Link
              href="/admin/outcomes"
              style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-accent)', textDecoration: 'none' }}
            >
              Open full outcomes board →
            </Link>
          </div>
          <p style={{ margin: '0 0 0.75rem', fontSize: '0.8rem', color: 'var(--color-on-surface-variant)' }}>
            Cohort context for this member&apos;s organization, including exact placements over the last 90 days.
          </p>
          {outcomesSummary ? (
            <>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                  gap: '0.75rem',
                  marginBottom: placedOutcomeRow ? '1rem' : 0,
                }}
              >
                <div style={{ padding: '0.625rem 0.75rem', borderRadius: 8, background: 'var(--color-surface-variant, #f5f5f5)' }}>
                  <p style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-on-surface-variant)', margin: '0 0 0.2rem' }}>
                    Placed (last 90d)
                  </p>
                  <p style={{ fontSize: '1.35rem', fontWeight: 700, margin: 0, fontVariantNumeric: 'tabular-nums' }}>{placedLast90d}</p>
                </div>
                <div style={{ padding: '0.625rem 0.75rem', borderRadius: 8, background: 'var(--color-surface-variant, #f5f5f5)' }}>
                  <p style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-on-surface-variant)', margin: '0 0 0.2rem' }}>
                    Placement rate
                  </p>
                  <p style={{ fontSize: '1.35rem', fontWeight: 700, margin: 0, fontVariantNumeric: 'tabular-nums' }}>
                    {orgEnrolled < SMALL_SAMPLE_THRESHOLD
                      ? `N=${orgEnrolled}`
                      : `${orgPlacementRate ?? 0}%`}
                  </p>
                  <p style={{ fontSize: '0.7rem', color: 'var(--color-on-surface-variant)', margin: '0.15rem 0 0', fontVariantNumeric: 'tabular-nums' }}>
                    {orgPlaced} of {orgEnrolled} enrolled
                  </p>
                </div>
                <div style={{ padding: '0.625rem 0.75rem', borderRadius: 8, background: 'var(--color-surface-variant, #f5f5f5)' }}>
                  <p style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-on-surface-variant)', margin: '0 0 0.2rem' }}>
                    Avg time to placement
                  </p>
                  <p style={{ fontSize: '1.35rem', fontWeight: 700, margin: 0, fontVariantNumeric: 'tabular-nums' }}>
                    {orgAvgDaysToPlacement === null ? '—' : `${orgAvgDaysToPlacement} d`}
                  </p>
                </div>
              </div>
              {placedOutcomeRow ? (
                <div
                  style={{
                    padding: '0.75rem 0.875rem',
                    borderRadius: 8,
                    background: 'rgba(46, 125, 50, 0.08)',
                    border: '1px solid rgba(46, 125, 50, 0.2)',
                  }}
                >
                  <p style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-on-surface-variant)', margin: '0 0 0.35rem' }}>
                    This member&apos;s placement
                  </p>
                  <p style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600 }}>
                    {placedOutcomeRow.jobTitle} · {placedOutcomeRow.employerName}
                  </p>
                  <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: 'var(--color-on-surface-variant)' }}>
                    Placed{' '}
                    {placedOutcomeRow.placedAt instanceof Date
                      ? placedOutcomeRow.placedAt.toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })
                      : new Date(placedOutcomeRow.placedAt).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                    {placedOutcomeRow.salaryOffered
                      ? ` · $${placedOutcomeRow.salaryOffered.toLocaleString('en-US')}/yr at placement`
                      : ''}
                  </p>
                </div>
              ) : null}
            </>
          ) : (
            <p style={{ fontSize: '0.875rem', color: 'var(--color-on-surface-variant)', margin: 0 }}>
              Outcomes snapshot is unavailable right now.
            </p>
          )}
        </section>

        <section style={{ padding: '1rem', background: 'var(--color-light)', borderRadius: 'var(--radius-md)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
            <h2 style={{ fontSize: '1.1rem', margin: 0 }}>Coursera training</h2>
            <Link
              href={`/admin/coursera/learners/${member.id}`}
              style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-accent)', textDecoration: 'none' }}
            >
              Open full Coursera detail →
            </Link>
          </div>
          {courseraDetail && (courseraCourseCount > 0 || courseraBadgeCount > 0) ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem', marginBottom: '0.75rem' }}>
                <div>
                  <p style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-on-surface-variant)', margin: '0 0 0.2rem' }}>Courses</p>
                  <p style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0, fontVariantNumeric: 'tabular-nums' }}>
                    {courseraCompletedCount}/{courseraCourseCount} <span style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--color-on-surface-variant)' }}>complete</span>
                  </p>
                </div>
                <div>
                  <p style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-on-surface-variant)', margin: '0 0 0.2rem' }}>Specializations</p>
                  <p style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0, fontVariantNumeric: 'tabular-nums' }}>
                    {courseraCompletedBadgeCount}/{courseraBadgeCount} <span style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--color-on-surface-variant)' }}>earned</span>
                  </p>
                </div>
                <div>
                  <p style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-on-surface-variant)', margin: '0 0 0.2rem' }}>Last activity</p>
                  <p style={{ fontSize: '0.95rem', fontWeight: 600, margin: 0 }}>
                    {courseraLastActivity ? courseraLastActivity.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                  </p>
                </div>
              </div>
              {courseraCourseCount > 0 ? (
                <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none', display: 'grid', gap: '0.35rem' }}>
                  {courseraDetail.courses.slice(0, 5).map((c) => (
                    <li key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.85rem' }}>
                      {c.isCompleted ? (
                        <CheckCircle size={16} style={{ color: 'var(--wa-success-dark)', flexShrink: 0 }} />
                      ) : (
                        <span style={{ display: 'inline-block', width: 16, height: 16, border: '2px solid var(--outline-variant)', borderRadius: 4, flexShrink: 0 }} />
                      )}
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.courseName}</span>
                      <span style={{ fontSize: '0.8rem', color: 'var(--color-on-surface-variant)', flexShrink: 0 }}>
                        {Number(c.overallProgress).toFixed(0)}%
                      </span>
                    </li>
                  ))}
                  {courseraCourseCount > 5 ? (
                    <li style={{ fontSize: '0.8rem', color: 'var(--color-on-surface-variant)', paddingLeft: '1.6rem' }}>
                      + {courseraCourseCount - 5} more — see full detail
                    </li>
                  ) : null}
                </ul>
              ) : null}
            </>
          ) : (
            <p style={{ fontSize: '0.875rem', color: 'var(--color-on-surface-variant)', margin: 0 }}>
              No Coursera activity recorded yet. Data populates from the B4B sync (every 6h),
              xAPI webhook, or manual CSV import on{' '}
              <Link href="/admin/coursera/csv-import" style={{ color: 'var(--color-accent)' }}>
                /admin/coursera/csv-import
              </Link>.
            </p>
          )}
          <MemberCourseraDiagnoseButton memberId={member.id} />
        </section>

        <AdminMemberSkillCheckpointPanel memberId={member.id} summary={skillMissionSummary} />

        <MemberPartnerSection
          memberId={member.id}
          partners={partners}
          currentPartnerId={partnerReferral?.partnerId ?? null}
        />

        <MemberSubgroupSection
          memberId={member.id}
          subgroups={subgroups}
          currentSubgroupIds={memberSubgroups.map((ms: any) => ms.subgroupId)}
        />

        <AdminMemberAiMatches memberId={member.id} matches={member.aiJobMatches} />

        <section style={{ padding: '1rem', background: 'var(--color-light)', borderRadius: 'var(--radius-md)' }}>
          <h2 style={{ fontSize: '1.1rem', marginBottom: '0.75rem' }}>Counselor assignment</h2>
          {activeCounselorAssign?.counselor ? (
            <p style={{ marginBottom: '0.75rem', fontSize: '0.95rem' }}>
              Current: <strong>{activeCounselorAssign.counselor.user.fullName}</strong>
            </p>
          ) : (
            <p style={{ marginBottom: '0.75rem', fontSize: '0.95rem', color: 'var(--color-on-surface-variant)' }}>
              No active counselor assignment.
            </p>
          )}
          <AdminMemberCounselorAssign
            memberId={member.id}
            counselors={counselorRows.map((c: any) => ({
              userId: c.userId,
              fullName: c.user.fullName,
              partnerName: c.partner?.name ?? 'WorkforceAP',
            }))}
            currentCounselorUserId={activeCounselorAssign?.counselor.userId ?? null}
          />
        </section>

        <section id="placed-outcome" style={{ padding: '1rem', background: 'var(--color-light)', borderRadius: 'var(--radius-md)' }}>
          <h2 className="portal-section-heading">Placement record</h2>
          {pendingPlacementEvents && pendingPlacementEvents.length > 0 && !placedOutcomeRow && (
            <div
              style={{
                marginBottom: '1rem',
                padding: '0.875rem 1rem',
                background: 'rgba(255,193,7,0.08)',
                border: '1px solid rgba(255,193,7,0.2)',
                borderRadius: '0.75rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.5rem' }}>
                <span className="material-symbols-outlined" style={{ color: 'var(--color-warning)' }}>pending</span>
                <span style={{ fontWeight: 700, fontSize: '0.9375rem', color: 'var(--color-on-surface)' }}>Pending member-reported placement</span>
              </div>
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--color-on-surface-variant)', lineHeight: 1.55 }}>
                This member self-reported accepting a job offer on{' '}
                {new Date(pendingPlacementEvents[0].createdAt).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
                . Review and verify to create an official placement record.
              </p>
            </div>
          )}
          <AdminMemberPlacedOutcomeForm
            memberId={member.id}
            initial={
              placedOutcomeRow
                ? {
                    employerName: placedOutcomeRow.employerName,
                    jobTitle: placedOutcomeRow.jobTitle,
                    startingSalary: placedOutcomeRow.salaryOffered,
                    placedAt: placedOutcomeRow.placedAt.toISOString(),
                    programSlug: (placedOutcomeRow as { programSlug?: string | null }).programSlug ?? null,
                    notes: placedOutcomeRow.notes,
                    wageAtFollowUp: (placedOutcomeRow as { wageAtFollowUp?: number | null }).wageAtFollowUp ?? null,
                    retentionStatus: (placedOutcomeRow as { retentionStatus?: string | null }).retentionStatus ?? null,
                    startDateVerified: (placedOutcomeRow as { startDateVerified?: boolean }).startDateVerified ?? false,
                    fundingSource: (placedOutcomeRow as { fundingSource?: string | null }).fundingSource ?? null,
                    grantReportingNotes: (placedOutcomeRow as { grantReportingNotes?: string | null }).grantReportingNotes ?? null,
                    retentionDecision: (placedOutcomeRow as { retentionDecision?: string | null }).retentionDecision ?? null,
                  }
                : null
            }
            pastOnboardingWindow={
              !!(placedOutcomeRow as { onboardingWindowEnd?: Date | null } | null)?.onboardingWindowEnd &&
              (placedOutcomeRow as { onboardingWindowEnd?: Date | null }).onboardingWindowEnd! <= new Date()
            }
          />
        </section>

        <section style={{ padding: '1rem', background: 'var(--color-light)', borderRadius: 'var(--radius-md)' }}>
          <h2 style={{ fontSize: '1.1rem', marginBottom: '0.75rem' }}>Workspace email</h2>
          <AdminMemberWorkspaceEmail
            memberId={member.id}
            workspaceEmail={member.workspaceEmail ?? null}
            workspaceEmailProvisioned={!!member.workspaceEmailProvisioned}
            providerAvailable={workspaceEmailAvailability.available}
            providerHint={workspaceEmailAvailability.reason}
          />
        </section>

        <section style={{ padding: '1rem', background: 'var(--color-light)', borderRadius: 'var(--radius-md)' }}>
          <h2 style={{ fontSize: '1.1rem', marginBottom: '0.75rem' }}>Enrollment funding &amp; workspace</h2>
          {!courseEnrollment && (
            <p style={{ fontSize: '0.9rem', color: 'var(--color-on-surface-variant)', marginBottom: '0.75rem' }}>
              Member is not currently enrolled in a program. Enrollment must be created first.
            </p>
          )}
          <AdminMemberEnrollmentFundingForm
            memberId={member.id}
            hasPrimaryEnrollment={Boolean(courseEnrollment)}
            initial={
              courseEnrollment
                ? {
                    fundingSource: courseEnrollment.fundingSource,
                    fundingNotes: courseEnrollment.fundingNotes,
                    workspaceEmail: courseEnrollment.workspaceEmail ?? member.workspaceEmail ?? null,
                    workspaceEmailProvisioned:
                      courseEnrollment.workspaceEmailProvisioned || member.workspaceEmailProvisioned,
                  }
                : {
                    fundingSource: null,
                    fundingNotes: null,
                    workspaceEmail: member.workspaceEmail ?? null,
                    workspaceEmailProvisioned: member.workspaceEmailProvisioned,
                  }
            }
          />
        </section>

        <section style={{ padding: '1rem', background: 'var(--color-light)', borderRadius: 'var(--radius-md)' }}>
          {readOnlyAudit && <span hidden data-portal-audit-suppressed="admin-member-message-thread-create-read-receipt-and-realtime" />}
          {readOnlyAudit && counselorChatInitial ? (
            <p style={{ margin: 0 }}>Counselor conversation is available. Live sync and read receipts are paused for this audit.</p>
          ) : counselorChatInitial ? (
            <AdminMemberCounselorChatClient initial={counselorChatInitial} messagingSurface="admin" />
          ) : (
            <p style={{ margin: 0 }}>No counselor conversation has started yet.</p>
          )}
        </section>

        <section style={{ padding: '1rem', background: 'var(--color-light)', borderRadius: 'var(--radius-md)' }}>
          <h2 style={{ fontSize: '1.1rem', marginBottom: '0.75rem' }}>Resumes</h2>
          <AdminMemberResumeSection memberId={member.id} />
        </section>

        {member.assessmentCompleted && (
          <AssessmentAnswersReadonly
            rows={buildAssessmentReviewRows(assessmentAnswers)}
            score={member.assessmentScore}
            scorePct={member.assessmentScorePct}
            completedAt={member.assessmentCompletedAt}
            programInterest={member.programInterest}
          />
        )}
      </div>
    </div>
  );
}
