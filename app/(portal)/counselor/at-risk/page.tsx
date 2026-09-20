import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getUser, withAuthGuc } from '@/lib/auth/server';
import { isAdmin, isCounselor } from '@/lib/auth/roles';
import PageHeader from '@/components/portal/PageHeader';
import PortalPageFrame from '@/components/portal/PortalPageFrame';
import { buildPageMetadataAsync } from '@/app/seo';
import AtRiskDashboard from '@/components/portal/counselor/AtRiskDashboard';
import { loadCounselorAtRiskPage } from '@/lib/counselor/atRiskPageData';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('counselor');
  return buildPageMetadataAsync({
    title: t('atRiskMembersTitle'),
    description: t('atRiskSubtitle'),
    path: '/counselor/at-risk',
  });
}

export const dynamic = 'force-dynamic';

export default async function CounselorAtRiskPage() {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/counselor/at-risk');

  const allowed = (await isCounselor(user.id)) || (await isAdmin(user.id));
  if (!allowed) redirect('/dashboard');

  const t = await getTranslations('counselor');

  // Server-render the saved cases (same scope and guards as the at-risk API
  // route, under the actor's GUC) so the page paints with data or with a
  // plain-language failure, never a spinner that waits on a client fetch.
  const initial = await withAuthGuc(() => loadCounselorAtRiskPage(user.id));

  return (
    <PortalPageFrame>
      <PageHeader
        title={t('atRiskMembersTitle')}
        subtitle={t('atRiskSubtitle')}
        breadcrumbs={[
          { label: t('counselorPortalBreadcrumb'), href: '/counselor' },
          { label: t('atRiskMembersTitle') },
        ]}
      />
      <section style={{ padding: '0 clamp(1rem, 4vw, 1.5rem) 2rem' }}>
        <AtRiskDashboard
          initialMembers={initial.status === 'ok' ? initial.members : []}
          initialError={initial.status === 'failed' ? initial.message : null}
        />
      </section>
    </PortalPageFrame>
  );
}
