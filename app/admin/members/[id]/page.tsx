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
import AdminMemberNotesPanel from './AdminMemberNotesPanel';
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
import { findLearningPathById } from '@/lib/content/coursera/learningPaths';
import {
  summarizeUnassignedTrainingEvidence,
  type AdminCourseProgressRow,
  type AdminMemberProgramProgressRow,
  type UnassignedTrainingEvidence,
} from './unassignedTrainingEvidence';
import { loadLearnerProgressByUserId } from '@/lib/coursera/progressQueries';
import {
  formatLearningPathLine,
  formatProgramCoursesNote,
  learningPathPercent,
  summarizeProgramCourseProgress,
} from '@/lib/coursera/progressTileSummary';
import { SMALL_SAMPLE_THRESHOLD } from '@/lib/admin/boardOutcomes';
import { getMemberOutcomesSummary } from '@/lib/admin/memberOutcomesSummary';
import MemberCourseraDiagnoseButton from '@/components/admin/MemberCourseraDiagnoseButton';
import AdminMemberSkillCheckpointPanel from '@/components/admin/AdminMemberSkillCheckpointPanel';
import { loadSkillMissionSummary } from '@/lib/member/skillMissions';
import { deriveCareerPlanSignal } from '@/lib/admin/careerPlanSignal';
import { getProgramCoursesForCurriculumVersion } from '@/lib/member/curriculumAssignment';
import { reconcileProgramProgress } from '@/lib/coursera/progressReconciliation';
import { eventNameReadCandidates } from '@/lib/events/names';
import { KitEmptyState, StatusTag, TabPanel, Tabs, type KitTone } from '@/components/portal/kit';
import { buildMemberActivityRows, MEMBER_ACTIVITY_CAP } from '@/lib/admin/memberActivity';
import {
  ADMIN_MEMBER_DETAIL_TABS,
  ADMIN_MEMBER_DETAIL_TABS_ID_BASE,
  ADMIN_MEMBER_DETAIL_TAB_PARAM,
  parseAdminMemberDetailTab,
} from './memberDetailTabs';
import styles from './memberDetail.module.css';

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
  searchParams,
}: {
  params: Promise<{ id: string }>;
  /** `?tab=overview|program|eligibility|placement|messages|notes|activity` picks the opening record tab (default Overview). */
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const workspaceEmailAvailability = getWorkspaceEmailAvailability();
  const query = searchParams ? await searchParams : {};
  const initialTab = parseAdminMemberDetailTab(query[ADMIN_MEMBER_DETAIL_TAB_PARAM]);
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
        // The Program tab's "Enrolled date" describes the enrollment shown
        // beside it, which comes from this row. User.enrolledAt is the older
        // single-program pointer and is null for members enrolled through
        // CourseEnrollment only, which printed "—" next to a real program.
        enrolledAt: true,
        enrolledByAdminId: true,
        fundingSource: true,
        fundingNotes: true,
        workspaceEmail: true,
        workspaceEmailProvisioned: true,
      },
    }).catch(() => null),
    db.memberEvent.findMany({
      where: { userId: id, eventName: { in: eventNameReadCandidates('placement_confirmation_submitted') } },
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
    )
    // A row whose Coursera id is a Learning Path is Coursera's program-level
    // percentage that a stale mapping once promoted onto a synthetic course
    // slot. It is not course progress; the sync no longer writes it and the
    // rows already written are excluded here until they are removed.
    .filter((row) => !findLearningPathById(row.courseId));
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

  // Members with real training but no enrollment pointer.
  //
  // `activeProgramSlug` is null when there is no CourseEnrollment row and
  // User.enrolledProgram is null; every filter above then drops every
  // course-progress row and the page printed "No program enrolled" and
  // "Course progress: —" beside genuine completions (10 of 17 users with
  // course_progress rows are in this state — e.g. it-support 2 of 3 done,
  // ai-practitioner 2 done, cyber 67%).
  //
  // The evidence is surfaced, not converted into an assignment.
  // `memberProgramProgress[0]` is not a safe fallback (the relation has no
  // orderBy and 7 of the 10 carry a 0% legacy comptia rollup that is
  // rewritten nightly), and back-filling course_enrollments would invent an
  // enrollment intake never made. Only rows that actually show activity
  // count, and the strongest one is labelled as unassigned activity.
  const unassignedTrainingEvidence = activeProgramSlug
    ? null
    : summarizeUnassignedTrainingEvidence(
        (member.memberProgramProgress ?? []) as AdminMemberProgramProgressRow[],
        (member.courseProgress ?? []) as AdminCourseProgressRow[],
      );

  const formatUnassignedTrainingEvidence = (evidence: UnassignedTrainingEvidence): string => {
    const parts = [
      evidence.coursesCompleted > 0
        ? `${evidence.coursesCompleted} course${evidence.coursesCompleted === 1 ? '' : 's'} complete`
        : null,
      evidence.averagePercent > 0 ? `${evidence.averagePercent}% avg` : null,
    ].filter(Boolean);
    return `${programDisplayTitle(evidence.programSlug)}${parts.length > 0 ? ` · ${parts.join(' · ')}` : ''}`;
  };

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
  // Coursera's Learning Path row is program-level progress, never a course:
  // it is shown on its own line, labelled as Coursera's figure, on both tiles.
  const courseraPathPercent = learningPathPercent(courseraDetail?.learningPaths);
  const programCourseSummary = summarizeProgramCourseProgress({
    courses: curriculumCourses,
    reconciliation: programReconciliation,
  });
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

  // Overview chips: derived from data already loaded above (no extra query).
  const initials = (member.fullName ?? member.email ?? '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part: string) => part[0]?.toUpperCase() ?? '')
    .join('') || '?';
  const latestApplication = (member.applications ?? [])[0] ?? null;
  const applicationTone: KitTone = (() => {
    const status = String(latestApplication?.status ?? '');
    if (status === 'APPROVED' || status === 'ENROLLED' || status === 'ACCEPTED') return 'ok';
    if (status === 'REJECTED' || status === 'WITHDRAWN' || status === 'DECLINED') return 'danger';
    if (status === 'PENDING' || status === 'NEEDS_INFO') return 'warn';
    return 'muted';
  })();
  const wioaTone: KitTone = (() => {
    const status = String(member.wioaReviewStatus ?? '');
    if (!status) return 'muted';
    if (status === 'REJECTED' || status === 'DENIED' || status === 'NOT_ELIGIBLE') return 'danger';
    return gate.ok ? 'ok' : 'warn';
  })();

  // Activity tab: staff actions on this record (AuditLog, indexed on
  // [targetType, targetId]) + the member's own events, both capped. Either
  // read failing degrades to an empty list, never a broken page.
  const [activityAuditRows, activityEventRows] = await Promise.all([
    withAdminPageScope(scope, (db) => db.auditLog.findMany({
      where: { targetId: member.id, targetType: { in: ['User', 'user'] } },
      orderBy: { createdAt: 'desc' },
      take: MEMBER_ACTIVITY_CAP,
      select: {
        id: true,
        action: true,
        createdAt: true,
        actorEmailSnapshot: true,
        actorRoleSnapshot: true,
        actor: { select: { fullName: true } },
      },
    })).catch((error: unknown) => {
      console.error('[admin/member-detail] activity audit load failed', error);
      return [];
    }),
    withAdminPageScope(scope, (db) => db.memberEvent.findMany({
      where: { userId: member.id },
      orderBy: { createdAt: 'desc' },
      take: MEMBER_ACTIVITY_CAP,
      select: { id: true, eventName: true, createdAt: true },
    })).catch((error: unknown) => {
      console.error('[admin/member-detail] activity events load failed', error);
      return [];
    }),
  ]);
  const activityRows = buildMemberActivityRows({
    auditRows: activityAuditRows.map((row) => ({
      id: row.id,
      action: row.action,
      createdAt: row.createdAt,
      actorName: row.actor?.fullName ?? null,
      actorEmailSnapshot: row.actorEmailSnapshot,
      actorRoleSnapshot: row.actorRoleSnapshot,
    })),
    eventRows: activityEventRows,
    limit: MEMBER_ACTIVITY_CAP,
  });

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
          <div className={styles.headerActions}>
            <Link href={`/admin/members/${id}/stakeholder`} className={`btn btn-outline ${styles.headerAction} ${styles.headerActionWide}`}>Open stakeholder view</Link>
            <Link href={`/admin/members/${id}/lifecycle`} className={`btn btn-outline ${styles.headerAction}`}>
              <span className={`material-symbols-outlined ${styles.actionIcon}`} aria-hidden="true">timeline</span>
              Lifecycle
            </Link>
            <Link href={`/admin/members/${id}/readiness`} className={`btn btn-outline ${styles.headerAction}`}>
              <ClipboardList size={18} style={{ marginRight: '0.35rem', verticalAlign: 'middle' }} />
              Readiness
            </Link>
            <Link href={`/admin/members/${id}/billing`} className={`btn btn-outline ${styles.headerAction} ${styles.headerActionWide}`}>J5 / J6 billing</Link>
            <Link href="/admin/members" className={`btn btn-outline ${styles.headerAction} ${styles.headerActionWide}`}>Back to Members</Link>
          </div>
        }
      />

      {/* ── Member journey progress strip ── */}
      <div className={styles.strip}>
        <MemberProgressStrip {...adminProgressStripProps} />
      </div>

      {/* ── Record tabs ─────────────────────────────────────────
          Admin audit gap map (wave 16): the ~20 record sections are grouped
          under Overview / Program / Eligibility / Placement / Messages /
          Notes / Activity. Every panel is server-rendered here (no second
          fetch); the kit Tabs island only toggles `hidden`. `?tab=` picks the
          opening tab; the `#placed-outcome` deep link opens Placement on load.
          Every existing panel, server action and route call is preserved —
          only the grouping and the styling changed. */}
      <Tabs
        items={ADMIN_MEMBER_DETAIL_TABS}
        defaultValue={initialTab}
        label="Member record"
        idBase={ADMIN_MEMBER_DETAIL_TABS_ID_BASE}
        urlParam={ADMIN_MEMBER_DETAIL_TAB_PARAM}
        className={styles.tabs}
      >
        {/* ── Overview ─────────────────────────────────────────── */}
        <TabPanel value="overview">
          <div className={styles.stack}>
            <section className="wa-kit-card" aria-label="Member identity">
              <div className={styles.identity}>
                <div className={styles.avatar} aria-hidden="true">{initials}</div>
                <div className={styles.identityCopy}>
                  <p title={member.fullName ?? undefined} className={`wa-truncate ${styles.identityName}`}>
                    {member.fullName}
                  </p>
                  <p className={styles.identityMeta}>
                    {member.email}
                    {member.phone || member.profile?.profilePhone ? ` · ${formatPhone(member.phone ?? member.profile?.profilePhone)}` : ''}
                  </p>
                </div>
              </div>
              <div className={styles.chips}>
                <StatusTag tone={activeProgramSlug ? 'ok' : unassignedTrainingEvidence ? 'warn' : 'muted'}>
                  {activeProgramSlug
                    ? `Enrolled · ${programDisplayTitle(activeProgramSlug)}`
                    : unassignedTrainingEvidence
                      ? 'Training activity · no enrollment on file'
                      : 'No program enrolled'}
                </StatusTag>
                <StatusTag tone={wioaTone}>
                  {member.wioaReviewStatus ? `WIOA · ${String(member.wioaReviewStatus).replace(/_/g, ' ').toLowerCase()}` : 'WIOA · not reviewed'}
                </StatusTag>
                <StatusTag tone={latestApplication ? applicationTone : 'muted'}>
                  {latestApplication ? `Application · ${String(latestApplication.status).replace(/_/g, ' ').toLowerCase()}` : 'No application on file'}
                </StatusTag>
                <StatusTag tone={activeCounselorAssign?.counselor ? 'info' : 'warn'}>
                  {activeCounselorAssign?.counselor ? `Counselor · ${activeCounselorAssign.counselor.user.fullName}` : 'No counselor assigned'}
                </StatusTag>
              </div>
              <div className={`${styles.statGrid} ${styles.spaced}`}>
                <div className={styles.stat} data-progress-tile="program">
                  <p className={styles.statLabel}>Program courses</p>
                  <p className={styles.statValue}>
                    {program ? `${programCourseSummary.completed} of ${programCourseSummary.total}` : '—'}
                  </p>
                  <p className={styles.statNote}>
                    {program
                      ? `complete · ${formatProgramCoursesNote(programCourseSummary)}`
                      : unassignedTrainingEvidence
                        ? 'No enrollment on file — training activity below'
                        : 'No program enrolled'}
                  </p>
                  {!program && unassignedTrainingEvidence ? (
                    <p className={styles.statNote} data-progress-source="unassigned-training-activity">
                      {formatUnassignedTrainingEvidence(unassignedTrainingEvidence)}
                    </p>
                  ) : null}
                  {program ? (
                    <p className={styles.statNote} data-progress-source="coursera-learning-path">
                      {formatLearningPathLine(courseraPathPercent)}
                    </p>
                  ) : null}
                </div>
                <div className={styles.stat} data-progress-tile="coursera">
                  <p className={styles.statLabel}>Coursera courses</p>
                  <p className={styles.statValue}>{courseraCompletedCount} of {courseraCourseCount}</p>
                  <p className={styles.statNote}>enrolled courses complete</p>
                  <p className={styles.statNote} data-progress-source="coursera-learning-path">
                    {courseraPathPercent == null
                      ? 'Learning path: not reported'
                      : `Learning path: ${courseraPathPercent}% (Coursera's figure)`}
                  </p>
                </div>
                <div className={styles.stat}>
                  <p className={styles.statLabel}>Assessment</p>
                  <p className={styles.statValue}>{member.assessmentScorePct != null ? `${member.assessmentScorePct}%` : '—'}</p>
                  <p className={styles.statNote}>{member.assessmentCompleted ? 'completed' : 'not completed'}</p>
                </div>
                <div className={styles.stat}>
                  <p className={styles.statLabel}>Messages</p>
                  <p className={styles.statValue}>{chatMessageTotal}</p>
                  <p className={styles.statNote}>in counselor thread</p>
                </div>
              </div>
            </section>

            {/* Admin DB actions — password reset, profile edit */}
            <section className="wa-kit-card" aria-labelledby="admin-member-actions-title">
              <div className={styles.sectionHead}>
                <h2 id="admin-member-actions-title" className={styles.sectionTitle}>Admin Actions</h2>
                <StatusTag tone="alert">Super admin</StatusTag>
              </div>
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
              <div className={styles.spaced}>
                <AdminMemberQuickSummary memberId={id} />
              </div>
              <div className={styles.spaced}>
                <p className={styles.eyebrow}>Send a link to this member</p>
                <AdminMemberSendLinks memberId={id} />
              </div>
            </section>

            <section className="wa-kit-card" aria-labelledby="admin-member-profile-title">
              <h2 id="admin-member-profile-title" className={styles.sectionTitle}>Profile</h2>
              <div className={styles.facts}>
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
              </div>
              {member.profile?.hasEmploymentBarrier && member.profile.barrierTypes && (member.profile.barrierTypes as string[]).length > 0 && (
                <div className={styles.spaced}>
                  <p className={styles.eyebrow}>Employment barriers</p>
                  <div className={styles.chips} style={{ marginTop: 0 }}>
                    {(member.profile.barrierTypes as string[]).map((bt: string) => (
                      <StatusTag key={bt} tone="warn">{bt.replace(/_/g, ' ')}</StatusTag>
                    ))}
                  </div>
                </div>
              )}
            </section>

            <section className="wa-kit-card" aria-labelledby="admin-member-counselor-title">
              <h2 id="admin-member-counselor-title" className={styles.sectionTitle}>Counselor assignment</h2>
              {activeCounselorAssign?.counselor ? (
                <p className={styles.lede} style={{ color: 'var(--wa-text)' }}>
                  Current: <strong>{activeCounselorAssign.counselor.user.fullName}</strong>
                </p>
              ) : (
                <p className={styles.lede}>
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

            {careerPlanSignal && (
              <section className="wa-kit-card" aria-labelledby="admin-member-career-plan-title">
                <div className={styles.sectionHead}>
                  <h2 id="admin-member-career-plan-title" className={styles.sectionTitle}>Career-plan signal</h2>
                  <StatusTag tone="info" style={{ textTransform: 'capitalize' }}>
                    {careerPlanSignal.stage.replace(/_/g, ' ')}
                  </StatusTag>
                </div>
                <div className={styles.statGrid} style={{ marginBottom: '0.75rem' }}>
                  <div className={styles.stat}>
                    <p className={styles.statLabel}>Career type</p>
                    <p className={styles.statText}>{careerPlanSignal.typeLabel ?? '—'}</p>
                  </div>
                  <div className={styles.stat}>
                    <p className={styles.statLabel}>Target career</p>
                    <p className={styles.statText}>{careerPlanSignal.topCareerTitle ?? '—'}</p>
                  </div>
                  <div className={styles.stat}>
                    <p className={styles.statLabel}>First program</p>
                    <p className={styles.statText}>{careerPlanSignal.selectedProgramSlug ?? '—'}</p>
                  </div>
                  <div className={styles.stat}>
                    <p className={styles.statLabel}>Shared</p>
                    <p className={styles.statText}>
                      {careerPlanSignal.shareCount > 0 ? `Yes · ${careerPlanSignal.shareCount}` : 'No'}
                      {careerPlanSignal.committedAt ? ` · ${careerPlanSignal.committedAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}
                    </p>
                  </div>
                </div>
                <div className={`${styles.callout} wa-kit-tone--warn`}>
                  <p className={styles.statLabel}>Next counselor action</p>
                  <p className={styles.statText}>{careerPlanSignal.staffAction}</p>
                </div>
              </section>
            )}

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

            <section className="wa-kit-card" aria-labelledby="admin-member-workspace-email-title">
              <h2 id="admin-member-workspace-email-title" className={styles.sectionTitle}>Workspace email</h2>
              <AdminMemberWorkspaceEmail
                memberId={member.id}
                workspaceEmail={member.workspaceEmail ?? null}
                workspaceEmailProvisioned={!!member.workspaceEmailProvisioned}
                providerAvailable={workspaceEmailAvailability.available}
                providerHint={workspaceEmailAvailability.reason}
              />
            </section>
          </div>
        </TabPanel>

        {/* ── Program ──────────────────────────────────────────
            Both progress feeds ("Program" from the local course-progress
            rows, "Coursera training" from the B4B / xAPI learner detail)
            are kept side by side with their source labelled; which one is
            authoritative is a product decision, not a layout one. */}
        <TabPanel value="program">
          <div className={styles.stack}>
            <section className="wa-kit-card" aria-labelledby="admin-member-program-title">
              <h2 id="admin-member-program-title" className={styles.sectionTitle}>Program</h2>
              <p className={styles.lede} data-progress-source="course-progress">
                Source: WorkforceAP course-progress rows for the assigned curriculum (progress feed 1 of 2).
              </p>
              <div className={styles.facts}>
                <p>
                  <strong>Enrolled:</strong>{' '}
                  {activeProgramSlug
                    ? programDisplayTitle(activeProgramSlug)
                    : unassignedTrainingEvidence
                      ? '— (no enrollment on file)'
                      : '—'}
                </p>
                <p><strong>Enrolled date:</strong> {(courseEnrollment?.enrolledAt ?? member.enrolledAt)?.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) ?? '—'}</p>
                {program ? (
                  <p>
                    <strong>Course progress:</strong>{' '}
                    {programReconciliation
                      ? `${programReconciliation.programPercent}% overall · ${completedCount} of ${curriculumCourses.length} complete`
                      : `${completedCount} of ${curriculumCourses.length} complete`}
                  </p>
                ) : unassignedTrainingEvidence ? (
                  <p data-progress-source="unassigned-training-activity">
                    <strong>Course progress:</strong>{' '}
                    {`Training activity with no enrollment on file — ${formatUnassignedTrainingEvidence(unassignedTrainingEvidence)}`}
                  </p>
                ) : (
                  <p><strong>Course progress:</strong> No program enrolled</p>
                )}
              </div>

              {member.learningProgress && member.learningProgress.length > 0 && (
                <div className={styles.externalBlock}>
                  <h3 className={styles.subTitle}>Active Training Data (External)</h3>
                  {member.learningProgress.map((lp: any) => (
                    <div key={lp.id} className={styles.externalRow}>
                      <span className={styles.externalName}>{lp.pathwayId}</span>
                      <div className={styles.externalBar}>
                        <div className={styles.track}>
                          <div className={`${styles.fill} ${lp.completed ? styles.fillDone : ''}`} style={{ width: `${lp.progress}%` }} />
                        </div>
                        <span className={styles.pct}>{lp.progress}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <ul className={styles.courseList}>
                {curriculumCourses.map((c) => {
                  const progress = liveProgressBySlug.get(c.slug);
                  const completed = progress?.status === 'COMPLETED';
                  return (
                    <li key={c.slug} className={styles.courseRow}>
                      {completed ? <CheckCircle size={18} className={styles.courseCheck} /> : <span className={styles.courseBox} />}
                      <span style={{ flex: 1, minWidth: 0 }}>
                        {c.name}
                        {progress ? (
                          <span className={styles.courseMeta} style={{ marginLeft: '0.5rem' }}>
                            {progress.percentComplete}% · {progress.status === 'COMPLETED' ? 'completed' : 'in progress'}
                          </span>
                        ) : null}
                      </span>
                    </li>
                  );
                })}
              </ul>

              {member.userCertifications && member.userCertifications.length > 0 && (
                <div className={`${styles.callout} ${styles.spaced} wa-kit-tone--warn`}>
                  <h3 className={styles.calloutTitle}>
                    <AlertTriangle size={16} aria-hidden />
                    Unverified External Certifications
                  </h3>
                  <ul className={styles.calloutList}>
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
            </section>

            <section className="wa-kit-card" aria-labelledby="admin-member-coursera-title">
              <div className={styles.sectionHead}>
                <h2 id="admin-member-coursera-title" className={styles.sectionTitle}>Coursera training</h2>
                <Link href={`/admin/coursera/learners/${member.id}`} className={styles.inlineLink}>
                  Open full Coursera detail →
                </Link>
              </div>
              <p className={styles.lede} data-progress-source="coursera-learner-detail">
                Source: Coursera B4B enrollment report, xAPI webhook and CSV import (progress feed 2 of 2).
              </p>
              {courseraDetail && (courseraCourseCount > 0 || courseraBadgeCount > 0) ? (
                <>
                  <div className={styles.statGrid} style={{ marginBottom: '0.75rem' }}>
                    <div className={styles.stat}>
                      <p className={styles.statLabel}>Courses</p>
                      <p className={`${styles.statValue} ${styles.statValueSm}`}>
                        {courseraCompletedCount} of {courseraCourseCount} <span className={styles.statNote} style={{ display: 'inline' }}>enrolled complete</span>
                      </p>
                      <p className={styles.statNote} data-progress-source="coursera-learning-path">
                        {courseraPathPercent == null
                          ? 'Learning path: not reported'
                          : `Learning path: ${courseraPathPercent}% (Coursera's figure)`}
                      </p>
                    </div>
                    <div className={styles.stat}>
                      <p className={styles.statLabel}>Specializations</p>
                      <p className={`${styles.statValue} ${styles.statValueSm}`}>
                        {courseraCompletedBadgeCount}/{courseraBadgeCount} <span className={styles.statNote} style={{ display: 'inline' }}>earned</span>
                      </p>
                    </div>
                    <div className={styles.stat}>
                      <p className={styles.statLabel}>Last activity</p>
                      <p className={styles.statText}>
                        {courseraLastActivity ? courseraLastActivity.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                      </p>
                    </div>
                  </div>
                  {courseraCourseCount > 0 ? (
                    <ul className={styles.courseList} style={{ marginTop: 0 }}>
                      {courseraDetail.courses.slice(0, 5).map((c) => (
                        <li key={c.id} className={styles.courseRow}>
                          {c.isCompleted ? (
                            <CheckCircle size={16} className={styles.courseCheck} />
                          ) : (
                            <span className={styles.courseBox} style={{ width: 16, height: 16 }} />
                          )}
                          <span className={styles.courseName}>{c.courseName}</span>
                          <span className={styles.courseMeta}>
                            {Number(c.overallProgress).toFixed(0)}%
                          </span>
                        </li>
                      ))}
                      {courseraCourseCount > 5 ? (
                        <li className={styles.courseMore}>
                          + {courseraCourseCount - 5} more — see full detail
                        </li>
                      ) : null}
                    </ul>
                  ) : null}
                </>
              ) : (
                <p className={styles.emptyCopy}>
                  No Coursera activity recorded yet. Data populates from the B4B sync (every 6h),
                  xAPI webhook, or manual CSV import on{' '}
                  <Link href="/admin/coursera/csv-import" className={styles.inlineLink}>
                    /admin/coursera/csv-import
                  </Link>.
                </p>
              )}
              <MemberCourseraDiagnoseButton memberId={member.id} />
            </section>

            <AdminMemberSkillCheckpointPanel memberId={member.id} summary={skillMissionSummary} />

            <section className="wa-kit-card" aria-labelledby="admin-member-funding-title">
              <h2 id="admin-member-funding-title" className={styles.sectionTitle}>Enrollment funding &amp; workspace</h2>
              {!courseEnrollment && (
                <p className={styles.lede}>
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

          </div>
        </TabPanel>

        {/* ── Placement ────────────────────────────────────────── */}
        <TabPanel value="placement">
          <div className={styles.stack}>
            {/* Outcomes summary — the same all-time definitions used by
                /admin/outcomes and /admin/outcomes/board.pdf. Shows the org-level
                cohort context (placement rate, time-to-placement, recent placement
                volume) so an admin reviewing one member can see how their case
                fits the board's headline numbers. Per-member outcome detail is
                shown when a placement_records row exists. */}
            <section className="wa-kit-card" aria-labelledby="admin-member-outcomes-title">
              <div className={styles.sectionHead} style={{ marginBottom: '0.5rem' }}>
                <h2 id="admin-member-outcomes-title" className={styles.sectionTitle}>Outcomes summary</h2>
                <Link href="/admin/outcomes" className={styles.inlineLink}>
                  Open full outcomes board →
                </Link>
              </div>
              <p className={styles.lede}>
                Cohort context for this member&apos;s organization, including exact placements over the last 90 days.
              </p>
              {outcomesSummary ? (
                <>
                  <div className={styles.statGrid} style={{ marginBottom: placedOutcomeRow ? '1rem' : 0 }}>
                    <div className={styles.stat}>
                      <p className={styles.statLabel}>Placed (last 90d)</p>
                      <p className={styles.statValue}>{placedLast90d}</p>
                    </div>
                    <div className={styles.stat}>
                      <p className={styles.statLabel}>Placement rate</p>
                      <p className={styles.statValue}>
                        {orgEnrolled < SMALL_SAMPLE_THRESHOLD
                          ? `N=${orgEnrolled}`
                          : `${orgPlacementRate ?? 0}%`}
                      </p>
                      <p className={styles.statNote}>
                        {orgPlaced} of {orgEnrolled} enrolled
                      </p>
                    </div>
                    <div className={styles.stat}>
                      <p className={styles.statLabel}>Avg time to placement</p>
                      <p className={styles.statValue}>
                        {orgAvgDaysToPlacement === null ? '—' : `${orgAvgDaysToPlacement} d`}
                      </p>
                    </div>
                  </div>
                  {placedOutcomeRow ? (
                    <div className={`${styles.callout} wa-kit-tone--ok`}>
                      <p className={styles.statLabel}>This member&apos;s placement</p>
                      <p className={styles.statText}>
                        {placedOutcomeRow.jobTitle} · {placedOutcomeRow.employerName}
                      </p>
                      <p className={styles.statNote}>
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
                <p className={styles.emptyCopy}>
                  Outcomes snapshot is unavailable right now.
                </p>
              )}
            </section>

            <section id="placed-outcome" className="wa-kit-card" aria-labelledby="admin-member-placement-title">
              <h2 id="admin-member-placement-title" className={`portal-section-heading ${styles.sectionTitle}`}>Placement record</h2>
              {pendingPlacementEvents && pendingPlacementEvents.length > 0 && !placedOutcomeRow && (
                <div className={`${styles.callout} wa-kit-tone--warn`} style={{ marginBottom: '1rem' }}>
                  <p className={styles.calloutTitle}>
                    <span className="material-symbols-outlined" style={{ color: 'var(--wa-gold-dark)' }} aria-hidden="true">pending</span>
                    Pending member-reported placement
                  </p>
                  <p className={styles.calloutBody}>
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

            <AdminMemberAiMatches memberId={member.id} matches={member.aiJobMatches} />

            <section className="wa-kit-card" aria-labelledby="admin-member-resumes-title">
              <h2 id="admin-member-resumes-title" className={styles.sectionTitle}>Resumes</h2>
              <AdminMemberResumeSection memberId={member.id} />
            </section>
          </div>
        </TabPanel>

        {/* ── Eligibility (applications, WIOA screening, approvals) ── */}
        <TabPanel value="eligibility">
          <div className={styles.stack}>
            <section className="wa-kit-card" aria-labelledby="admin-member-application-status-title">
              <div className={styles.sectionHead}>
                <h2 id="admin-member-application-status-title" className={styles.sectionTitle}>Application status</h2>
                <StatusTag tone={latestApplication ? applicationTone : 'muted'}>
                  {latestApplication ? String(latestApplication.status).replace(/_/g, ' ').toLowerCase() : 'none on file'}
                </StatusTag>
              </div>
              {latestApplication ? (
                <div className={styles.facts}>
                  <p>
                    <strong>Submitted:</strong>{' '}
                    {latestApplication.submittedAt
                      ? new Date(latestApplication.submittedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                      : 'Not submitted'}
                  </p>
                  <p><strong>Recommended career:</strong> {latestApplication.recommendedCareerTitle ?? '—'}</p>
                  <p>
                    <strong>Ranked programs:</strong>{' '}
                    {Array.isArray(latestApplication.programRankedSlugs) && latestApplication.programRankedSlugs.length > 0
                      ? (latestApplication.programRankedSlugs as string[]).map((slug) => programDisplayTitle(slug)).join(' · ')
                      : '—'}
                  </p>
                  {member.applications.length > 1 ? (
                    <p className={styles.emptyCopy}>{member.applications.length - 1} earlier application{member.applications.length - 1 === 1 ? '' : 's'} on file.</p>
                  ) : null}
                </div>
              ) : (
                <p className={styles.emptyCopy}>This member has not submitted a training application.</p>
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

            {preScreening && (
              <section className="wa-kit-card" aria-labelledby="admin-member-prescreening-title">
                <h2 id="admin-member-prescreening-title" className={styles.sectionTitle}>Pre-screening</h2>
                <div className={styles.facts}>
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
                </div>
              </section>
            )}

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
        </TabPanel>

        {/* ── Messages ─────────────────────────────────────────── */}
        <TabPanel value="messages">
          <div className={styles.stack}>
            <section id="admin-member-messages" className="wa-kit-card" aria-labelledby="admin-member-messages-title">
              <h2 id="admin-member-messages-title" className={styles.sectionTitle}>Counselor conversation</h2>
              {readOnlyAudit && <span hidden data-portal-audit-suppressed="admin-member-message-thread-create-read-receipt-and-realtime" />}
              {readOnlyAudit && counselorChatInitial ? (
                <p className={styles.emptyCopy}>Counselor conversation is available. Live sync and read receipts are paused for this audit.</p>
              ) : counselorChatInitial ? (
                <AdminMemberCounselorChatClient initial={counselorChatInitial} messagingSurface="admin" />
              ) : (
                <p className={styles.emptyCopy}>No counselor conversation has started yet.</p>
              )}
            </section>
          </div>
        </TabPanel>

        {/* ── Notes ────────────────────────────────────────────
            Staff notes on the existing /api/admin/members/[id]/notes route
            (counselor notes panel pattern). */}
        <TabPanel value="notes">
          <div className={styles.stack}>
            <section className="wa-kit-card" aria-labelledby="admin-member-notes-title">
              <h2 id="admin-member-notes-title" className={styles.sectionTitle}>Notes</h2>
              <p className={styles.lede}>
                Internal staff notes about this member. Counselors see the same thread on their student record.
              </p>
              <AdminMemberNotesPanel memberId={member.id} />
            </section>
          </div>
        </TabPanel>

        {/* ── Activity ─────────────────────────────────────────
            Staff actions recorded against this member (AuditLog) merged with
            the member's own recent events, newest first. The full lifecycle
            timeline keeps its own page. */}
        <TabPanel value="activity">
          <div className={styles.stack}>
            <section className="wa-kit-card" aria-labelledby="admin-member-activity-title">
              <div className={styles.sectionHead}>
                <h2 id="admin-member-activity-title" className={styles.sectionTitle}>Recent activity</h2>
                <StatusTag tone="muted">Latest {activityRows.length} of {MEMBER_ACTIVITY_CAP} max</StatusTag>
              </div>
              {activityRows.length > 0 ? (
                <ul className={styles.activityList}>
                  {activityRows.map((row) => (
                    <li key={row.id} className={`${styles.activityRow} ${row.kind === 'staff' ? 'wa-kit-tone--info' : 'wa-kit-tone--ok'}`}>
                      <span className={styles.activityDot} aria-hidden="true" />
                      <div className={styles.activityCopy}>
                        <p className={styles.activityLabel}>{row.label}</p>
                        <p className={styles.activityMeta}>
                          {row.kind === 'staff' ? `Staff · ${row.actor}` : 'Member'} ·{' '}
                          {row.at.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <KitEmptyState
                  headingAs="h3"
                  title="No activity recorded yet"
                  description="Staff actions on this record and the member's own events will appear here as they happen."
                />
              )}
              <div className={styles.activityLinks}>
                <Link href={`/admin/members/${id}/lifecycle`} className={styles.inlineLink}>Open full lifecycle timeline →</Link>
                {scope.superAdmin ? (
                  <Link href="/admin/audit-logs" className={styles.inlineLink}>Open platform audit logs →</Link>
                ) : null}
              </div>
            </section>
          </div>
        </TabPanel>
      </Tabs>
    </div>
  );
}
