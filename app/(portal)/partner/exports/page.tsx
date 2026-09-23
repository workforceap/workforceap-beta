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
import { countPartnerReferrals, loadPartnerReferralBundle } from '@/lib/partner/referralBundle';
import {
  buildPartnerOutcomePacket,
  partnerPacketTruncationWarning,
  type PartnerOutcomePacket,
} from '@/lib/partner/outcomePacket';
import { formatPortalDateTime } from '@/lib/formatDate';

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

const PACKET_HREF = '/api/partner/export/referrals?preset=packet';

/**
 * Outcome packet summary (V12). The numbers come from the same
 * `buildPartnerOutcomePacket` output the `?preset=packet` CSV prints, so the
 * page and the download reconcile. Counts only, shown as "X of N".
 */
function OutcomePacketSection({ packet }: { packet: PartnerOutcomePacket }) {
  const warning = partnerPacketTruncationWarning(packet);
  const unknowns = packet.unknowns.filter((u) => u.count > 0);
  return (
    <section
      aria-labelledby="outcome-packet-title"
      data-testid="partner-outcome-packet"
      className="wa-kit-card"
      style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <h2 id="outcome-packet-title" style={{ fontWeight: 800, fontSize: 18, letterSpacing: '-0.02em', margin: 0, color: 'var(--wa-text)' }}>
            Outcome packet
          </h2>
          <p style={{ fontSize: 13, color: 'var(--wa-muted)', margin: '4px 0 0' }}>
            {packet.period}. Generated{' '}
            <time dateTime={packet.generatedAt}>{formatPortalDateTime(packet.generatedAt)}</time>.
            {' '}Definitions {packet.definitionsVersion}.
          </p>
        </div>
        <StatusTag tone="info">CSV</StatusTag>
      </div>

      {warning ? (
        <p role="status" data-testid="partner-outcome-packet-truncated" style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--wa-text)' }}>
          <StatusTag tone="warn">Partial</StatusTag> {warning}
        </p>
      ) : null}

      {packet.totalReferrals === 0 ? (
        <p style={{ margin: 0, fontSize: 14, color: 'var(--wa-muted)' }}>
          No referrals yet. The packet fills in when a member you referred signs up.
        </p>
      ) : (
        <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(14rem, 1fr))', gap: 10, margin: 0 }}>
          {packet.lines.map((line) => (
            <div key={line.key} data-line={line.key} style={{ borderTop: '1px solid var(--wa-border)', paddingTop: 8 }}>
              <dt style={{ fontSize: 13, color: 'var(--wa-muted)' }}>{line.label}</dt>
              <dd style={{ margin: '2px 0 0', fontSize: 16, fontWeight: 700, color: 'var(--wa-text)' }}>{line.display}</dd>
            </div>
          ))}
        </dl>
      )}

      {unknowns.length > 0 ? (
        <div>
          <h3 style={{ fontSize: 13, fontWeight: 700, margin: 0, color: 'var(--wa-text)' }}>Unknowns</h3>
          <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: 13, color: 'var(--wa-muted)' }}>
            {unknowns.map((u) => (
              <li key={u.key}>
                {u.label}: {u.count}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p style={{ margin: 0, fontSize: 13, color: 'var(--wa-muted)' }}>
        Counts only, no percentages. Credential records are member-reported. {packet.exclusions[0]} Not a
        regulatory certification.
      </p>

      <a
        href={PACKET_HREF}
        className="wa-kit-focus"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: colorVar('accent'), textDecoration: 'none' }}
      >
        <Download className="h-3.5 w-3.5" aria-hidden />
        Download outcome packet
      </a>
    </section>
  );
}

export default async function PartnerExportsPage() {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/partner/exports');

  const ctx = await getPartnerForUser(user.id);
  if (!ctx) redirect(await unlinkedPartnerHref(user.id));

  const t = await getTranslations('partner');

  const [{ pipelineMembers }, totalReferrals] = await Promise.all([
    loadPartnerReferralBundle(ctx.partnerId, ctx.partner.organizationId),
    countPartnerReferrals(ctx.partnerId, ctx.partner.organizationId),
  ]);
  const packet = buildPartnerOutcomePacket({
    pipelineMembers,
    totalReferrals,
    partnerName: ctx.partner.name,
    generatedAt: new Date(),
  });

  return (
    <PortalPageFrame maxWidth="80rem">
      <DesignSurface surface="dense" className="wa-flex wa-flex-col wa-gap-6">
        <PageHeader title={t('exportsTitle')} subtitle={t('exportsGoal')} />

        <OutcomePacketSection packet={packet} />

        <div className="wa-grid wa-grid-cols-1 md:wa-grid-cols-3 wa-gap-4">
          {EXPORTS.map((option) => (
            <ExportTile key={option.id} option={option} />
          ))}
        </div>
      </DesignSurface>
    </PortalPageFrame>
  );
}
