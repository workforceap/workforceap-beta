import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import {
  resolveAdminPageTenant,
  withAdminPageScope,
} from '@/lib/tenant/adminPageScope';
import { loadCounselorRoster, parseCounselorRosterQuery, COUNSELOR_PAGE_SIZE } from '@/lib/admin/counselorRoster';
import PageHeader from '@/components/portal/PageHeader';
import AdminCounselorsClient from '@/components/admin/AdminCounselorsClient';
import { AddCounselorForm } from '@/components/admin/AddCounselorForm';
import {
  CounselorsRosterKit,
  type CounselorRow,
} from '@/components/portal/kit/pages/admin-subviews/CounselorsRosterKit';

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadataAsync({
    title: 'Counselors',
    description: 'Staff caseload & performance — WorkforceAP counselors and advisors.',
    path: '/admin/counselors',
  });
}

/** Build initials from a full name (e.g. "Sarah Chen" → "SC"). */
function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '??';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Affiliation/title caption for the counselor name cell. */
function captionFor(args: {
  affiliation: string;
  partnerName: string | null;
  title: string | null;
}): string {
  const org =
    args.affiliation === 'independent'
      ? 'Independent Advisor'
      : args.affiliation === 'community_ambassador'
        ? 'Community Ambassador'
        : args.partnerName ?? 'WorkforceAP';
  return args.title ? `${org} · ${args.title}` : org;
}

export default async function AdminCounselorsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/admin/counselors');

  const scope = await resolveAdminPageTenant(user.id);
  if (!scope.ok) redirect('/dashboard');

  const params = (await searchParams) ?? {};
  const requestedUi = typeof params.ui === 'string' ? params.ui : null;

  // Legacy → the original add-counselor form + flat roster list.
  // Active partners for the add-counselor form's affiliation picker
  // (tenant-scoped for org admins via withAdminPageScope).
  const loadPartners = () =>
    withAdminPageScope(scope, (db) =>
      db.partner.findMany({
        take: 5000,
        where: { active: true },
        orderBy: { name: 'asc' },
        select: { id: true, name: true },
      }),
    );

  if (requestedUi === 'legacy') {
    const partners = await loadPartners();

    return (
      <div className="admin-main-content">
        <PageHeader
          title="Counselors & Advisors"
          subtitle="Manage WorkforceAP staff, partner-affiliated counselors, and independent advisors."
        />
        <AdminCounselorsClient partners={partners} />
      </div>
    );
  }

  // --- DEFAULT: real (lean) caseload & performance roster (design kit) ---

  const query = parseCounselorRosterQuery(params);
  const [roster, partners] = await Promise.all([
    withAdminPageScope(scope, (db) => loadCounselorRoster(db, scope, query)).catch((error: unknown) => {
      console.error('[admin/counselors] roster load failed', error);
      return null;
    }),
    // A partner-list failure only hides the add form; the roster still renders.
    loadPartners().catch((error: unknown) => {
      console.error('[admin/counselors] partner list load failed', error);
      return null;
    }),
  ]);
  if (!roster) {
    return <div className="admin-main-content" data-portal-error-state="admin-counselors-assignment-load">
      <PageHeader title="Counselors & Advisors" subtitle="Counselor reporting is temporarily unavailable." />
      <div role="alert">
        <p>We could not load counselor caseloads. No reporting totals are shown.</p>
        <p><a href="/admin/counselors">Try loading the roster again</a></p>
        <p><a href="/admin/counselors?ui=legacy">Open counselor management</a></p>
      </div>
    </div>;
  }
  const { counselors: counselorRecords, aggregates: aggMap, total, avgCaseload, atRiskOwned } = roster;

  // Load tone vs the cohort average: >15% over avg = Over, >15% under = Light.
  const overBand = avgCaseload * 1.15;
  const lightBand = avgCaseload * 0.85;

  const counselors: CounselorRow[] = counselorRecords
    .map((c) => {
      const agg = aggMap.get(c.id) ?? { caseload: 0, atRisk: 0, placements: 0 };
      const name = c.user.fullName?.trim() || 'Unnamed counselor';
      const load: CounselorRow['load'] =
        avgCaseload === 0
          ? 'Balanced'
          : agg.caseload > overBand
            ? 'Over'
            : agg.caseload < lightBand
              ? 'Light'
              : 'Balanced';
      return {
        id: c.id,
        name,
        initials: initialsFrom(name),
        caption: captionFor({
          affiliation: c.affiliation,
          partnerName: c.partner?.name ?? null,
          title: c.title,
        }),
        caseload: agg.caseload,
        atRisk: agg.atRisk,
        placements: agg.placements,
        // First-response timing isn't readily aggregable without a heavy
        // per-thread scan over the pooler, so we surface "—" rather than fake it.
        avgResponse: '—',
        load,
      };
    })
    .sort((a, b) => b.caseload - a.caseload);

  return (
    <>
      <CounselorsRosterKit
        counselors={counselors}
        currentPage={roster.page}
        pageSize={COUNSELOR_PAGE_SIZE}
        matchingTotal={roster.matchingTotal}
        searchQuery={query.search}
        total={total}
        avgCaseload={avgCaseload}
        atRiskOwned={atRiskOwned}
        avgResponse="—"
        addCounselor={partners ? <AddCounselorForm partners={partners} /> : undefined}
      />
    </>
  );
}
