import type { Metadata } from 'next';
import { redirect, notFound } from 'next/navigation';
import { Briefcase, Award, Calendar, Handshake, FileCheck2 } from 'lucide-react';
import { buildPageMetadata } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { resolveAdminPageTenant, withAdminPageScope } from '@/lib/tenant/adminPageScope';
import PageHeader from '@/components/portal/PageHeader';
import PortalPageFrame from '@/components/portal/PortalPageFrame';
import { DesignSurface, CardHead, StatSparkTile, StatusTag, type KitTone } from '@/components/portal/kit';

type Props = { params: Promise<{ id: string }> };

const CERT_SLUG_NAMES: Record<string, string> = {
  'google-it-support': 'Google IT Support',
  'comptia-a-plus': 'CompTIA A+',
  'aws-cloud-practitioner': 'AWS Cloud Practitioner',
  'google-project-management': 'Google Project Management',
  'ibm-data-analyst': 'IBM Data Analyst',
};

function certSlugToName(slug: string): string {
  return CERT_SLUG_NAMES[slug] ?? slug;
}

const TIER_LABELS: Record<string, string> = {
  basic: 'Basic',
  partner: 'Hiring Partner',
};

/** Mirrors the status label used on the employers list (list page has 3 states; collapsing to active/inactive here hid "Pending"). */
function accountStatusLabel(status: string): string {
  if (status === 'active') return 'Active';
  if (status === 'pending_approval') return 'Pending approval';
  return 'Inactive';
}

function accountStatusTone(status: string): KitTone {
  if (status === 'active') return 'ok';
  if (status === 'pending_approval') return 'warn';
  return 'muted';
}

function getPartnershipTier(
  placementAgreementSigned: boolean,
  hiringPipelineActive: boolean,
): { label: string; tone: KitTone } {
  if (placementAgreementSigned && hiringPipelineActive) {
    return { label: 'Strategic Hiring Partner', tone: 'ok' };
  }
  if (placementAgreementSigned) {
    return { label: 'Hiring Partner', tone: 'info' };
  }
  if (hiringPipelineActive) {
    return { label: 'Active Pipeline', tone: 'warn' };
  }
  return { label: 'Standard', tone: 'muted' };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  try {
    const user = await getUser();
    const scope = user ? await resolveAdminPageTenant(user.id) : { ok: false as const };
    const employer = scope.ok
      ? await withAdminPageScope(scope, (db) =>
          db.employer.findFirst({ where: { id }, select: { companyName: true } }),
        )
      : null;
    return buildPageMetadata({
      title: employer ? `Employer: ${employer.companyName}` : 'Employer Detail',
      description: 'Employer pipeline and partnership details.',
      path: `/admin/employers/${id}`,
    });
  } catch {
    return buildPageMetadata({
      title: 'Employer Detail',
      description: 'Employer pipeline and partnership details.',
      path: `/admin/employers/${id}`,
    });
  }
}

export default async function AdminEmployerDetailPage({ params }: Props) {
  const user = await getUser();
  if (!user) redirect(`/login?redirectTo=/admin/employers`);
  const scope = await resolveAdminPageTenant(user.id);
  if (!scope.ok) redirect('/dashboard');

  const { id } = await params;

  // findFirst (not findUnique): withTenantScope injects organizationId,
  // which is not an Employer unique-where field.
  const employer = await withAdminPageScope(scope, (db) =>
    db.employer.findFirst({
      where: { id },
      include: {
        user: { select: { email: true, fullName: true } },
        _count: { select: { jobs: true } },
      },
    }),
  );

  if (!employer) notFound();

  const pt = getPartnershipTier(employer.placementAgreementSigned, employer.hiringPipelineActive);
  const partnerSince = employer.createdAt.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });

  return (
    <PortalPageFrame>
      <PageHeader
        breadcrumbs={[{ label: 'Employers', href: '/admin/employers' }, { label: employer.companyName }]}
        title={employer.companyName}
        subtitle={`${employer.industry ?? 'Unknown industry'} · ${employer.companySize ?? 'Unknown size'}`}
      />

      <DesignSurface surface="dense">
        {/* KPI row */}
        <div className="wa-grid wa-grid-cols-2 lg:wa-grid-cols-3 wa-gap-3" style={{ marginBottom: 20 }}>
          <StatSparkTile icon={<Briefcase size={16} />} label="Jobs Posted" value={employer._count.jobs} />
          <StatSparkTile icon={<Award size={16} />} label="Target Certifications" value={employer.targetCertifications.length} />
          <StatSparkTile icon={<Calendar size={16} />} label="Partner Since" value={partnerSince} />
        </div>

        {/* Partnership Overview */}
        <div className="wa-kit-card" style={{ marginBottom: 20 }}>
          <CardHead title="Partnership Overview" />

          <div className="wa-grid wa-grid-cols-1 md:wa-grid-cols-3 wa-gap-3">
            <div className="wa-kit-card wa-kit-card--sm" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className="wa-flex wa-items-center wa-gap-2">
                <Handshake size={14} aria-hidden style={{ color: 'var(--wa-muted)' }} />
                <span className="wa-kit-stat-label">Partnership Tier</span>
              </div>
              <div>
                <StatusTag tone={pt.tone}>{pt.label}</StatusTag>
              </div>
            </div>

            <div className="wa-kit-card wa-kit-card--sm" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className="wa-flex wa-items-center wa-gap-2">
                <Briefcase size={14} aria-hidden style={{ color: 'var(--wa-muted)' }} />
                <span className="wa-kit-stat-label">Hiring Pipeline</span>
              </div>
              <div>
                <StatusTag tone={employer.hiringPipelineActive ? 'ok' : 'muted'}>
                  {employer.hiringPipelineActive ? 'Active' : 'Inactive'}
                </StatusTag>
              </div>
            </div>

            <div className="wa-kit-card wa-kit-card--sm" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className="wa-flex wa-items-center wa-gap-2">
                <FileCheck2 size={14} aria-hidden style={{ color: 'var(--wa-muted)' }} />
                <span className="wa-kit-stat-label">Placement Agreement</span>
              </div>
              <div>
                <StatusTag tone={employer.placementAgreementSigned ? 'info' : 'muted'}>
                  {employer.placementAgreementSigned ? 'Signed' : 'Not signed'}
                </StatusTag>
              </div>
            </div>
          </div>

          {/* Target certifications */}
          {employer.targetCertifications.length > 0 ? (
            <div style={{ marginTop: 18 }}>
              <div className="wa-kit-stat-label" style={{ marginBottom: 10 }}>
                Target Certifications
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {employer.targetCertifications.map((slug) => (
                  <StatusTag key={slug} tone="info">
                    {certSlugToName(slug)}
                  </StatusTag>
                ))}
              </div>
            </div>
          ) : (
            <p style={{ marginTop: 16, fontSize: 13, color: 'var(--wa-muted)', fontStyle: 'italic' }}>
              No target certifications specified.
            </p>
          )}
        </div>

        {/* Company details */}
        <div className="wa-kit-card">
          <CardHead title="Company Details" />
          <dl className="wa-grid wa-grid-cols-1 md:wa-grid-cols-2 wa-gap-4">
            {[
              { label: 'Contact name', value: employer.contactName },
              { label: 'Contact email', value: employer.contactEmail },
              { label: 'Contact phone', value: employer.contactPhone ?? '—' },
              { label: 'Website', value: employer.companyWebsite ?? '—' },
              { label: 'Industry', value: employer.industry ?? '—' },
              { label: 'Company size', value: employer.companySize ?? '—' },
              { label: 'Portal user', value: `${employer.user.fullName} (${employer.user.email})` },
              { label: 'Account tier', value: TIER_LABELS[employer.tier] ?? employer.tier },
            ].map((row) => (
              <div key={row.label}>
                <dt className="wa-kit-stat-label" style={{ marginBottom: 4 }}>
                  {row.label}
                </dt>
                <dd style={{ fontSize: 14, color: 'var(--wa-text)', margin: 0, wordBreak: 'break-all' }}>
                  {row.value}
                </dd>
              </div>
            ))}
            <div>
              <dt className="wa-kit-stat-label" style={{ marginBottom: 4 }}>
                Status
              </dt>
              <dd style={{ margin: 0 }}>
                <StatusTag tone={accountStatusTone(employer.status)}>{accountStatusLabel(employer.status)}</StatusTag>
              </dd>
            </div>
          </dl>
        </div>
      </DesignSurface>
    </PortalPageFrame>
  );
}
