import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { unlinkedEmployerHref } from '@/lib/auth/portalGuards';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { getEmployerForUser } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';
import { getActiveProgramsResult } from '@/lib/platform/programCatalog';
import JobForm from '@/components/employer/JobForm';
import EmployerPageOpener from '@/components/employer/EmployerPageOpener';
import PortalPageFrame from '@/components/portal/PortalPageFrame';
import { getTranslations } from 'next-intl/server';
import { isReadOnlyPortalAuditHeader } from '@/lib/audit/readOnlyPortalAudit';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('employer');
  return buildPageMetadataAsync({
    title: t('postNewJobMetaTitle'),
    description: t('postNewJobMetaDesc'),
    path: '/employer/jobs/new',
  });
}

export default async function NewJobPage() {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/employer/jobs/new');
  const readOnlyAudit = isReadOnlyPortalAuditHeader(await headers());

  const ctx = await getEmployerForUser(user.id, { readOnlyAudit });
  if (!ctx) redirect(await unlinkedEmployerHref(user.id));

  const t = await getTranslations('employer');

  const employer = await prisma.employer.findUnique({
    where: { id: ctx.employerId },
    select: { companyName: true, organizationId: true },
  });

  const catalogResult = await getActiveProgramsResult(employer?.organizationId, { readOnlyAudit });
  const programSlugs = catalogResult.programs.map((p) => p.slug);

  return (
    <PortalPageFrame>
      {catalogResult.loadFailed ? <span hidden data-portal-error-state="employer-program-catalog-load" /> : null}
      <EmployerPageOpener
        kicker={t('employerPortal')}
        title={t('createJobPosting')}
        subtitle={t('createJobDesc')}
        action={
          <Link
            href="/employer/jobs/post"
            style={{
              padding: '0.5rem 1rem',
              fontSize: '0.875rem',
              fontWeight: 600,
              color: 'var(--wa-accent-text)',
              textDecoration: 'none',
            }}
          >
            {t('quickPostLink')}
          </Link>
        }
      />
      <div className="wa-pb-24 md:wa-pb-0">
        <div className="wa-overflow-y-auto wa-p-4 md:wa-overflow-visible md:wa-p-0">
          <div className="portal-card portal-card--flat wa-rounded-xl wa-p-4 md:wa-rounded-none md:wa-border-0 md:wa-bg-transparent md:wa-p-0">
            <p style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-on-surface-variant)', margin: '0 0 1rem' }}>
              {t('createJobFullEditorHint')}
            </p>
            <JobForm companyName={employer?.companyName ?? ''} programSlugs={programSlugs} />
          </div>
        </div>
      </div>
    </PortalPageFrame>
  );
}
