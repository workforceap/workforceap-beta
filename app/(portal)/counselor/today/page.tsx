import { redirect } from 'next/navigation';
import { getUser } from '@/lib/auth/server';
import { deniedPortalHomeHref } from '@/lib/auth/portalGuards';
import { isAdmin, isCounselor } from '@/lib/auth/roles';
import { getCounselorApprovalQueue } from '@/lib/counselor/loadApprovalQueue';
import { emptyApprovalQueue } from '@/lib/counselor/approvalQueue';
import { CounselorApprovalQueue } from '@/components/portal/kit/pages/counselor/CounselorApprovalQueue';
import CounselorWorkspace from '@/components/portal/counselor/CounselorWorkspace';
import CounselorAttentionView from '@/components/portal/counselor/workspace/CounselorAttentionView';
import CounselorRepliesView from '@/components/portal/counselor/workspace/CounselorRepliesView';
import CounselorFollowupView from '@/components/portal/counselor/workspace/CounselorFollowupView';
import CounselorOverviewView from '@/components/portal/counselor/workspace/CounselorOverviewView';
import CounselorPrioritiesView from '@/components/portal/counselor/workspace/CounselorPrioritiesView';
import CounselorAtRiskView from '@/components/portal/counselor/workspace/CounselorAtRiskView';
import CounselorInactiveView from '@/components/portal/counselor/workspace/CounselorInactiveView';
import {
  counselorWorkspaceHref,
  parseCounselorWorkspaceView,
  parseCounselorAttentionFilter,
  type CounselorWorkspaceParams,
} from '@/lib/counselor/workspace';

export const dynamic = 'force-dynamic';

/** One request loads one existing work view. Role gates run before its loader;
 * decision failures cannot blank the attention list, or vice versa. */
export default async function CounselorTodayPage({ searchParams }: {
  searchParams?: Promise<CounselorWorkspaceParams>;
}) {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/counselor/today');
  const counselor = await isCounselor(user.id);
  const admin = await isAdmin(user.id);
  if (!counselor && !admin) redirect(await deniedPortalHomeHref(user.id, 'counselor'));

  const params = (await searchParams) ?? {};
  const view = parseCounselorWorkspaceView(params.view);
  const filter = parseCounselorAttentionFilter(params.filter);
  let content: React.ReactNode;

  switch (view) {
    case 'replies':
      content = await CounselorRepliesView({ embedded: true });
      break;
    case 'followup':
      content = await CounselorFollowupView({ embedded: true });
      break;
    case 'overview':
      content = await CounselorOverviewView({
        embedded: true,
        searchParams: Promise.resolve({ ui: typeof params.ui === 'string' ? params.ui : undefined }),
      });
      break;
    case 'decisions': {
      let queue = emptyApprovalQueue();
      let loadError = false;
      try {
        queue = await getCounselorApprovalQueue(user.id, { isAdmin: admin });
      } catch (error) {
        console.error('[counselor/today] approval queue failed:', error);
        loadError = true;
      }
      content = <CounselorApprovalQueue queue={queue} loadError={loadError} retryHref={counselorWorkspaceHref('decisions')} />;
      break;
    }
    case 'attention':
    default:
      if (filter === 'priorities') content = await CounselorPrioritiesView({ embedded: true });
      else if (filter === 'at-risk') content = await CounselorAtRiskView({ embedded: true });
      else if (filter === 'inactive') content = <CounselorInactiveView embedded />;
      else content = await CounselorAttentionView();
  }

  return <CounselorWorkspace view={view} filter={filter}>{content}</CounselorWorkspace>;
}
