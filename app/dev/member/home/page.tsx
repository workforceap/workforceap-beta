import { notFound } from 'next/navigation';
import { MemberHomeKit } from '@/components/portal/kit/pages/member/MemberHomeKit';
import MemberApprovalStatusCard from '@/components/portal/MemberApprovalStatusCard';
import { memberApprovalCardPlacement } from '@/lib/member/memberApprovalCardPlacement';
import { buildMemberApprovalStatus, type MemberApprovalFacts } from '@/lib/member/memberApprovalStatus';

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
 * and one whose training has been quiet past the staleness threshold (gold).
 */
export const dynamic = 'force-dynamic';

const APPROVAL_FIXTURES: Record<string, MemberApprovalFacts> = {
  live: {
    applications: [{ status: 'PENDING', submittedAt: new Date('2026-09-10T15:00:00Z') }],
    wioaReviewStatus: null,
    courseraEnrollmentApproved: false,
  },
  closed: {
    applications: [{ status: 'DENIED', submittedAt: new Date('2026-08-14T15:00:00Z') }],
    wioaReviewStatus: 'verified',
    wioaReviewedAt: new Date('2026-08-28T15:00:00Z'),
    courseraEnrollmentApproved: true,
    courseraEnrollmentApprovedAt: new Date('2026-09-02T15:00:00Z'),
  },
  complete: {
    applications: [{ status: 'APPROVED', submittedAt: new Date('2026-08-14T15:00:00Z') }],
    wioaReviewStatus: 'verified',
    wioaReviewedAt: new Date('2026-08-28T15:00:00Z'),
    courseraEnrollmentApproved: true,
    courseraEnrollmentApprovedAt: new Date('2026-09-02T15:00:00Z'),
  },
};

export default async function DevMemberHomePage({
  searchParams,
}: {
  searchParams?: Promise<{ approval?: string; course?: string }>;
}) {
  if (process.env.VERCEL_ENV === 'production') notFound();

  const params = await searchParams;
  const requested = params?.approval ?? 'live';
  const courseFixture = params?.course;
  const coursePercent = courseFixture === 'zero' || courseFixture === 'zero-stale' ? 0 : 78;
  const courseProgressStale = courseFixture === 'zero-stale';
  const fixture = APPROVAL_FIXTURES[requested];
  const status = fixture ? buildMemberApprovalStatus(fixture) : null;
  const placement = status ? memberApprovalCardPlacement(status) : null;
  const approvalCard = status ? (
    <MemberApprovalStatusCard status={status} storageUserId="dev-member" placement={placement ?? 'primary'} />
  ) : null;

  return (
    <>
    {placement === 'primary' ? approvalCard : null}
    <MemberHomeKit
      firstName="Mike"
      coursePercent={coursePercent}
      courseProgressStale={courseProgressStale}
      activeJobs={4}
      certs={2}
      points={1240}
      programTitle="AWS Certified Cloud Practitioner Certificate"
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
      doThisNext={{
        id: 'resume-module',
        title: 'Shared Responsibility Model',
        body: '~25 min · Module 8 of 9 · AWS Cloud Practitioner — due Thursday.',
        href: '/dev/member/program',
        cta: 'Resume module',
        variant: 'urgent',
        weight: 100,
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
      goals={[
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
