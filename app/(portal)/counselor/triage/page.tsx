import CounselorPrioritiesView from '@/components/portal/counselor/workspace/CounselorPrioritiesView';
import CounselorWorkspace from '@/components/portal/counselor/CounselorWorkspace';

export const dynamic = 'force-dynamic';

/** Existing deep link retained inside the shared Today workspace. */
export default async function CounselorTriagePage() {
  const content = await CounselorPrioritiesView({ embedded: true });
  return <CounselorWorkspace view="attention" filter="priorities">{content}</CounselorWorkspace>;
}
