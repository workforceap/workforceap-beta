import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { unlinkedPartnerHref } from '@/lib/auth/portalGuards';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { getPartnerForUser } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';
import { formatPortalDate } from '@/lib/formatDate';
import PortalPageFrame from '@/components/portal/PortalPageFrame';
import PageHeader from '@/components/portal/PageHeader';
import PartnerNotificationPrefs from '@/components/partner/PartnerNotificationPrefs';
import PartnerContactEditForm from '@/components/partner/PartnerContactEditForm';
import { DesignSurface, CardHead } from '@/components/portal/kit';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('partner');
  return buildPageMetadataAsync({
    title: t('settingsTitle'),
    description: t('settingsGoal'),
    path: '/partner/settings',
  });
}

function InfoRow({ label, value, mono }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        gap: 16,
        padding: '10px 0',
        borderBottom: '1px solid var(--wa-border)',
      }}
    >
      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--wa-muted)', flexShrink: 0 }}>{label}</span>
      <span
        style={{
          fontSize: 14,
          color: 'var(--wa-text)',
          fontFamily: mono ? 'ui-monospace, monospace' : undefined,
          textAlign: 'right',
          wordBreak: 'break-all',
        }}
      >
        {value}
      </span>
    </div>
  );
}

function fmtBool(v: boolean): string {
  return v ? 'Active' : 'Inactive';
}

// Pinned to PORTAL_TIMEZONE so a late-evening Central completion is not
// shown as the next day by the UTC server.
function fmtDate(v: Date | null): string {
  return v ? formatPortalDate(v) || '—' : '—';
}

export default async function PartnerSettingsPage() {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/partner/settings');

  const ctx = await getPartnerForUser(user.id);
  if (!ctx) redirect(await unlinkedPartnerHref(user.id));

  const t = await getTranslations('partner');

  const partner = await prisma.partner.findUnique({
    where: { id: ctx.partnerId },
    select: {
      name: true,
      slug: true,
      referralCode: true,
      contactName: true,
      contactEmail: true,
      contactPhone: true,
      organizationType: true,
      active: true,
      notifyOnEnrollment: true,
      notifyOnCourse: true,
      notifyOnCertified: true,
      notifyOnPlaced: true,
      onboardingCompletedAt: true,
      tourCompletedAt: true,
    },
  });
  if (!partner) redirect(await unlinkedPartnerHref(user.id));

  return (
    <PortalPageFrame maxWidth="48rem">
      <DesignSurface surface="dense" className="wa-flex wa-flex-col wa-gap-6">
        <div style={{ paddingBottom: '5rem' }} className="wa-flex wa-flex-col wa-gap-6">
          <PageHeader title={t('settingsTitle')} subtitle={t('settingsGoal')} />

          <div className="wa-kit-card">
            <CardHead title="Organization" />
            <div>
              <InfoRow label="Name" value={partner.name} />
              <InfoRow label="Slug" value={partner.slug ?? '—'} mono />
              <InfoRow label="Referral code" value={partner.referralCode ?? '—'} mono />
              <InfoRow label="Type" value={partner.organizationType ?? '—'} />
              <InfoRow label="Status" value={fmtBool(partner.active)} />
              <InfoRow label="Onboarding complete" value={fmtDate(partner.onboardingCompletedAt)} />
              <InfoRow label="Portal tour" value={fmtDate(partner.tourCompletedAt)} />
            </div>
          </div>

          <div className="wa-kit-card">
            <CardHead title="Primary contact" />
            <InfoRow label="Email" value={partner.contactEmail ?? '—'} />
            <div style={{ marginTop: 16 }}>
              <PartnerContactEditForm
                partnerId={ctx.partnerId}
                initialContactName={partner.contactName}
                initialContactPhone={partner.contactPhone}
              />
            </div>
          </div>

          <PartnerNotificationPrefs
            initial={{
              notifyOnEnrollment: partner.notifyOnEnrollment,
              notifyOnCourse: partner.notifyOnCourse,
              notifyOnCertified: partner.notifyOnCertified,
              notifyOnPlaced: partner.notifyOnPlaced,
            }}
          />

          <p style={{ color: 'var(--wa-muted)', lineHeight: 1.6, fontSize: 13 }}>
            To change your organization name, slug, or referral code, please{' '}
            <a href="mailto:info@workforceap.org" style={{ color: 'var(--wa-accent)' }}>
              contact our team
            </a>
            .
          </p>
        </div>
      </DesignSurface>
    </PortalPageFrame>
  );
}
