import { notFound } from 'next/navigation';
import { MemberProgressKit, type MemberProgressKitProps } from '@/components/portal/kit/pages/member/MemberProgressKit';
import { ReadinessProgressSummary } from '@/components/portal/ReadinessProgressSummary';
import { buildReadinessProgressView } from '@/lib/readiness/progressView';
import { SCREENSHOT_MEMBER_BREAKDOWN, zeroScoreBreakdown } from '@/lib/readiness/progressView.fixtures';
import {
  READINESS_SCORE_LOAD_ERROR,
  buildFactualReadinessRecap,
  buildReadinessRecapBreakdown,
} from '@/lib/readiness/progressSummary';

/**
 * Storybook-lite showcase — MemberProgressKit (readiness ring + category
 * scores + milestones + factual recap). Preview-only, no auth/DB.
 *
 *   /dev/member/progress              — 86% screenshot fixture + summary, numbers strip, points card
 *   /dev/member/progress?state=empty  — KitEmptyState for category scores + milestones (no numbers data)
 *   /dev/member/progress?state=error  — honest score-load error
 *
 * The numbers strip and the Points card (the pieces the member Home dropped)
 * render here with clearly synthetic values; the empty and error states pass
 * none, which proves the blocks are left out when a page has no data for them.
 */
export const dynamic = 'force-dynamic';

/** Synthetic numbers for the strip and the Points card (fixture only). */
const NUMBERS: Pick<MemberProgressKitProps, 'coursePercent' | 'activeJobs' | 'certs' | 'points' | 'pointsThisWeek' | 'currentStreak' | 'longestStreak' | 'pointsHref' | 'pointsLedger'> = {
  coursePercent: 78,
  activeJobs: 4,
  certs: 2,
  points: 1240,
  pointsThisWeek: 85,
  currentStreak: 12,
  longestStreak: 20,
  pointsHref: null,
  pointsLedger: [
    { label: 'Module complete', amount: 40, color: 'accent' },
    { label: 'Application sent', amount: 25, color: 'info' },
    { label: '12-day streak', amount: 20, color: 'gold' },
    { label: 'Resume updated', amount: 15, color: 'success' },
  ],
};

export default async function DevMemberProgressPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  if (process.env.VERCEL_ENV === 'production') notFound();
  const { state } = await searchParams;
  const empty = state === 'empty';
  const error = state === 'error';
  const view = buildReadinessProgressView(SCREENSHOT_MEMBER_BREAKDOWN);
  const emptyView = buildReadinessProgressView(zeroScoreBreakdown());
  const factual = buildFactualReadinessRecap(empty ? emptyView : view);

  return (
    <MemberProgressKit
      readinessScore={empty || error ? 0 : view.overallScore}
      readinessNote={empty ? emptyView.readinessNote : view.readinessNote}
      statsHeading="Progress by area"
      readinessCoachHref="/dev/member/toolkit"
      weekStats={empty || error ? [] : view.weekStats}
      milestones={empty || error ? [] : view.milestones}
      nextAction={empty || error ? null : view.priorityAction}
      loadFailed={error}
      {...(empty || error ? {} : NUMBERS)}
      summary={
        <ReadinessProgressSummary
          factualSummary={error ? READINESS_SCORE_LOAD_ERROR : factual}
          nextAction={empty || error ? null : view.priorityAction}
          breakdown={error ? null : buildReadinessRecapBreakdown(empty ? emptyView : view)}
          coachHref="/dev/member/toolkit"
          enableGeneration={false}
          loadFailed={error}
        />
      }
    />
  );
}
