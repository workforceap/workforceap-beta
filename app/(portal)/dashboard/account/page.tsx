import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { prisma } from '@/lib/db/prisma';
import PageHeader from '@/components/portal/PageHeader';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard.account');
  return buildPageMetadataAsync({
    title: t('metaTitle'),
    description: t('metaDescription'),
    path: '/dashboard/account',
  });
}

export default async function DashboardAccountPage() {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/dashboard/account');

  const t = await getTranslations('dashboard.account');

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
  });

  const email = dbUser?.email ?? user.email ?? '';

  return (
    <>
      <div style={{ maxWidth: 'var(--max-width, 36rem)', margin: '0 auto', padding: '0 1rem 4rem' }}>
        <PageHeader
          title={t('title')}
          subtitle={t('subtitle')}
          breadcrumbs={[
            { href: '/dashboard', label: t('breadcrumbPortal') },
            { label: t('title') },
          ]}
        />

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {/* Email */}
          <section className="portal-card portal-card--flat" style={{ padding: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
              <div
                style={{
                  width: '2.25rem',
                  height: '2.25rem',
                  borderRadius: '0.5rem',
                  background: 'color-mix(in srgb, var(--color-accent) 8%, transparent)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <span className="material-symbols-outlined" style={{ color: 'var(--wa-accent-text)', fontSize: '1.125rem' }} aria-hidden="true">mail</span>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h2 style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--color-on-surface)', margin: '0 0 0.375rem' }}>
                  {t('emailHeading')}
                </h2>
                <p style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'var(--color-on-surface)', margin: '0 0 0.375rem', wordBreak: 'break-all' }}>
                  {email}
                </p>
                <p style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', lineHeight: 1.55, margin: 0 }}>
                  {t('emailChangeNote')}
                </p>
              </div>
            </div>
          </section>

          {/* Password */}
          <section className="portal-card portal-card--flat" style={{ padding: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
              <div
                style={{
                  width: '2.25rem',
                  height: '2.25rem',
                  borderRadius: '0.5rem',
                  background: 'color-mix(in srgb, var(--color-accent) 8%, transparent)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <span className="material-symbols-outlined" style={{ color: 'var(--wa-accent-text)', fontSize: '1.125rem' }} aria-hidden="true">lock</span>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h2 style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--color-on-surface)', margin: '0 0 0.375rem' }}>
                  {t('passwordHeading')}
                </h2>
                <p style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', lineHeight: 1.55, margin: '0 0 0.875rem' }}>
                  {t('passwordBody')}
                </p>
                <Link href={`/forgot-password?email=${encodeURIComponent(email)}`} className="btn btn-primary" style={{ fontSize: '0.875rem' }}>
                  {t('resetPassword')}
                </Link>
              </div>
            </div>
          </section>
        </div>

        <p style={{ marginTop: '1.5rem', fontSize: '0.8125rem' }}>
          <Link href="/dashboard/profile" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem', color: 'var(--wa-accent-text)', fontWeight: 600, textDecoration: 'none' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '0.9375rem' }} aria-hidden="true">arrow_back</span>
            {t('backToProfile')}
          </Link>
        </p>
      </div>
    </>
  );
}
