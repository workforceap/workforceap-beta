import { notFound } from 'next/navigation';
import StudentsWorkspace from '@/components/admin/StudentsWorkspace';
import MembersTable from '@/components/admin/MembersTable';
import AdminInterviewReadyTable from '@/components/admin/AdminInterviewReadyTable';
import AdminJobReadyTable from '@/components/admin/AdminJobReadyTable';
import { StudentsRosterKit, type StudentRow } from '@/components/portal/kit/pages/admin-subviews/StudentsRosterKit';
import { parseStudentsWorkspaceView, parseStudentsReadinessView, type StudentsWorkspaceParams } from '@/lib/admin/studentsWorkspace';

export const dynamic = 'force-dynamic';

const STUDENTS: StudentRow[] = Array.from({ length: 54 }, (_, i) => ({
  id: `preview-${i}`, name: `Preview learner ${String(i + 1).padStart(2, '0')}`, email: `learner.${i + 1}@example.test`,
  program: i % 2 ? 'IT Support' : 'Healthcare', progress: (i * 9) % 100, progressKnown: true,
  status: i % 3 ? 'In Training' : 'At Risk', counselor: 'Preview counselor', readiness: 60,
  lastActive: i % 3 ? '2h ago' : '16d ago', lastActiveAt: 1000 - i,
  training: { modulesDone: i % 10, modulesTotal: 10, pace: i % 3 ? 'On track' : 'Stalled' },
  href: '/dev/staff/students-workspace',
}));

/** Synthetic roster and empty management queues; no live reads or selected bulk actions. */
export default async function StudentsWorkspaceProof({ searchParams }: { searchParams?: Promise<StudentsWorkspaceParams> }) {
  if (process.env.VERCEL_ENV === 'production') notFound();
  const params = (await searchParams) ?? {};
  const view = parseStudentsWorkspaceView(params.view);
  const readiness = parseStudentsReadinessView(params.readiness);
  const query = new URLSearchParams(Object.entries(params).flatMap(([key, value]) => typeof value === 'string' ? [[key, value]] : [])).toString();
  return (
    <>
      <p role="note" className="wa-kit-meta wa-p-4">Preview fixture: synthetic roster and empty work queues. Account management uses the authenticated admin portal.</p>
      <StudentsWorkspace view={view} readiness={readiness} baseHref="/dev/staff/students-workspace">
        {view === 'manage' ? (
          <MembersTable members={[]} totalCount={0} currentPage={1} pageSize={50} searchQuery="" programFilter="" statusFilter=""
            partnerFilter="" startDateFilter="" endDateFilter="" allPartnerOptions={[]} allAssignablePrograms={[]} />
        ) : view === 'readiness' ? (
          readiness === 'job' ? <AdminJobReadyTable rows={[]} /> : <AdminInterviewReadyTable rows={[]} />
        ) : (
          <StudentsRosterKit key={`${view}:${query}`} embedded showViewNav={false} view={view} students={STUDENTS} total={STUDENTS.length} urlState={query} />
        )}
      </StudentsWorkspace>
    </>
  );
}
