import CounselorRepliesView from '@/components/portal/counselor/workspace/CounselorRepliesView';
import CounselorWorkspace from '@/components/portal/counselor/CounselorWorkspace';

export const dynamic = 'force-dynamic';

/** Existing deep link retained inside the shared Today workspace. */
export default async function CounselorWorkQueuePage() {
  const content = await CounselorRepliesView({ embedded: true });
  return <CounselorWorkspace view="replies">{content}</CounselorWorkspace>;
}
