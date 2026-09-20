import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { unlinkedPartnerHref } from '@/lib/auth/portalGuards';

import { buildPageMetadataAsync } from '@/app/seo';
import PartnerInviteMemberButton from '@/components/portal/PartnerInviteMemberButton';
import PartnerMembersList from '@/components/portal/PartnerMembersList';
import { getPartnerForUser } from '@/lib/auth/roles';
import { getUser } from '@/lib/auth/server';
import { loadPartnerReferralBundle, toPartnerMembersListRows } from '@/lib/partner/referralBundle';
import PartnerReferredMembersMobile from '@/components/partner/PartnerReferredMembersMobile';
import PortalPageFrame from '@/components/portal/PortalPageFrame';
import PageHeader from '@/components/portal/PageHeader';
import { getTranslations } from 'next-intl/server';
import { Download } from 'lucide-react';
import { DesignSurface } from '@/components/portal/kit';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('partner');
  return buildPageMetadataAsync({
    title: t('referredMembers'),
    description: t('referredMembersDescription'),
    path: '/partner/referred-members',
  });
}

export default async function PartnerReferredMembersPage() {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/partner/referred-members');
  const t = await getTranslations('partner');

  const ctx = await getPartnerForUser(user.id);
  if (!ctx) redirect(await unlinkedPartnerHref(user.id));

  const { pipelineMembers } = await loadPartnerReferralBundle(ctx.partnerId, ctx.partner.organizationId);
  const rows = toPartnerMembersListRows(pipelineMembers);

  return (
    <PortalPageFrame>
      <DesignSurface surface="dense" className="wa-flex wa-flex-col wa-gap-6 wa-pb-24 md:wa-pb-8">
        <PageHeader
          title={t('referredMembers')}
          subtitle={t('searchAndFilter')}
          action={
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <PartnerInviteMemberButton />
              <a
                href="/partner/exports"
                className="active:scale-[0.98] wa-transition-all wa-kit-focus"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.375rem',
                  padding: '0.5rem 0.875rem',
                  background: 'var(--wa-surface-2)',
                  borderRadius: 'var(--wa-radius-sm)',
                  fontSize: '0.8125rem',
                  fontWeight: 700,
                  color: 'var(--wa-text)',
                  textDecoration: 'none',
                  border: '1px solid var(--wa-border)',
                }}
              >
                <Download size={14} aria-hidden />
                {t('exportCsv')}
              </a>
            </div>
          }
        />
        <div className="wa-block md:wa-hidden">
          <PartnerReferredMembersMobile rows={rows} />
        </div>

        <div className="wa-hidden md:wa-block">
          <PartnerMembersList members={rows} />
        </div>
      </DesignSurface>
    </PortalPageFrame>
  );
}
