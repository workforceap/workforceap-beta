import { notFound } from 'next/navigation';
import Link from 'next/link';
import MembersTable from '@/components/admin/MembersTable';
import AdminUsersManager from '@/components/admin/AdminUsersManager';
import { UsersKit } from '@/components/portal/kit/pages/admin-subviews/UsersKit';
import { DesignSurface } from '@/components/portal/kit/DesignSurface';
import GlobalSearch from '@/components/portal/GlobalSearch';
import PageHeader from '@/components/portal/PageHeader';
import { normalizeDirectorySearch } from '@/lib/admin/directorySearch';

/** Synthetic, credential-free proof of the actual directory components. */
export const dynamic = 'force-dynamic';

export default async function PeopleProof({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (process.env.NODE_ENV !== 'development') notFound();
  const params = await searchParams;
  const searchQuery = normalizeDirectorySearch(params.search ?? '');
  const names = ['Alexandria Montgomery-Williams', 'Jordan Chen', 'Sam Rivera'];
  const users = names.map((name, index) => ({
    id: `00000000-0000-4000-8000-00000000000${index}`,
    fullName: name,
    email: `${index === 0 ? 'alexandria.montgomery-williams' : name.toLowerCase().replace(' ', '.')}@example.org`,
    role: ['super_admin', 'counselor', 'member'][index],
    createdAt: '2026-09-01T12:00:00Z',
    memberHref: null,
  })).filter(user => searchQuery.toLowerCase().split(' ').every(token => `${user.fullName} ${user.email}`.toLowerCase().includes(token)))
    .filter(user => !params.role || user.role === params.role);
  return (
    <DesignSurface surface="dense" className="wa-kit-people-roster">
      <PageHeader title="People" subtitle="Synthetic directory preview: members, staff and user management." />
      <GlobalSearch />
      <nav aria-label="Preview views" className="wa-flex wa-flex-wrap wa-gap-3 wa-mb-5">
        <Link href="?view=members">Members</Link><Link href="?view=staff">Staff</Link><Link href="?view=manage">Manage users</Link>
      </nav>
      {params.view === 'manage' ? <AdminUsersManager initialUsers={users} canManageRoles={false} totalCount={users.length} currentPage={1} pageSize={50} searchQuery={searchQuery} roleFilter={params.role ?? ''} />
        : params.view === 'staff' ? <UsersKit users={users.filter(u => u.role !== 'member').map(u => ({ id: u.id, name: u.fullName, initials: 'AM', email: u.email, role: u.role, lastLogin: 'Never', active: false }))} total={users.filter(u => u.role !== 'member').length} searchQuery={searchQuery} roleFilter={params.role ?? ''} />
          : <MembersTable members={users.map(u => ({ ...u, phone: null, profile: null, enrolledProgram: 'project-management', enrolledAt: u.createdAt, staleTrainingDetectedAt: null, assessmentScorePct: 82, assessmentCompleted: true, updatedAt: u.createdAt, memberStatus: 'active', programTitle: 'Project Management Professional Certificate', coursesCompleted: [], totalCourses: 6, liveTraining: null, partnerName: 'Community Training and Career Development Center', partnerId: null, fitScore: 8, healthStatus: 'green' as const, enrollmentProgramSlugs: ['project-management'], enrollmentProgramTitleBySlug: { 'project-management': 'Project Management Professional Certificate' } }))} totalCount={users.length} currentPage={1} pageSize={50} searchQuery={searchQuery} programFilter="" statusFilter="" partnerFilter="" startDateFilter="" endDateFilter="" allPartnerOptions={[]} allAssignablePrograms={[{ slug: 'project-management', title: 'Project Management Professional Certificate' }]} />}
    </DesignSurface>
  );
}
