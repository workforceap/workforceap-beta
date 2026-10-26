import CounselorInactiveView from '@/components/portal/counselor/workspace/CounselorInactiveView';
import CounselorWorkspace from '@/components/portal/counselor/CounselorWorkspace';

export default function InactiveMembersPage() {
  return <CounselorWorkspace view="attention" filter="inactive"><CounselorInactiveView embedded /></CounselorWorkspace>;
}
