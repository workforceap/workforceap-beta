import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getUser } from '@/lib/auth/server';
import { getEmployerForUser } from '@/lib/auth/roles';
import { unlinkedEmployerHref } from '@/lib/auth/portalGuards';
import { buildPageMetadataAsync } from '@/app/seo';
import { prisma } from '@/lib/db/prisma';
import EmployerPageOpener from '@/components/employer/EmployerPageOpener';
import PortalPageFrame from '@/components/portal/PortalPageFrame';
import { EMPLOYER_PRICING_ENFORCED, EMPLOYER_TIERS } from '@/lib/stripe/client';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { statusColor } from '@/lib/ui/statusColors';
import TierCheckoutForm from './TierCheckoutForm';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('employer');
  return buildPageMetadataAsync({
    title: t('billingMetaTitle'),
    description: t('billingMetaDesc'),
    path: '/employer/billing',
  });
}

export default async function EmployerBillingPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; canceled?: string }>;
}) {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/employer/billing');

  const ctx = await getEmployerForUser(user.id);
  if (!ctx) redirect(await unlinkedEmployerHref(user.id));

  const { success, canceled } = await searchParams;
  const t = await getTranslations('employer');

  const employer = await prisma.employer.findUnique({
    where: { id: ctx.employerId },
    select: {
      tier: true,
      stripeSubscriptionStatus: true,
      stripeCustomerId: true,
      _count: { select: { jobs: true } },
    },
  });
  if (!employer) redirect(await unlinkedEmployerHref(user.id));

  const currentTierKey = employer.tier as keyof typeof EMPLOYER_TIERS;
  const currentTier = EMPLOYER_TIERS[currentTierKey] ?? EMPLOYER_TIERS.basic;
  const jobCount = employer._count.jobs;
  const jobLimit = currentTier.jobLimit;
  const isSubscribed = employer.stripeSubscriptionStatus === 'active';

  const tiers = Object.entries(EMPLOYER_TIERS).map(([key, config]) => ({
    key,
    ...config,
    isCurrent: key === currentTierKey,
  }));

  const successColors = statusColor('success');
  const canceledColors = statusColor('warning');

  return (
    <PortalPageFrame>
      <EmployerPageOpener
        kicker={t('employerPortal')}
        title={t('billing')}
        subtitle={t('manageSubscription')}
      />
      {success === '1' && (
        <div
          role="status"
          style={{
            marginBottom: '1.5rem',
            padding: '0.75rem 1rem',
            borderRadius: '0.5rem',
            background: successColors.bg,
            border: `1px solid ${successColors.border}`,
            color: 'var(--color-on-surface)',
            fontSize: '0.875rem',
            fontWeight: 600,
          }}
        >
          {t('checkoutSuccess')}
        </div>
      )}
      {canceled === '1' && (
        <div
          role="status"
          style={{
            marginBottom: '1.5rem',
            padding: '0.75rem 1rem',
            borderRadius: '0.5rem',
            background: canceledColors.bg,
            border: `1px solid ${canceledColors.border}`,
            color: 'var(--color-on-surface)',
            fontSize: '0.875rem',
            fontWeight: 600,
          }}
        >
          {t('checkoutCanceled')}
        </div>
      )}

      <div className="portal-card portal-card--flat portal-card--padded" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <p style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-on-surface-variant)', marginBottom: '0.25rem' }}>
              {t('currentPlan')}
            </p>
            <p style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-on-surface)', margin: 0 }}>
              {currentTier.name}
            </p>
            <p style={{ fontSize: '0.875rem', color: 'var(--color-on-surface-variant)', margin: '0.25rem 0 0' }}>
              {isSubscribed ? t('activeSubscription') : employer.stripeCustomerId ? t('subscriptionNotActive') : t('noSubscription')}
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-on-surface-variant)', marginBottom: '0.25rem' }}>
              {t('jobUsage')}
            </p>
            <p style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-on-surface)', margin: 0, fontVariantNumeric: 'tabular-nums' }}>
              {jobCount} / {jobLimit === Infinity ? t('unlimited') : jobLimit}
            </p>
          </div>
        </div>
      </div>

      <p style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', margin: '0 0 1rem' }}>
        {t('billingFreeIntro')}
      </p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(16rem, 1fr))',
          gap: '1rem',
        }}
      >
        {tiers.map((tier) => (
          <div
            key={tier.key}
            className="portal-card portal-card--flat portal-card--padded"
            style={{
              borderLeft: tier.isCurrent ? '4px solid var(--color-accent)' : '4px solid transparent',
              opacity: tier.isCurrent ? 1 : 0.95,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <p style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--color-on-surface)', margin: 0 }}>
                {tier.name}
              </p>
              {tier.isCurrent && (
                <span
                  style={{
                    fontSize: '0.6875rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    padding: '0.25rem 0.5rem',
                    borderRadius: '9999px',
                    background: 'var(--color-accent)',
                    color: '#fff',
                  }}
                >
                  {t('current')}
                </span>
              )}
            </div>
            <p style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-on-surface-variant)', margin: '0 0 0.5rem' }}>
              {t('tierPartnershipNote')}
            </p>
            <ul style={{ margin: '0 0 1rem', padding: 0, listStyle: 'none' }}>
              <li style={{ fontSize: '0.875rem', color: 'var(--color-on-surface-variant)', marginBottom: '0.25rem' }}>
                {tier.jobLimit === Infinity ? t('unlimitedActiveJobs') : t('upToNActiveJobs', { count: tier.jobLimit })}
              </li>
              {tier.features.map((feature) => (
                <li key={feature} style={{ fontSize: '0.875rem', color: 'var(--color-on-surface-variant)', marginBottom: '0.25rem' }}>
                  {feature}
                </li>
              ))}
            </ul>
            {EMPLOYER_PRICING_ENFORCED && !tier.isCurrent && (
              <TierCheckoutForm
                tierKey={tier.key}
                currentTierKey={currentTierKey}
                upgradeLabel={t('upgrade')}
                downgradeLabel={t('downgrade')}
                switchLabel={t('switch')}
              />
            )}
          </div>
        ))}
      </div>
    </PortalPageFrame>
  );
}
