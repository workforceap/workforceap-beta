import { notFound } from 'next/navigation';
import { MemberProgressKit } from '@/components/portal/kit/pages/member/MemberProgressKit';
import { ReadinessProgressSummary } from '@/components/portal/ReadinessProgressSummary';
import { buildReadinessProgressView } from '@/lib/readiness/progressView';
import { SCREENSHOT_86_BREAKDOWN, zeroScoreBreakdown } from '@/lib/readiness/progressView.fixtures';
import {
  READINESS_SCORE_LOAD_ERROR,
  buildFactualReadinessRecap,
  buildReadinessRecapBreakdown,
} from '@/lib/readiness/progressSummary';

/**
 * Storybook-lite showcase — MemberProgressKit (readiness ring + category
 * scores + milestones + factual recap). Preview-only, no auth/DB.
 *
 *   /dev/member/progress              — 86% screenshot fixture + summary
 *   /dev/member/progress?state=empty  — KitEmptyState for category scores + milestones
 *   /dev/member/progress?state=error  — honest score-load error
 */
export const dynamic = 'force-dynamic';

export default async function DevMemberProgressPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  if (process.env.VERCEL_ENV === 'production') notFound();
  const { state } = await searchParams;
  const empty = state === 'empty';
  const error = state === 'error';
  const view = buildReadinessProgressView(SCREENSHOT_86_BREAKDOWN);
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
