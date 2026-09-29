import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { resolveAdminPageTenant, withAdminPageScope, inheritUserOrg, inheritMemberOrg, inheritLeaderOrg, inheritInvitedByOrg } from '@/lib/tenant/adminPageScope';
import { prisma } from '@/lib/db/prisma';
import { ADMIN_SSR_LIST_CAP, isListTruncated, showingFirstLabel } from '@/lib/db/queryCaps';
import { programDisplayTitle } from '@/lib/content/programTitle';
import PageHeader from '@/components/portal/PageHeader';
import { DesignSurface } from '@/components/portal/kit';
import {
  ProgramChangeRequestsKit,
  type ProgramChangeRow,
  type ProgramChangeDisplayStatus,
} from '@/components/portal/kit/pages/admin-subviews/ProgramChangeRequestsKit';
import ProgramChangeRequestsAdminClient from './ProgramChangeRequestsAdminClient';

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadataAsync({
  title: 'Admin — Program change requests',
  description: 'Review member requests to switch enrolled program.',
  path: '/admin/program-change-requests',
});
}

/** Cap the lean kit table so first paint stays cheap. */
const BOARD_LIMIT = 50;

/** Map the ProgramChangeRequestStatus enum onto the kit's display status. */
const DISPLAY_STATUS: Record<string, ProgramChangeDisplayStatus> = {
  PENDING: 'Pending',
  APPROVED: 'Approved',
  DENIED: 'Rejected',
  CANCELLED: 'Cancelled',
};

/** Slug → friendly program title (static lookup); falls back to the slug. */
function programLabel(slug: string | null): string {
  if (!slug) return '—';
  return programDisplayTitle(slug);
}

export default async function AdminProgramChangeRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ ui?: string }>;
}) {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/admin/program-change-requests');
  const scope = await resolveAdminPageTenant(user.id);
  if (!scope.ok) redirect('/dashboard');

  const { ui } = await searchParams;

  // --- DEFAULT: design-kit review table wired into real (lean) data ---
  if (ui !== 'legacy') {
    // Tenant admins see only their org's members' requests, matching the
    // PATCH route's tenant filter; super-admins see the platform.
    const where = inheritUserOrg(scope);
    const [requests, pendingCount] = await Promise.all([
      prisma.programChangeRequest.findMany({
        where,
        take: BOARD_LIMIT,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          currentProgramSlug: true,
          requestedProgramSlug: true,
          reason: true,
          status: true,
          user: { select: { id: true, email: true, fullName: true } },
        },
      }),
      prisma.programChangeRequest.count({ where: { ...where, status: 'PENDING' } }),
    ]);

    const rows: ProgramChangeRow[] = requests.map((r) => ({
      id: r.id,
      student: r.user?.fullName ?? r.user?.email ?? r.user?.id ?? 'Unknown member',
      current: programLabel(r.currentProgramSlug),
      requested: programLabel(r.requestedProgramSlug),
      reason: r.reason?.trim() || '—',
      status: DISPLAY_STATUS[r.status] ?? 'Pending',
    }));

    return (
      <DesignSurface surface="dense">
        <ProgramChangeRequestsKit requests={rows} pendingCount={pendingCount} reviewable />
      </DesignSurface>
    );
  }

  // --- LEGACY (?ui=legacy): the proven review workspace, unchanged ---
  const legacyWhere = inheritUserOrg(scope);
  const [rows, rowTotal] = await Promise.all([
    prisma.programChangeRequest.findMany({
      where: legacyWhere,
      take: ADMIN_SSR_LIST_CAP,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, email: true, fullName: true, enrolledProgram: true } },
      },
    }),
    prisma.programChangeRequest.count({ where: legacyWhere }),
  ]);

  return (
    <>
      <PageHeader
        title="Program change requests"
        subtitle={
          isListTruncated(rows.length, ADMIN_SSR_LIST_CAP, rowTotal)
            ? showingFirstLabel(rows.length, rowTotal, 'requests')
            : 'Approve or deny enrollment changes requested by members.'
        }
      />
      <ProgramChangeRequestsAdminClient initialRows={JSON.parse(JSON.stringify(rows))} />
    </>
  );
}
