import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Award, BarChart3, Download, GraduationCap, UserRound } from 'lucide-react';
import { formatPublicAssistancePrograms } from '@/lib/apply/publicAssistance';
import { redirect } from 'next/navigation';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { resolveAdminPageTenant, withAdminPageScope, inheritUserOrg, inheritMemberOrg, inheritLeaderOrg, inheritInvitedByOrg } from '@/lib/tenant/adminPageScope';
import { PROGRAMS } from '@/lib/content/programs';
import { PIPELINE_STAGE_LABELS } from '@/lib/pipeline/stage';
import PortalPageFrame from '@/components/portal/PortalPageFrame';
import PageHeader from '@/components/portal/PageHeader';
import { getTranslations } from 'next-intl/server';
import AdminExportForm from './AdminExportForm';
import EligibilityDatasheetPanel from '@/components/admin/EligibilityDatasheetPanel';
import { DesignSurface } from '@/components/portal/kit';
import {
  ExportsKit,
  type ExportOption,
} from '@/components/portal/kit/pages/admin-subviews/ExportsKit';
import { MEMBER_ONLY_WHERE } from '@/lib/admin/memberOnlyWhere';

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadataAsync({
  title: 'Export Data',
  description: 'Export member training data for state reporting and compliance.',
  path: '/admin/exports',
});
}

export default async function AdminExportsPage({
  searchParams,
}: {
  searchParams: Promise<{ ui?: string }>;
}) {
  const user = await getUser();
  if (!user) redirect('/login');
  const scope = await resolveAdminPageTenant(user.id);
  if (!scope.ok) redirect('/dashboard');

  const { ui: requestedUi } = await searchParams;

  const programs = PROGRAMS.map((p) => ({ slug: p.slug, title: p.title }));
  const stages = Object.entries(PIPELINE_STAGE_LABELS).map(([value, label]) => ({
    value,
    label,
  }));
  const t = await getTranslations('admin');

  const previewMembers = await withAdminPageScope(scope, (db) =>
    db.user.findMany({
      where: {
        deletedAt: null,
        AND: [MEMBER_ONLY_WHERE, { applyEligibilityScreenings: { some: {} } }],
      },
      orderBy: { updatedAt: 'desc' },
      take: 25,
      select: {
        id: true,
        fullName: true,
        email: true,
        partnerReferrals: {
          take: 1,
          orderBy: { referredAt: 'desc' },
          select: { partner: { select: { name: true } } },
        },
        applyEligibilityScreenings: {
          take: 1,
          orderBy: { createdAt: 'desc' },
          select: {
            receivingUnemployment: true,
            layoffCompany: true,
            snapWic: true,
            publicAssistancePrograms: true,
            publicAssistanceHelpRequested: true,
            hearAbout: true,
            createdAt: true,
          },
        },
      },
    }),
  );

  const previewRows = previewMembers.map((m) => {
    const s = m.applyEligibilityScreenings[0];
    return {
      id: m.id,
      fullName: m.fullName,
      email: m.email,
      partnerName: m.partnerReferrals[0]?.partner.name ?? null,
      receivingUnemployment: s?.receivingUnemployment ?? null,
      layoffCompany: s?.layoffCompany ?? null,
      snapWic: s?.snapWic ?? null,
      publicAssistancePrograms: s?.publicAssistancePrograms?.length
        ? formatPublicAssistancePrograms(s.publicAssistancePrograms)
        : null,
      publicAssistanceHelpRequested: s?.publicAssistanceHelpRequested ?? null,
      hearAbout: s?.hearAbout ?? null,
      screeningAt: s?.createdAt
        ? s.createdAt.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })
        : null,
    };
  });

  // --- DEFAULT: kit card-grid of the REAL export options this page exposes ---
  if (requestedUi !== 'legacy') {
    const exports: ExportOption[] = [
      {
        id: 'member-training-report',
        title: 'Member Training Report',
        description: 'Demographics, progress, certs, placements & eligibility · filterable CSV',
        href: '/admin/exports?ui=legacy',
        iconKey: 'filters',
        tone: 'accent',
      },
      {
        id: 'eligibility-datasheet',
        title: 'Eligibility screening datasheet',
        description: 'WS4 fields · in-admin table + CSV (not Google Sheets)',
        href: '/admin/exports?ui=legacy#eligibility-datasheet',
        iconKey: 'csv',
        tone: 'gold',
      },
      {
        id: 'funder-program-summary',
        title: t('exportFunderCsvTitle'),
        description: 'Grant reporting · per-program enrollment, completion & placements',
        href: '/api/admin/funder-program-summary',
        iconKey: 'csv',
        tone: 'success',
        download: true,
        actionLabel: t('exportFunderCsvDownload'),
      },
      {
        id: 'program-catalog',
        title: 'Program Catalog',
        description: 'State agency submissions · costs, duration & certifications',
        href: '/api/admin/programs/export-twc',
        iconKey: 'roster',
        tone: 'info',
        download: true,
      },
      // Outcomes snapshots used to be listed again on /admin/outcomes; this is
      // now their only list (admin audit 2026-09-20, Outcomes).
      {
        id: 'outcomes-csv',
        title: 'Outcomes CSV',
        description: 'Board-ready · funnel waterfall (counts + conversion), all time',
        href: '/api/admin/outcomes/snapshot?period=all-time&format=csv',
        iconKey: 'csv',
        tone: 'success',
        download: true,
      },
      {
        id: 'board-packet-pdf',
        title: 'Board meeting PDF',
        description: 'Printable snapshot with KPIs, cohorts and methodology notes, all time',
        href: '/api/admin/outcomes/snapshot?period=all-time&format=pdf',
        iconKey: 'download',
        tone: 'muted',
        download: true,
      },
    ];

    return (
      <DesignSurface surface="dense">
        <ExportsKit exports={exports} />
      </DesignSurface>
    );
  }

  // --- LEGACY (?ui=legacy): the existing export workspace with filter form ---
  return (
    <PortalPageFrame>
      <div style={{ marginBottom: '2rem' }}>
        <PageHeader
          title="Export Data"
          subtitle="Download member training data as CSV. Filter by state, program, pipeline stage, and more."
        />
      </div>

      <div style={{ padding: '0 1.5rem' }}>
        {/*
          Admin audit §6.6: one icon treatment (a neutral `.wa-kit-tone-icon`
          chip with a lucide glyph, kit tokens only) and one verb per row type.
          Every file row here says "Download" and carries the `download`
          attribute; "Open" is reserved for in-portal pages (the kit grid's
          Member Training Report tile). No hex, no legacy pre-kit colour tokens.
        */}
        {/* Member Training Export */}
        <section style={{ marginBottom: '2.5rem' }}>
          <div className="wa-kit-card" data-export-section="member-training-report">
            <ExportSectionHeader
              icon={<Download size={18} />}
              title="Member Training Report"
              description="Demographics, enrollment, course progress, Coursera access, certifications, placements, and WS4 eligibility fields."
            />

            <AdminExportForm programs={programs} stages={stages} />
          </div>
        </section>

        <section id="eligibility-datasheet" style={{ marginBottom: '2.5rem' }}>
          <EligibilityDatasheetPanel previewRows={previewRows} />
        </section>

        {/* Funder program summary (grant reporting) */}
        <section style={{ marginBottom: '2.5rem' }}>
          <div className="wa-kit-card" data-export-section="funder-program-summary">
            <ExportSectionHeader
              icon={<BarChart3 size={18} />}
              title={t('exportFunderCsvTitle')}
              description={t('exportFunderCsvDescription')}
            />
            <ExportDownloadLink href="/api/admin/funder-program-summary">
              {t('exportFunderCsvDownload')}
            </ExportDownloadLink>
          </div>
        </section>

        {/* Program Catalog Export (existing TWC) */}
        <section style={{ marginBottom: '2.5rem' }}>
          <div className="wa-kit-card" data-export-section="program-catalog">
            <ExportSectionHeader
              icon={<GraduationCap size={18} />}
              title="Program Catalog"
              description="All active programs with costs, duration, and certifications. Used for state agency submissions."
            />
            <ExportDownloadLink href="/api/admin/programs/export-twc">Download program catalog CSV</ExportDownloadLink>
          </div>
        </section>

        {/* What's included explainer */}
        <section style={{ marginBottom: '6rem' }}>
          <h3 style={{ fontSize: 'var(--wa-type-body)', fontWeight: 600, color: 'var(--wa-text)', marginBottom: '1rem' }}>
            What&rsquo;s in the Member Training Report?
          </h3>
          <div className="portal-grid-3col" style={{ gap: '1rem' }}>
            {[
              { icon: <UserRound size={18} />, title: 'Demographics', items: 'Name, email, phone, state, city, zip, DOB, education, employment, veteran status, ethnicity' },
              { icon: <GraduationCap size={18} />, title: 'Training Progress', items: 'Program enrolled, enrollment date, courses completed, completion %, individual course names, funding source' },
              { icon: <Award size={18} />, title: 'Outcomes & Compliance', items: 'Coursera access status, assessment score, WIOA signal & review status, certifications earned, placement details, WS4 eligibility screening fields' },
            ].map((col) => (
              <div key={col.title} className="wa-kit-card wa-kit-card--sm" style={{ display: 'grid', gap: '0.5rem' }}>
                <span className="wa-kit-tone-icon" aria-hidden>{col.icon}</span>
                <h4 style={{ fontSize: 'var(--wa-type-meta)', fontWeight: 600, color: 'var(--wa-text)', margin: 0 }}>{col.title}</h4>
                <p className="wa-kit-meta" style={{ lineHeight: 1.5, margin: 0 }}>{col.items}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </PortalPageFrame>
  );
}

/** One icon treatment for every export row: neutral kit chip, lucide glyph. */
function ExportSectionHeader({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
      <span className="wa-kit-tone-icon" aria-hidden>{icon}</span>
      <div style={{ minWidth: 0 }}>
        <h2 style={{ fontSize: 'var(--wa-type-body)', fontWeight: 600, color: 'var(--wa-text)', margin: 0 }}>{title}</h2>
        <p className="wa-kit-meta" style={{ margin: '0.125rem 0 0' }}>{description}</p>
      </div>
    </div>
  );
}

/** File rows share one verb ("Download …") and one affordance: a real download link. */
function ExportDownloadLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      download
      className="btn btn-outline"
      data-export-action="download"
      style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
    >
      <Download size={16} aria-hidden />
      {children}
    </a>
  );
}
