import { redirect } from 'next/navigation';
import { getUser } from '@/lib/auth/server';
import { isAdmin, isCounselor } from '@/lib/auth/roles';
import { getCounselorAttention } from '@/lib/attention/counselor';
import { toTodayQueue } from '@/lib/attention/counselorViews';
import { emptyAttentionQueue } from '@/lib/attention/evaluate';
import { CounselorTodayKit } from '@/components/portal/kit/pages/counselor/CounselorTodayKit';

export const dynamic = 'force-dynamic';

/**
 * /counselor/today — the counselor landing page. One ordered list of members
 * needing attention, grouped by the kind of contact they need, from the same
 * evaluated queue (lib/attention) the Overview, Inbox zero, Triage and Work
 * queue render (counselor audit 2026-09-20, §4.1 / §6.1).
 */
export default async function CounselorTodayPage() {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/counselor/today');

  const counselor = await isCounselor(user.id);
  const admin = await isAdmin(user.id);
  if (!counselor && !admin) redirect('/dashboard');

  let attention = emptyAttentionQueue();
  let loadError = false;
  try {
    attention = await getCounselorAttention(user.id, { isAdmin: admin });
  } catch (err) {
    console.error('[counselor/today] getCounselorAttention failed:', err);
    loadError = true;
  }

  return <CounselorTodayKit queue={toTodayQueue(attention)} loadError={loadError} />;
}
