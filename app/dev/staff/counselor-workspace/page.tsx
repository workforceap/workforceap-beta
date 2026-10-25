import { notFound } from 'next/navigation';
import CounselorWorkspace from '@/components/portal/counselor/CounselorWorkspace';
import { CounselorTodayKit } from '@/components/portal/kit/pages/counselor/CounselorTodayKit';
import { CounselorApprovalQueue } from '@/components/portal/kit/pages/counselor/CounselorApprovalQueue';
import { CounselorHomeKit } from '@/components/portal/kit/pages/counselor/CounselorHomeKit';
import { KitEmptyState } from '@/components/portal/kit';
import { emptyAttentionQueue } from '@/lib/attention/evaluate';
import { toTodayQueue } from '@/lib/attention/counselorViews';
import { emptyApprovalQueue } from '@/lib/counselor/approvalQueue';
import { parseCounselorAttentionFilter, parseCounselorWorkspaceView, type CounselorWorkspaceParams } from '@/lib/counselor/workspace';

export const dynamic = 'force-dynamic';

/** Chrome and empty/error states only. No database reads or mutation handlers. */
export default async function CounselorWorkspaceProof({ searchParams }: { searchParams?: Promise<CounselorWorkspaceParams> }) {
  if (process.env.VERCEL_ENV === 'production') notFound();
  const params = (await searchParams) ?? {};
  const view = parseCounselorWorkspaceView(params.view);
  const filter = parseCounselorAttentionFilter(params.filter);
  const failed = params.state === 'error';
  return (
    <>
      <p role="note" className="wa-kit-meta wa-p-4">Preview fixture: workspace navigation and empty/error states. Member work uses the authenticated counselor portal.</p>
      <CounselorWorkspace view={view} filter={filter} baseHref="/dev/staff/counselor-workspace">
        {view === 'attention' && filter === 'all' ? (
          <CounselorTodayKit embedded showApprovals={false} queue={toTodayQueue(emptyAttentionQueue())} loadError={failed}
            approvalSummaryHref="/dev/staff/counselor-workspace?view=decisions" retryHref="/dev/staff/counselor-workspace" />
        ) : view === 'decisions' ? (
          <CounselorApprovalQueue queue={emptyApprovalQueue()} loadError={failed} retryHref="/dev/staff/counselor-workspace?view=decisions" />
        ) : view === 'overview' ? (
          <CounselorHomeKit embedded firstName="Preview" assignedCount={0} atRiskCount={0} needsReplyCount={0} onTrackCount={0}
            queueRows={[]} queueTotal={0} sessions={[]} bucketCounts={{ critical: 0, warning: 0, ontrack: 0 }} />
        ) : (
          <KitEmptyState title="Workspace view ready" description="This proof checks the shared navigation. The signed-in view retains its existing data, filters and actions." headingAs="h3" />
        )}
      </CounselorWorkspace>
    </>
  );
}
