import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { unlinkedPartnerHref } from '@/lib/auth/portalGuards';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { getPartnerForUser } from '@/lib/auth/roles';
import PortalPageFrame from '@/components/portal/PortalPageFrame';
import PageHeader from '@/components/portal/PageHeader';
import { Download, FileSpreadsheet, Users } from 'lucide-react';
import { DesignSurface, StatusTag, colorVar } from '@/components/portal/kit';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('partner');
  return buildPageMetadataAsync({
    title: t('exportsTitle'),
    description: t('exportsGoal'),
    path: '/partner/exports',
  });
}

type ExportTone = 'accent' | 'info' | 'gold';

interface ExportOption {
  id: string;
  title: string;
  description: string;
  href: string;
  icon: ReactNode;
  tone: ExportTone;
  primary?: boolean;
}

const TONE_TINT: Record<ExportTone, { bg: string; fg: string }> = {
  accent: { bg: 'color-mix(in srgb, var(--wa-accent) 12%, transparent)', fg: colorVar('accent') },
  info: { bg: 'color-mix(in srgb, var(--wa-info) 12%, transparent)', fg: colorVar('info') },
  gold: { bg: 'color-mix(in srgb, var(--wa-gold) 14%, transparent)', fg: colorVar('gold') },
};

const EXPORTS: ExportOption[] = [
  {
    id: 'referrals',
    title: 'All referrals',
    description: 'Every referred member, stage, and last update.',
    href: '/api/partner/export/referrals',
    icon: <Download className="h-5 w-5" />,
    tone: 'accent',
    primary: true,
  },
  {
    id: 'outcomes',
    title: 'Outcomes preset',
    description: 'Placement columns for board / funder reporting.',
    href: '/api/partner/export/referrals?preset=outcomes',
    icon: <FileSpreadsheet className="h-5 w-5" />,
    tone: 'info',
  },
  {
    id: 'demographics',
    title: 'Demographics + placement',
    description: 'Funder reporting — demographics alongside outcomes.',
    href: '/api/partner/export/referrals?preset=demographics',
    icon: <Users className="h-5 w-5" />,
    tone: 'gold',
  },
];

function ExportTile({ option }: { option: ExportOption }) {
  const tint = TONE_TINT[option.tone];
  return (
    <a
      href={option.href}
      className="wa-kit-card wa-kit-card--hover wa-kit-focus"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        textDecoration: 'none',
        color: 'inherit',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <div
          aria-hidden
          style={{
            width: 44,
            height: 44,
            borderRadius: 'var(--wa-radius-sm)',
            background: tint.bg,
            color: tint.fg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {option.icon}
        </div>
        {option.primary ? <StatusTag tone="info">CSV</StatusTag> : null}
      </div>

      <div style={{ minWidth: 0 }}>
        <h3 style={{ fontWeight: 800, fontSize: 16, letterSpacing: '-0.02em', margin: 0, color: 'var(--wa-text)' }}>
          {option.title}
        </h3>
        <p style={{ fontSize: 13, color: 'var(--wa-muted)', margin: '4px 0 0' }}>{option.description}</p>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 13,
          fontWeight: 700,
          color: tint.fg,
          paddingTop: 12,
          borderTop: '1px solid var(--wa-border)',
        }}
      >
        <Download className="h-3.5 w-3.5" aria-hidden />
        Download
      </div>
    </a>
  );
}

export default async function PartnerExportsPage() {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/partner/exports');

  const ctx = await getPartnerForUser(user.id);
  if (!ctx) redirect(await unlinkedPartnerHref(user.id));

  const t = await getTranslations('partner');

  return (
    <PortalPageFrame maxWidth="80rem">
      <DesignSurface surface="dense" className="wa-flex wa-flex-col wa-gap-6">
        <PageHeader title={t('exportsTitle')} subtitle={t('exportsGoal')} />

        <div className="wa-grid wa-grid-cols-1 md:wa-grid-cols-3 wa-gap-4">
          {EXPORTS.map((option) => (
            <ExportTile key={option.id} option={option} />
          ))}
        </div>
      </DesignSurface>
    </PortalPageFrame>
  );
}
