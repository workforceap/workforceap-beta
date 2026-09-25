import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { resolveAdminPageTenant, withAdminPageScope, inheritUserOrg, inheritMemberOrg, inheritLeaderOrg, inheritInvitedByOrg } from '@/lib/tenant/adminPageScope';
import { prisma } from '@/lib/db/prisma';
import { getTranslations } from 'next-intl/server';
import { getProgramBySlug } from '@/lib/content/programs';
import { programDisplayTitle } from '@/lib/content/programTitle';
import {
  CareerMappingsKit,
  type CareerPathCard,
} from '@/components/portal/kit/pages/admin-subviews/CareerMappingsKit';
import { CareerMappingEditor, CAREER_MAPPING_EDITOR_ID } from '@/components/admin/CareerMappingEditor';
import CareerMappingsClient, { type AuditEntry } from './CareerMappingsClient';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('admin');
  return buildPageMetadataAsync({
    title: t('careerMappingsONET'),
    description: t('manageRoleMappings'),
    path: '/admin/career-mappings',
  });
}

const HISTORY_LIMIT = 20;
/** Cap the active-mapping scan so first paint stays cheap. */
const MAPPING_LIMIT = 2000;


export default async function AdminCareerMappingsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/admin/career-mappings');
  const scope = await resolveAdminPageTenant(user.id);
  if (!scope.ok) redirect('/dashboard');

  const params = (await searchParams) ?? {};
  const requestedUi = typeof params.ui === 'string' ? params.ui : null;

  if (requestedUi === 'legacy') {
    return <LegacyCareerMappingsView />;
  }

  // --- DEFAULT: real (lean) career-path card grid wired into CareerMappingsKit ---

  // All three reads are lean and run in parallel; aggregate failures degrade
  // gracefully so the grid still renders.
  //  - mappingRows: active (programSlug, onetCode, priority, occupation title)
  //    rows → distinct roles per program + the primary (lowest-priority) role.
  //  - partnerPairs: distinct (programSlug, employerId) hiring-intent pairs →
  //    distinct employer partners per program.
  const [mappingResult, partnerResult] = await Promise.allSettled([
    prisma.careerProgramMapping.findMany({
      where: { isActive: true },
      take: MAPPING_LIMIT,
      orderBy: [{ programSlug: 'asc' }, { priority: 'asc' }],
      select: {
        programSlug: true,
        onetCode: true,
        priority: true,
        occupation: { select: { title: true } },
      },
    }),
    prisma.employerHiringIntent.groupBy({
      by: ['programSlug', 'employerId'],
    }),
  ]);

  // Core query failed → fall back to the proven legacy workspace rather than
  // rendering a fabricated/empty kit.
  if (mappingResult.status === 'rejected') {
    console.error('[admin/career-mappings] mapping load failed', mappingResult.reason);
    return <LegacyCareerMappingsView />;
  }

  const mappingRows = mappingResult.value;

  // Distinct employer partners per program (count unique employerId per slug).
  const partnerCount = new Map<string, number>();
  if (partnerResult.status === 'fulfilled') {
    for (const row of partnerResult.value) {
      partnerCount.set(row.programSlug, (partnerCount.get(row.programSlug) ?? 0) + 1);
    }
  }

  // Aggregate per program: distinct roles + primary role title. Rows arrive
  // ordered by (programSlug, priority asc) so the first row per program is the
  // highest-priority (primary) role.
  type Agg = { roles: Set<string>; primaryRole: string };
  const byProgram = new Map<string, Agg>();
  for (const r of mappingRows) {
    let agg = byProgram.get(r.programSlug);
    if (!agg) {
      agg = { roles: new Set(), primaryRole: r.occupation?.title ?? r.onetCode };
      byProgram.set(r.programSlug, agg);
    }
    agg.roles.add(r.onetCode);
  }

  const paths: CareerPathCard[] = [...byProgram.entries()]
    .map(([slug, agg]) => {
      // Mapping rows may still carry legacy alias slugs; resolve through the
      // alias table so the card shows the catalog title, not the raw key.
      const meta = getProgramBySlug(slug);
      return {
        slug,
        program: programDisplayTitle(slug),
        role: agg.primaryRole,
        mappedRoles: agg.roles.size,
        employerPartners: partnerCount.get(slug) ?? 0,
        category: meta?.category ?? '',
        categoryColor: meta?.categoryColor ?? null,
      };
    })
    .sort((a, b) => b.mappedRoles - a.mappedRoles || a.program.localeCompare(b.program));

  const totalRoles = new Set(mappingRows.map((r) => r.onetCode)).size;
  const totalPartners =
    partnerResult.status === 'fulfilled'
      ? new Set(partnerResult.value.map((r) => r.employerId)).size
      : paths.reduce((sum, p) => sum + p.employerPartners, 0);

  return (
    <>
      {partnerResult.status === 'rejected' ? <span hidden data-portal-error-state="admin-career-mappings-partner-load" /> : null}
      <CareerMappingsKit
        paths={paths}
        totalPrograms={paths.length}
        totalRoles={totalRoles}
        totalPartners={totalPartners}
        editor={<CareerMappingEditor />}
        editorId={CAREER_MAPPING_EDITOR_ID}
      />
    </>
  );
}

/** Original O*NET mapping workspace (search + AI matches + history). Behind ?ui=legacy. */
async function LegacyCareerMappingsView() {
  // Last 20 mapping audit entries for the inline History panel.
  const rows = await prisma.auditLog.findMany({
    where: {
      targetType: 'career_program_mapping',
      action: {
        in: [
          'mapping_created',
          'mapping_updated',
          'mapping_deactivated',
          'mapping_reactivated',
          'mapping_deleted',
        ],
      },
    },
    orderBy: { createdAt: 'desc' },
    take: HISTORY_LIMIT,
    include: {
      actor: { select: { fullName: true, email: true } },
    },
  });

  const history: AuditEntry[] = rows.map((r) => ({
    id: r.id,
    action: r.action,
    targetId: r.targetId,
    actorName: r.actor?.fullName ?? r.actor?.email ?? null,
    metadata: (r.metadata as Record<string, unknown> | null) ?? null,
    createdAt: r.createdAt.toISOString(),
  }));

  return <CareerMappingsClient history={history} />;
}
