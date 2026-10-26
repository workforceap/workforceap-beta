import { redirect } from 'next/navigation';
import { getUser, withAuthGuc } from '@/lib/auth/server';
import { isAdmin, isCounselor } from '@/lib/auth/roles';
import PageHeader from '@/components/portal/PageHeader';
import PortalPageFrame from '@/components/portal/PortalPageFrame';
import AtRiskDashboard from '@/components/portal/counselor/AtRiskDashboard';
import { loadCounselorAtRiskPage } from '@/lib/counselor/atRiskPageData';
import { getTranslations } from 'next-intl/server';




export default async function CounselorAtRiskView({ embedded = false }: { embedded?: boolean } = {}) {
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
      {!embedded ? <PageHeader
        title={t('atRiskMembersTitle')}
        subtitle={t('atRiskSubtitle')}
        breadcrumbs={[
          { label: t('counselorPortalBreadcrumb'), href: '/counselor' },
          { label: t('atRiskMembersTitle') },
        ]}
      /> : null}
      <section style={{ padding: embedded ? 0 : '0 clamp(1rem, 4vw, 1.5rem) 2rem' }}>
        <AtRiskDashboard
          initialMembers={initial.status === 'ok' ? initial.members : []}
          initialError={initial.status === 'failed' ? initial.message : null}
        />
      </section>
    </PortalPageFrame>
  );
}
