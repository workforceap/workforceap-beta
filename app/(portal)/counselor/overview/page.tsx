import CounselorOverviewView from '@/components/portal/counselor/workspace/CounselorOverviewView';
import CounselorWorkspace from '@/components/portal/counselor/CounselorWorkspace';

/** The prior overview URL remains an entry to the shared workspace. */
export default async function CounselorPortalPage({ searchParams }: { searchParams?: Promise<{ ui?: string }> }) {
  const content = await CounselorOverviewView({ searchParams, embedded: true });
  return <CounselorWorkspace view="overview">{content}</CounselorWorkspace>;
}
