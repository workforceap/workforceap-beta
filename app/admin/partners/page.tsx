import Link from 'next/link';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db/prisma';
import { LOOKUP_LIST_CAP } from '@/lib/db/queryCaps';
import { getUser } from '@/lib/auth/server';
import { resolveAdminPageTenant, withAdminPageScope, inheritUserOrg, inheritMemberOrg, inheritLeaderOrg, inheritInvitedByOrg } from '@/lib/tenant/adminPageScope';
import { isSuperAdmin } from '@/lib/auth/roles';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import { withTenantScope } from '@/lib/tenant/withTenantScope';
import PartnersTableClient from '@/components/admin/PartnersTableClient';
import PageHeader from '@/components/portal/PageHeader';
import {
  PartnersDirectoryKit,
  type PartnerCard,
} from '@/components/portal/kit/pages/admin-subviews/PartnersDirectoryKit';
import { PROGRAMS } from '@/lib/content/programs';

import type { Metadata } from 'next';
import { buildPageMetadataAsync } from '@/app/seo';

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadataAsync({
    title: 'Admin - Partners',
    description: 'Manage partner organizations.',
    path: '/admin/partners',
  });
}

/** Cap the lean directory so first paint stays cheap. */
const PARTNER_LIMIT = 60;

/** Legacy management table data (unchanged from the prior default render). */
async function loadAdminPartnersData(scope: import("@/lib/tenant/adminPageScope").AdminPageTenantOk) {
  const leaderOrg = inheritLeaderOrg(scope);
  return withAdminPageScope(scope, (db) => Promise.all([
    db.partner.findMany({
      take: LOOKUP_LIST_CAP,
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        slug: true,
        contactName: true,
        contactEmail: true,
        contactPhone: true,
        active: true,
        status: true,
        notes: true,
        logoUrl: true,
        brandColor: true,
        partnerType: true,
        referralCode: true,
        sponsoredEnrollment: true,
        sponsorshipFundingSource: true,
        sponsorshipTermLabel: true,
        enrollmentPageEnabled: true,
        enrollmentHeadline: true,
        enrollmentBlurb: true,
        schoolDistrict: true,
        programCatalog: { select: { programSlug: true } },
        _count: {
          select: {
            counselors: true,
            referrals: true,
          },
        },
      },
    }),
    db.subgroup.findMany({
      take: LOOKUP_LIST_CAP,
      where: { ...leaderOrg },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, type: true, partnerId: true },
    }),
  ] as const));
}

type PartnersPayload = Awaited<ReturnType<typeof loadAdminPartnersData>>;

/** The prior default render, preserved behind `?ui=legacy`. */
async function LegacyPartnersTable({ userId, scope }: { userId: string; scope: import("@/lib/tenant/adminPageScope").AdminPageTenantOk }) {
  const superAdmin = scope.superAdmin;

  let partners: PartnersPayload[0];
  let subgroups: PartnersPayload[1];
  let loadError: string | null = null;

  try {
    ;[partners, subgroups] = await loadAdminPartnersData(scope);
  } catch (e) {
    console.error('[admin/partners] load failed', e);
    loadError =
      e instanceof Error
        ? e.message
        : 'Database error while loading partners. If this persists after deploy, run pending Prisma migrations (e.g. referral_code on partners).';
    partners = [] as PartnersPayload[0];
    subgroups = [] as PartnersPayload[1];
  }

  return (
    <div style={{ paddingTop: '1.5rem' }}>
      <PageHeader
        title="Partner Organizations"
        action={
          <Link
            href="/admin/partners/new"
            style={{
              padding: '0.5rem 1rem',
              background: 'var(--color-accent)',
              color: 'white',
              borderRadius: '6px',
              textDecoration: 'none',
              fontWeight: 600,
            }}
          >
            Add Partner
          </Link>
        }
      />

      {loadError ? (
        <div
          className="admin-empty-state"
          data-portal-error-state="admin-partners-load"
          style={{ borderColor: 'rgba(185, 28, 28, 0.35)', background: 'rgba(254, 242, 242, 0.6)' }}
          role="alert"
        >
          <h3>Could not load partners</h3>
          <p style={{ marginBottom: '0.75rem' }}>{loadError}</p>
          <p style={{ fontSize: '0.9rem', color: 'var(--color-on-surface-variant)' }}>
            Common fix: apply the latest database migration on your hosting environment, then refresh this page.
          </p>
        </div>
      ) : null}

      {!loadError && partners.length === 0 ? (
        <div className="admin-empty-state">
          <h3>No partner organizations yet</h3>
          <p>
            Partner organizations refer candidates to WorkforceAP. Each partner gets their own portal login, referral
            tracking, and milestone notifications for their members.
          </p>
          <Link href="/admin/partners/new" className="btn btn-primary">
            Add Partner
          </Link>
        </div>
      ) : !loadError ? (
        <PartnersTableClient
          partners={partners}
          subgroups={subgroups}
          superAdmin={superAdmin}
          programs={PROGRAMS.map((p) => ({ slug: p.slug, title: p.title }))}
        />
      ) : null}
    </div>
  );
}

export default async function AdminPartnersPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/admin/partners');
  const scope = await resolveAdminPageTenant(user.id);
  if (!scope.ok) redirect('/dashboard');
  const orgId = await getActorOrganizationId(user.id);

  const params = (await searchParams) ?? {};
  const requestedUi = typeof params.ui === 'string' ? params.ui : null;

  // Legacy → render the full management table (preserves the prior default).
  if (requestedUi === 'legacy') {
    return <LegacyPartnersTable userId={user.id} scope={scope} />;
  }

  // --- DEFAULT: real (lean) partner directory wired into PartnersDirectoryKit ---

  // Lean directory (name + referral count) + full count + placed-per-partner,
  // all in parallel. Aggregate failures degrade gracefully (the grid still
  // renders; placed counts just fall back to 0).
  const [partnersResult, totalResult, placedResult, referralTotalResult, placedTotalResult] = await Promise.allSettled([
    withAdminPageScope(scope, (db) =>
      db.partner.findMany({
        take: PARTNER_LIMIT,
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          slug: true,
          active: true,
          status: true,
          partnerType: true,
          referralCode: true,
          enrollmentPageEnabled: true,
          sponsoredEnrollment: true,
          _count: { select: { referrals: true } },
        },
      }),
    ),
    withAdminPageScope(scope, (db) => db.partner.count()),
    // "Placed" per partner = referred members whose memberStatus is 'placed'.
    prisma.partnerReferral.groupBy({
      by: ['partnerId'],
      where: { member: { memberStatus: 'placed' } },
      _count: { _all: true },
    }),
    prisma.partnerReferral.count(),
    prisma.partnerReferral.count({ where: { member: { memberStatus: 'placed' } } }),
  ]);

  // If the core directory query fails, fall back to the legacy management table
  // rather than rendering a fabricated/empty kit.
  if (partnersResult.status === 'rejected') {
    console.error('[admin/partners] directory load failed', partnersResult.reason);
    return <LegacyPartnersTable userId={user.id} scope={scope} />;
  }

  const rows = partnersResult.value;
  const total = totalResult.status === 'fulfilled' ? totalResult.value : rows.length;

  const placedMap = new Map<string, number>();
  if (placedResult.status === 'fulfilled') {
    for (const row of placedResult.value) placedMap.set(row.partnerId, row._count._all);
  }

  const partners: PartnerCard[] = rows.map((p) => ({
    id: p.id,
    name: p.name,
    slug: p.slug,
    referrals: p._count.referrals,
    placed: placedMap.get(p.id) ?? 0,
    active: p.active && p.status === 'active',
    status: p.status,
    partnerType: p.partnerType,
    referralCode: p.referralCode,
    enrollmentPageEnabled: p.enrollmentPageEnabled,
    sponsoredEnrollment: p.sponsoredEnrollment,
  }));

  return (
    <PartnersDirectoryKit
      partners={partners}
      total={total}
      totalReferrals={referralTotalResult.status === 'fulfilled' ? referralTotalResult.value : undefined}
      totalPlaced={placedTotalResult.status === 'fulfilled' ? placedTotalResult.value : undefined}
    />
  );
}
