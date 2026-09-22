import { redirect } from 'next/navigation';
import { getUser } from '@/lib/auth/server';
import { isAdmin, isCounselor } from '@/lib/auth/roles';
import { getCounselorAttention } from '@/lib/attention/counselor';
import { toTodayQueue } from '@/lib/attention/counselorViews';
import { emptyAttentionQueue } from '@/lib/attention/evaluate';
import { getCounselorApprovalQueue } from '@/lib/counselor/loadApprovalQueue';
import type { ApprovalQueue } from '@/lib/counselor/approvalQueue';
import { CounselorTodayKit } from '@/components/portal/kit/pages/counselor/CounselorTodayKit';

export const dynamic = 'force-dynamic';

/**
 * /counselor/today — the counselor landing page. One ordered list of members
 * needing attention, grouped by the kind of contact they need, from the same
 * evaluated queue (lib/attention) the Overview, Inbox zero, Triage and Work
 * queue render (counselor audit 2026-09-20, §4.1 / §6.1), plus the
 * "Waiting on your decision" approval queue: every application / intake check
 * this counselor owns, oldest first with an age clock (product review
 * 2026-09-22 item 5). The two loads fail independently so a broken approval
 * query never blanks the attention list, and vice versa.
 */
export default async function CounselorTodayPage() {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/counselor/today');

  const counselor = await isCounselor(user.id);
  const admin = await isAdmin(user.id);
  if (!counselor && !admin) redirect('/dashboard');

  let attention = emptyAttentionQueue();
  let loadError = false;
  let approvals: ApprovalQueue | null = null;
  let approvalsLoadError = false;
  const [attentionResult, approvalsResult] = await Promise.allSettled([
    getCounselorAttention(user.id, { isAdmin: admin }),
    getCounselorApprovalQueue(user.id, { isAdmin: admin }),
  ]);
  if (attentionResult.status === 'fulfilled') {
    attention = attentionResult.value;
  } else {
    console.error('[counselor/today] getCounselorAttention failed:', attentionResult.reason);
    loadError = true;
  }
  if (approvalsResult.status === 'fulfilled') {
    approvals = approvalsResult.value;
  } else {
    console.error('[counselor/today] getCounselorApprovalQueue failed:', approvalsResult.reason);
    approvalsLoadError = true;
  }

  return (
    <CounselorTodayKit
      queue={toTodayQueue(attention)}
      loadError={loadError}
      approvals={approvals}
      approvalsLoadError={approvalsLoadError}
    />
  );
}
