import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { unlinkedEmployerHref } from '@/lib/auth/portalGuards';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { getEmployerForUser } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';
import EmployerPageOpener from '@/components/employer/EmployerPageOpener';
import PortalPageFrame from '@/components/portal/PortalPageFrame';
import { getTranslations } from 'next-intl/server';
import EmployerJobPostForm from '@/components/employer/EmployerJobPostForm';
import { EMPLOYER_TIERS, EMPLOYER_PRICING_ENFORCED } from '@/lib/stripe/client';

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadataAsync({
    title: 'Post a Job',
    description: 'Publish a job posting.',
    path: '/employer/jobs/post',
  });
}

export default async function EmployerJobPostPage() {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/employer/jobs/post');

  const ctx = await getEmployerForUser(user.id);
  if (!ctx) redirect(await unlinkedEmployerHref(user.id));

  const t = await getTranslations('employer');

  const employer = await prisma.employer.findUnique({
    where: { id: ctx.employerId },
    select: { tier: true },
  });
  const tierKey = (employer?.tier ?? 'basic') as keyof typeof EMPLOYER_TIERS;
  const tierConfig = EMPLOYER_TIERS[tierKey] ?? EMPLOYER_TIERS.basic;
  const jobLimit = tierConfig.jobLimit;

  const activeJobCount = await prisma.job.count({
    where: {
      employerId: ctx.employerId,
      status: { in: ['live', 'pending', 'draft'] },
    },
  });

  // Pricing is future-state (CEO directive) — no employer hits a job-limit
  // paywall today. EMPLOYER_PRICING_ENFORCED is the single switch that
  // restores this gate later without deleting the tier/limit logic.
  const atLimit = EMPLOYER_PRICING_ENFORCED && jobLimit !== Infinity && activeJobCount >= jobLimit;

  return (
    <PortalPageFrame>
      <EmployerPageOpener
        kicker={t('employerPortal')}
        title={t('postAJobTitle')}
        subtitle={t('publishToJobBoard')}
        action={
          <Link
            href="/employer/jobs/new"
            style={{
              padding: '0.5rem 1rem',
              fontSize: '0.875rem',
              fontWeight: 600,
              color: 'var(--color-accent)',
              textDecoration: 'none',
            }}
          >
            {t('advancedEditor')}
          </Link>
        }
      />

      {atLimit && (
        <div className="portal-card portal-card--flat portal-card--padded" style={{ marginBottom: '1.5rem', borderLeft: '4px solid var(--color-gold)', background: 'rgba(234,179,8,0.06)' }}>
          <p style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-on-surface)', margin: '0 0 0.5rem' }}>
            {t('jobLimitReached')}
          </p>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-on-surface-variant)', margin: '0 0 1rem' }}>
            {t('jobLimitDesc', { count: activeJobCount, plan: tierConfig.name, limit: jobLimit })}
          </p>
          <Link href="/employer/billing" className="btn btn-primary">
            {t('upgradePlan')}
          </Link>
        </div>
      )}

      <div className="wa-pb-24 md:wa-pb-0">
        <div className="wa-p-4 md:wa-p-0">
          <div className="portal-card portal-card--flat wa-rounded-xl wa-p-4 md:wa-max-w-2xl md:wa-rounded-2xl md:wa-p-6">
            <p style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-on-surface-variant)', margin: '0 0 1rem' }}>
              {t('postAJobQuickHint')}
            </p>
            <EmployerJobPostForm />
          </div>
        </div>
      </div>
    </PortalPageFrame>
  );
}
