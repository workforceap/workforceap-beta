import CounselorFollowupView from '@/components/portal/counselor/workspace/CounselorFollowupView';
import CounselorWorkspace from '@/components/portal/counselor/CounselorWorkspace';

export const dynamic = 'force-dynamic';

/** Existing deep link retained inside the shared Today workspace. */
export default async function CounselorInboxZeroPage() {
  const content = await CounselorFollowupView({ embedded: true });
  return <CounselorWorkspace view="followup">{content}</CounselorWorkspace>;
}
