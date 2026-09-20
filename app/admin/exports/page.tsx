import type { Metadata } from 'next';
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
        newTab: true,
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
        {/* Member Training Export */}
        <section style={{ marginBottom: '2.5rem' }}>
          <div className="portal-card portal-card--flat" style={{ padding: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
              <div style={{ padding: '0.5rem', background: 'rgba(173,44,77,0.1)', borderRadius: '0.5rem' }}>
                <span className="material-symbols-outlined" style={{ color: 'var(--color-accent)', fontSize: '1.25rem' }} aria-hidden="true">download</span>
              </div>
              <div>
                <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--color-on-surface)', margin: 0 }}>
                  Member Training Report
                </h2>
                <p style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', margin: '0.125rem 0 0' }}>
                  Demographics, enrollment, course progress, Coursera access, certifications, placements, and WS4 eligibility fields.
                </p>
              </div>
            </div>

            <AdminExportForm programs={programs} stages={stages} />
          </div>
        </section>

        <section id="eligibility-datasheet" style={{ marginBottom: '2.5rem' }}>
          <EligibilityDatasheetPanel previewRows={previewRows} />
        </section>

        {/* Funder program summary (grant reporting) */}
        <section style={{ marginBottom: '2.5rem' }}>
          <div className="portal-card portal-card--flat" style={{ padding: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
              <div style={{ padding: '0.5rem', background: 'rgba(128,217,159,0.15)', borderRadius: '0.5rem' }}>
                <span
                  className="material-symbols-outlined"
                  style={{ color: '#80d99f', fontSize: '1.25rem' }}
                  aria-hidden="true"
                >
                  analytics
                </span>
              </div>
              <div>
                <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--color-on-surface)', margin: 0 }}>
                  {t('exportFunderCsvTitle')}
                </h2>
                <p style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', margin: '0.125rem 0 0' }}>
                  {t('exportFunderCsvDescription')}
                </p>
              </div>
            </div>
            <a
              href="/api/admin/funder-program-summary"
              className="btn btn-outline"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '1rem' }} aria-hidden="true">
                download
              </span>
              {t('exportFunderCsv')}
            </a>
          </div>
        </section>

        {/* Program Catalog Export (existing TWC) */}
        <section style={{ marginBottom: '2.5rem' }}>
          <div className="portal-card portal-card--flat" style={{ padding: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
              <div style={{ padding: '0.5rem', background: 'rgba(59,130,246,0.1)', borderRadius: '0.5rem' }}>
                <span className="material-symbols-outlined" style={{ color: '#3b82f6', fontSize: '1.25rem' }} aria-hidden="true">school</span>
              </div>
              <div>
                <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--color-on-surface)', margin: 0 }}>
                  Program Catalog
                </h2>
                <p style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', margin: '0.125rem 0 0' }}>
                  All active programs with costs, duration, and certifications. Used for state agency submissions.
                </p>
              </div>
            </div>
            <a
              href="/api/admin/programs/export-twc"
              download
              className="btn btn-outline"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '1rem' }} aria-hidden="true">download</span>
              Download Program Catalog CSV
            </a>
          </div>
        </section>

        {/* What's included explainer */}
        <section style={{ marginBottom: '6rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--color-on-surface)', marginBottom: '1rem' }}>
            What&rsquo;s in the Member Training Report?
          </h3>
          <div className="portal-grid-3col" style={{ gap: '1rem' }}>
            {[
              { icon: 'person', title: 'Demographics', items: 'Name, email, phone, state, city, zip, DOB, education, employment, veteran status, ethnicity' },
              { icon: 'school', title: 'Training Progress', items: 'Program enrolled, enrollment date, courses completed, completion %, individual course names, funding source' },
              { icon: 'workspace_premium', title: 'Outcomes & Compliance', items: 'Coursera access status, assessment score, WIOA signal & review status, certifications earned, placement details, WS4 eligibility screening fields' },
            ].map((col) => (
              <div key={col.title} style={{ padding: '1rem', background: 'var(--surface-container)', borderRadius: '0.75rem' }}>
                <span className="material-symbols-outlined" style={{ color: 'var(--color-accent)', fontSize: '1.25rem', marginBottom: '0.5rem', display: 'block' }} aria-hidden="true">{col.icon}</span>
                <h4 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-on-surface)', marginBottom: '0.375rem' }}>{col.title}</h4>
                <p style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', lineHeight: 1.5, margin: 0 }}>{col.items}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </PortalPageFrame>
  );
}
