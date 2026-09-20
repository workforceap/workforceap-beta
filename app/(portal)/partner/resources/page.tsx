import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { unlinkedPartnerHref } from '@/lib/auth/portalGuards';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { getPartnerForUser } from '@/lib/auth/roles';
import PortalPageFrame from '@/components/portal/PortalPageFrame';
import PageHeader from '@/components/portal/PageHeader';
import { prisma } from '@/lib/db/prisma';
import { BookOpen, CircleHelp, Mail, Route } from 'lucide-react';
import { DesignSurface, CardHead, FeatureTile } from '@/components/portal/kit';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('partner');
  return buildPageMetadataAsync({
    title: t('resourcesTitle'),
    description: t('resourcesGoal', { partnerName: 'partners' }),
    path: '/partner/resources',
  });
}

const PUBLIC_LINKS: {
  href: string;
  label: string;
  desc: string;
  icon: ReactNode;
  tone: 'crimson' | 'gold';
}[] = [
  {
    href: '/programs',
    label: 'Training programs',
    desc: 'Certificates and pathways we offer.',
    icon: <BookOpen size={22} aria-hidden />,
    tone: 'crimson',
  },
  {
    href: '/how-it-works',
    label: 'How it works',
    desc: 'Timeline from application to job search support.',
    icon: <Route size={22} aria-hidden />,
    tone: 'gold',
  },
  {
    href: '/faq',
    label: 'FAQ',
    desc: 'Common questions for participants and partners.',
    icon: <CircleHelp size={22} aria-hidden />,
    tone: 'crimson',
  },
  {
    href: '/contact',
    label: 'Contact',
    desc: 'Reach the WorkforceAP team.',
    icon: <Mail size={22} aria-hidden />,
    tone: 'gold',
  },
];

export default async function PartnerResourcesPage() {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/partner/resources');

  const ctx = await getPartnerForUser(user.id);
  if (!ctx) redirect(await unlinkedPartnerHref(user.id));

  const t = await getTranslations('partner');

  const partner = await prisma.partner.findUnique({
    where: { id: ctx.partnerId },
    select: { contactName: true, contactEmail: true, contactPhone: true },
  });

  const hasContact = Boolean(partner?.contactEmail || partner?.contactPhone || partner?.contactName);

  return (
    <PortalPageFrame maxWidth="80rem">
      <DesignSurface surface="dense" className="wa-flex wa-flex-col wa-gap-6">
        <PageHeader
          title={t('resourcesTitle')}
          subtitle={t('resourcesGoal', { partnerName: ctx.partner.name })}
        />

        {hasContact ? (
          <div className="wa-kit-card" style={{ maxWidth: 480 }}>
            <CardHead title="Partner contacts (on file)" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {partner?.contactName ? (
                <p style={{ margin: 0, color: 'var(--wa-text)', fontSize: 14 }}>{partner.contactName}</p>
              ) : null}
              {partner?.contactEmail ? (
                <a href={`mailto:${partner.contactEmail}`} style={{ color: 'var(--wa-accent)', fontSize: 14 }}>
                  {partner.contactEmail}
                </a>
              ) : null}
              {partner?.contactPhone ? (
                <p style={{ margin: 0, color: 'var(--wa-muted)', fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>
                  {partner.contactPhone}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        <div>
          <CardHead title="WorkforceAP" />
          <div className="wa-grid wa-grid-cols-1 md:wa-grid-cols-2 lg:wa-grid-cols-4 wa-gap-4">
            {PUBLIC_LINKS.map((item) => (
              <FeatureTile
                key={item.href}
                href={item.href}
                headingAs="h2"
                title={item.label}
                body={item.desc}
                icon={item.icon}
                tone={item.tone}
              />
            ))}
          </div>
        </div>

        <p style={{ color: 'var(--wa-muted)', fontSize: 13 }}>
          Member-facing tools (resume, learning, assessments) live in the{' '}
          <Link href="/dashboard" style={{ color: 'var(--wa-accent)' }}>
            Member Portal
          </Link>{' '}
          after they enroll.
        </p>
      </DesignSurface>
    </PortalPageFrame>
  );
}
