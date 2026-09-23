import { notFound } from 'next/navigation';
import { MemberHomeKit } from '@/components/portal/kit/pages/member/MemberHomeKit';
import MemberApprovalStatusCard from '@/components/portal/MemberApprovalStatusCard';
import { memberApprovalCardPlacement } from '@/lib/member/memberApprovalCardPlacement';
import { buildMemberApprovalStatus, type MemberApprovalFacts } from '@/lib/member/memberApprovalStatus';
import { STALE_TRAINING_COUNSELOR_ACTION, buildFirst90Card } from '@/lib/member/loadMemberDashboardHome';
import { isFirst90Stage, type First90Stage } from '@/lib/member/first90Days';
import type { NextBestAction } from '@/lib/member/nextBestActions';
import { programDisplayTitle } from '@/lib/content/programTitle';
import PWAInstallPrompt from '@/components/pwa/PWAInstallPrompt';
import PortalEntryClient from '@/components/onboarding/PortalEntryClient';
import PortalEntryErrorBoundary from '@/components/portal/PortalEntryErrorBoundary';
import { MEMBER_PORTAL_TOUR_STEPS } from '@/lib/onboarding/portalTourSteps';

/**
 * Storybook-lite showcase — MemberHomeKit "Command Center" (fully populated,
 * every new optional prop wired). Preview-only, no auth/DB. See
 * app/dev/dashboard/page.tsx for the pattern.
 *
 * `?approval=live|closed|complete|off` swaps the approval-status card fixture
 * so both placements can be reviewed in the real chrome: `live` (a pending
 * application) keeps the full card above the dashboard, `closed` and
 * `complete` collapse it below the content. Same composition as
 * app/(portal)/dashboard/page.tsx.
 *
 * `?course=zero|zero-stale` drops the Course tile to 0% so the two
 * not-started states can be reviewed: a member who just enrolled (no warning)
 * and one whose training has been quiet past the staleness threshold (gold,
 * plus the counselor row the loader adds to "Up next").
 *
 * The pieces moved over from the `?ui=legacy` home (WAP-188) are on by
 * default so the populated page shows them; each has a switch:
 *   `?offer=off` hides the placement confirmation strip (one OFFER fixture).
 *   `?first90=week_1|day_30|day_60|day_90|off` picks the First 90 Days stage
 *     (default day_30, with the week 1 check-in answered). Built with the
 *     loader's own `buildFirst90Card`.
 *   `?youth=<age>` shows the youth notice for a member of that age (under 18).
 *   `?goals=none` empties the goals so the Next badge tile shows "Set a goal".
 * The four owner-approved pieces (WAP-194), each off by default:
 *   `?onboarding=on` opens the first-login wizard (PortalEntryClient
 *     portal="member", the same mount as the live home), pre-filled with a
 *     half-finished intake. `?onboarding=tour` skips the wizard and runs the
 *     first-visit tour auto-start instead.
 *   `?programs=2` gives the member two enrollments, so the Certification path
 *     card shows the view-only program switch; choosing the other program
 *     reloads with `?program=<slug>`, which keeps the switch and shows the
 *     secondary-program note. `?program=` alone implies two programs.
 *   `?staff=1` shows the staff-view banner (as a staff viewer sees it).
 *   The app-install prompt is always mounted; the browser only fires its
 *     `beforeinstallprompt` from the second visit, so it rarely shows here.
 * The strip and the check-in call real server actions, which refuse without a
 * signed-in member: a click here shows their error state. So do the wizard's
 * `/api/onboarding/*` saves.
 */
export const dynamic = 'force-dynamic';

const APPROVAL_FIXTURES: Record<string, MemberApprovalFacts> = {
  live: {
    applications: [{ status: 'PENDING', submittedAt: new Date('2026-09-10T15:00:00Z') }],
    wioaReviewStatus: null,
    courseraEnrollmentApproved: false,
  },
  // A denied application clears `courseraEnrollmentApproved` at the write
  // (lib/admin/applicationReview.ts), so the training step reads pending here
  // rather than telling a turned-down member their training is approved.
  closed: {
    applications: [{ status: 'DENIED', submittedAt: new Date('2026-08-14T15:00:00Z') }],
    wioaReviewStatus: 'verified',
    wioaReviewedAt: new Date('2026-08-28T15:00:00Z'),
    courseraEnrollmentApproved: false,
  },
  complete: {
    applications: [{ status: 'APPROVED', submittedAt: new Date('2026-08-14T15:00:00Z') }],
    wioaReviewStatus: 'verified',
    wioaReviewedAt: new Date('2026-08-28T15:00:00Z'),
    courseraEnrollmentApproved: true,
    courseraEnrollmentApprovedAt: new Date('2026-09-02T15:00:00Z'),
  },
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** Days since placement that land inside each First 90 Days stage (lib/member/first90Days.ts). */
const FIRST90_FIXTURE_DAYS: Record<First90Stage, number> = { week_1: 5, day_30: 30, day_60: 60, day_90: 88 };

/** Two catalog programs for `?programs=2`, primary first (the loader's order). */
const DEV_PROGRAM_SLUGS = ['aws-cloud-technology-amazon', 'comptia-a-professional-certificate'] as const;

const UP_NEXT_FIXTURE: NextBestAction[] = [
  {
    id: 'interview_practice',
    title: 'Practice your interview answers',
    body: 'Use guided interview practice to prepare for recruiter screens and counselor interviews.',
    href: '/dev/member/interview-practice',
    cta: 'Practice interviews',
    variant: 'default',
    weight: 72,
  },
  {
    id: 'career_readiness',
    title: 'Build your job readiness plan',
    body: 'Review your readiness checklist so applications, interview prep, and counselor guidance stay in sync.',
    href: '/dev/member/progress',
    cta: 'Open readiness',
    variant: 'default',
    weight: 68,
  },
];

export default async function DevMemberHomePage({
  searchParams,
}: {
  searchParams?: Promise<{
    approval?: string;
    course?: string;
    offer?: string;
    first90?: string;
    youth?: string;
    goals?: string;
    onboarding?: string;
    programs?: string;
    program?: string;
    staff?: string;
  }>;
}) {
  if (process.env.VERCEL_ENV === 'production') notFound();

  const params = await searchParams;
  const requested = params?.approval ?? 'live';
  const courseFixture = params?.course;
  const coursePercent = courseFixture === 'zero' || courseFixture === 'zero-stale' ? 0 : 78;
  const courseProgressStale = courseFixture === 'zero-stale';
  const jobOffers = params?.offer === 'off'
    ? []
    : [{ id: 'dev-offer-1', role: 'Cloud Support Associate', company: 'Indeed · Austin, TX' }];
  const first90Stage: First90Stage | null =
    params?.first90 === 'off' ? null : params?.first90 && isFirst90Stage(params.first90) ? params.first90 : 'day_30';
  const first90 = first90Stage
    ? buildFirst90Card(
        { placedAt: new Date(Date.now() - FIRST90_FIXTURE_DAYS[first90Stage] * DAY_MS), employerName: 'Deloitte' },
        first90Stage === 'week_1'
          ? []
          : [{ entityId: 'week_1', metadata: { response: 'going_well' }, createdAt: new Date(Date.now() - 20 * DAY_MS) }],
      )
    : null;
  const youthAge = params?.youth ? Number.parseInt(params.youth, 10) : NaN;
  const youthNoticeAge = Number.isInteger(youthAge) && youthAge >= 0 && youthAge < 18 ? youthAge : null;
  const upNext: NextBestAction[] = [
    ...(courseProgressStale ? [STALE_TRAINING_COUNSELOR_ACTION] : []),
    ...UP_NEXT_FIXTURE,
  ].slice(0, 3);
  const onboardingFixture = params?.onboarding === 'on' || params?.onboarding === 'tour' ? params.onboarding : null;
  const requestedProgram = typeof params?.program === 'string' ? params.program.trim() : '';
  const programSwitch = params?.programs === '2' || requestedProgram
    ? (() => {
        const options = DEV_PROGRAM_SLUGS.map((slug, index) => ({
          id: `dev-enrollment-${index + 1}`,
          programSlug: slug,
          programTitle: programDisplayTitle(slug),
          isPrimary: index === 0,
        }));
        // Same rule as the loader: only one of the member's own slugs is honoured.
        const active = options.find((option) => option.programSlug === requestedProgram) ?? options[0]!;
        return { options, activeProgramSlug: active.programSlug, viewingSecondary: !active.isPrimary, pathname: '/dev/member/home' };
      })()
    : null;
  const activeProgramTitle = programSwitch
    ? programSwitch.options.find((option) => option.programSlug === programSwitch.activeProgramSlug)?.programTitle
    : undefined;
  const fixture = APPROVAL_FIXTURES[requested];
  const status = fixture ? buildMemberApprovalStatus(fixture) : null;
  const placement = status ? memberApprovalCardPlacement(status) : null;
  const approvalCard = status ? (
    <MemberApprovalStatusCard status={status} storageUserId="dev-member" placement={placement ?? 'primary'} />
  ) : null;

  return (
    <>
    <PWAInstallPrompt />
    {onboardingFixture ? (
      <PortalEntryErrorBoundary>
        <PortalEntryClient
          portal="member"
          tourStorageUserId={`dev-member-${Date.now()}`}
          showOnboardingWizard={onboardingFixture === 'on'}
          showTour={onboardingFixture === 'tour'}
          isSuperAdmin={false}
          tourSteps={MEMBER_PORTAL_TOUR_STEPS}
          wizardProps={{
            initialFullName: 'Mike Brown',
            initialPhone: '',
            initialAddress: '',
            initialCity: 'Austin',
            initialState: 'TX',
            initialZip: '',
            initialProgramInterest: 'AWS Cloud Technology Certificate',
            initialReferralSource: '',
            initialStep: 0,
            counselor: { firstName: 'Dana', messagingHref: '/dev/member/messages' },
            waitEstimate: null,
          }}
        >
          {null}
        </PortalEntryClient>
      </PortalEntryErrorBoundary>
    ) : null}
    {placement === 'primary' ? approvalCard : null}
    <MemberHomeKit
      showStaffViewBanner={params?.staff === '1'}
      programSwitch={programSwitch}
      firstName="Mike"
      coursePercent={coursePercent}
      courseProgressStale={courseProgressStale}
      activeJobs={4}
      certs={2}
      points={1240}
      programTitle={activeProgramTitle ?? 'AWS Certified Cloud Practitioner Certificate'}
      programStatus="In progress"
      nextBadgePercent={60}
      nextBadgeName="Cloud Foundations"
      nextBadgeRemaining="2 modules"
      currentStreak={12}
      longestStreak={12}
      resumeHref="/dev/member/program"
      toolkitHref="/dev/member/toolkit"
      jobsHref="/dev/member/jobs"
      coursesHref="/dev/member/program"
      goalsHref="/dev/member/progress"
      jobOffers={jobOffers}
      first90={first90}
      youthNoticeAge={youthNoticeAge}
      doThisNext={{
        id: 'resume-module',
        title: 'Shared Responsibility Model',
        body: '~25 min · Module 8 of 9 · AWS Cloud Practitioner — due Thursday.',
        href: '/dev/member/program',
        cta: 'Resume module',
        variant: 'urgent',
        weight: 100,
      }}
      upNext={upNext}
      recommendedTool={{
        slug: 'interview-prep',
        title: 'Get ready for your interview',
        body: 'You have an interview or screening in your tracker. Pull your resume, pitch and practice answers into one page to review before it.',
        href: '/dev/member/interview-prep',
        cta: 'Open interview prep',
      }}
      courseSpark={{ series: [70, 71, 72, 74, 74, 76, 78], delta: '4%', direction: 'up' }}
      activeJobsSpark={{ series: [2, 3, 3, 3, 4, 4, 4], delta: '1', direction: 'up' }}
      certsSpark={{ series: [1, 1, 1, 1, 1, 2, 2] }}
      pointsSpark={{ series: [900, 950, 1000, 1080, 1120, 1180, 1240], delta: '85', direction: 'up' }}
      certModulesDone={7}
      certModulesTotal={9}
      programCoursesNote="9 courses: 8 on Coursera's learning path plus the WorkforceAP Lab, Project, and Test Preparation (delivered by WorkforceAP, not part of the Coursera path)."

      weeklyActivity={[
        { day: 'Mon', minutes: 18 },
        { day: 'Tue', minutes: 25 },
        { day: 'Wed', minutes: 22 },
        { day: 'Thu', minutes: 35 },
        { day: 'Fri', minutes: 40 },
        { day: 'Sat', minutes: 50 },
        { day: 'Sun', minutes: 58 },
      ]}
      weeklyActivityDeltaLabel="+41% vs last week"
      pointsThisWeek={85}
      pointsLedger={[
        { label: 'Module complete', amount: 40, color: 'accent' },
        { label: 'Application sent', amount: 25, color: 'info' },
        { label: '12-day streak', amount: 20, color: 'gold' },
      ]}
      goals={params?.goals === 'none' ? [] : [
        { title: 'Finish AWS Cloud Practitioner', percent: 78 },
        { title: 'Apply to 5 cloud roles', percent: 80 },
      ]}
      pipeline={[
        {
          role: 'Salesforce Administrator',
          company: 'Deloitte',
          stage: 'Interviewing',
          tone: 'warn',
          appliedLabel: 'Jun 18',
          stageIndex: 3,
          stageTotal: 3,
        },
        {
          role: 'Agentforce Solutions Engineer',
          company: 'Accenture · Remote',
          stage: 'Applied',
          tone: 'muted',
          appliedLabel: 'Jun 29',
          stageIndex: 1,
          stageTotal: 3,
        },
        {
          role: 'Cloud Support Associate',
          company: 'Indeed · Austin, TX',
          stage: 'Screening',
          tone: 'info',
          appliedLabel: 'Jun 24',
          stageIndex: 2,
          stageTotal: 3,
        },
        {
          role: 'Junior Cloud Engineer',
          company: 'Oracle · Austin, TX',
          stage: 'Applied',
          tone: 'muted',
          appliedLabel: 'Jul 1',
          stageIndex: 1,
          stageTotal: 3,
        },
      ]}
    />
    {placement === 'demoted' ? approvalCard : null}
    </>
  );
}
