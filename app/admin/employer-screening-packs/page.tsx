import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { buildPageMetadata } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { resolveAdminPageTenant, withAdminPageScope, inheritUserOrg, inheritMemberOrg, inheritLeaderOrg, inheritInvitedByOrg } from '@/lib/tenant/adminPageScope';
import { prisma } from '@/lib/db/prisma';
import PageHeader from '@/components/portal/PageHeader';
import PortalPageFrame from '@/components/portal/PortalPageFrame';
import { PROGRAMS, getProgramBySlug } from '@/lib/content/programs';
import { DesignSurface } from '@/components/portal/kit';
import {
  ScreeningPacksKit,
  type ScreeningPackRow,
} from '@/components/portal/kit/pages/admin-subviews/ScreeningPacksKit';
import EmployerScreeningPacksAdmin from './EmployerScreeningPacksAdmin';
import { NewScreeningPackForm, NEW_SCREENING_PACK_ID } from '@/components/admin/NewScreeningPackForm';

export const metadata: Metadata = buildPageMetadata({
  title: 'Admin – Employer screening packs',
  description: 'Attach employer-designed screening questions to a program for member end-of-training completion.',
  path: '/admin/employer-screening-packs',
});

export const dynamic = 'force-dynamic';

/** Cap the lean kit table so first paint stays cheap. */
const PACK_LIMIT = 50;

/**
 * Summarize a pack's questions JSON into a short "Checks" label, e.g.
 * "Skills + free-text" / "Background + skills". Derived from the question
 * `type` field when present; degrades gracefully on unexpected shapes.
 */
function summarizeChecks(questionsJson: unknown): string {
  if (!Array.isArray(questionsJson) || questionsJson.length === 0) return 'No checks';

  const labelFor = (type: unknown): string => {
    switch (type) {
      case 'yes_no':
        return 'Background';
      case 'short_text':
      case 'long_text':
        return 'Free-text';
      case 'rating':
      case 'scale':
        return 'Skills';
      case 'multiple_choice':
      case 'select':
        return 'Skills';
      default:
        return 'Skills';
    }
  };

  const labels: string[] = [];
  for (const q of questionsJson) {
    const type = q && typeof q === 'object' ? (q as { type?: unknown }).type : undefined;
    const label = labelFor(type);
    if (!labels.includes(label)) labels.push(label);
  }
  if (labels.length === 0) return 'Skills';
  return labels.slice(0, 2).join(' + ');
}

/** Question count, the only real per-pack usage metric, as "N×". */
function usedTag(questionsJson: unknown): string {
  const n = Array.isArray(questionsJson) ? questionsJson.length : 0;
  return `${n}×`;
}

export default async function EmployerScreeningPacksPage({
  searchParams,
}: {
  searchParams: Promise<{ ui?: string }>;
}) {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/admin/employer-screening-packs');
  const scope = await resolveAdminPageTenant(user.id);
  if (!scope.ok) redirect('/dashboard');

  const { ui } = await searchParams;

  // --- DEFAULT: design-kit screening-packs roster wired into real lean data ---
  if (ui !== 'legacy') {
    return renderKit();
  }

  // --- LEGACY (?ui=legacy): the proven create/manage workspace, unchanged ---
  return renderLegacy();
}

/** Design-kit default: dense roster of screening packs → <ScreeningPacksKit/>. */
async function renderKit() {
  // Lean page (capped) + total count + active count, all in parallel; aggregate
  // failures degrade gracefully (the table must still render).
  const [packsResult, totalResult, activeResult] = await Promise.allSettled([
    prisma.employerScreeningPack.findMany({
      take: PACK_LIMIT,
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        employerLabel: true,
        programSlug: true,
        packTitle: true,
        questionsJson: true,
        isActive: true,
      },
    }),
    prisma.employerScreeningPack.count(),
    prisma.employerScreeningPack.count({ where: { isActive: true } }),
  ]);

  // If the core query fails, fall back to the proven legacy workspace rather
  // than rendering a fabricated/empty kit.
  if (packsResult.status === 'rejected') {
    redirect('/admin/employer-screening-packs?ui=legacy');
  }

  const packRows: ScreeningPackRow[] = packsResult.value.map((p) => {
    const program = getProgramBySlug(p.programSlug);
    return {
      id: p.id,
      employer: p.employerLabel?.trim() || 'Unknown employer',
      roleFamily: program?.title?.trim() || p.packTitle?.trim() || p.programSlug,
      checks: summarizeChecks(p.questionsJson),
      used: usedTag(p.questionsJson),
      active: p.isActive,
    };
  });

  const total = totalResult.status === 'fulfilled' ? totalResult.value : packRows.length;
  const active =
    activeResult.status === 'fulfilled'
      ? activeResult.value
      : packRows.filter((r) => r.active).length;

  return (
    <DesignSurface surface="dense">
      <ScreeningPacksKit
        packs={packRows}
        totalPacks={total}
        activePacks={active}
        manageable
        createForm={<NewScreeningPackForm programOptions={PROGRAMS.map((p) => ({ slug: p.slug, title: p.title }))} />}
        createFormHref={`#${NEW_SCREENING_PACK_ID}`}
      />
    </DesignSurface>
  );
}

/** Legacy create/manage workspace (preserved behind ?ui=legacy). */
async function renderLegacy() {
  const packs = await prisma.employerScreeningPack.findMany({
    orderBy: { updatedAt: 'desc' },
    take: 100,
  });

  return (
    <PortalPageFrame>
      <PageHeader
        title="Employer screening packs"
        subtitle="Members see the active pack for their enrolled program on Path to certification → Employer screening when they are near completion."
        breadcrumbs={[
          { label: 'Admin', href: '/admin' },
          { label: 'Employer screening' },
        ]}
      />
      <p style={{ maxWidth: 720, fontSize: '0.9rem', color: 'var(--color-on-surface-variant)', marginBottom: '1rem' }}>
        Questions are stored as JSON. See{' '}
        <Link href="/admin/career-mappings" style={{ fontWeight: 700, color: 'var(--wa-accent-text)' }}>
          Career paths
        </Link>{' '}
        for O*NET mappings. One active pack per program is recommended — deactivate older rows when publishing a new version.
      </p>
      <EmployerScreeningPacksAdmin initialPacks={packs} programOptions={PROGRAMS.map((p) => ({ slug: p.slug, title: p.title }))} />
    </PortalPageFrame>
  );
}
