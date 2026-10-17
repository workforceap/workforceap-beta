'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import {
  AudioLines,
  FileText,
  MailOpen,
  Mic,
  Route,
  Search,
  Sparkles,
  Target,
} from 'lucide-react';
import { DesignSurface, KpiStrip, PageOpener, StatusTag } from '@/components/portal/kit';
import { Avatar } from '@/components/portal/kit/Avatar';
import type { AssignedCounselor } from '@/lib/member/counselorContext';

const DEV_PREFIX = '/dev/member';

function toolHref(hubHref: string, live: string, dev: string): string {
  return hubHref.startsWith(DEV_PREFIX) ? dev : live;
}

export function MemberAiToolsHubKit({
  hubHref = '/dashboard/ai-tools',
  advisor = null,
  resumeScore = 72,
  mockQuestion = 2,
  mockTotal = 5,
  toolsInUse = 4,
  toolsTotal = 8,
  nextSync = 'Thursday',
}: {
  hubHref?: string;
  advisor?: AssignedCounselor | null;
  resumeScore?: number;
  mockQuestion?: number;
  mockTotal?: number;
  toolsInUse?: number;
  toolsTotal?: number;
  nextSync?: string;
}) {
  const t = useTranslations('dashboard.aiHub');
  const advisorName = advisor?.firstName ?? advisor?.name;
  type HubTile = {
    title: string;
    body: string;
    href: string;
    cta: string;
    Icon: typeof FileText;
    tag?: string;
    tone?: 'ok' | 'warn' | 'info' | 'muted';
    recommended?: boolean;
  };
  const groups: Array<{ title: string; count: number; tiles: HubTile[] }> = [
    {
      title: t('groupResume'),
      count: 2,
      tiles: [
        {
          title: t('tileResumeStudio'),
          body: t('tileResumeStudioBody'),
          href: toolHref(hubHref, '/dashboard/ai-tools/resume-studio', '/dev/member/resume-studio'),
          cta: t('openStudio'),
          tag: '72/100',
          Icon: FileText,
        },
        {
          title: t('tileRewriter'),
          body: t('tileRewriterBody'),
          href: toolHref(hubHref, '/dashboard/ai-tools/resume-rewriter', '/dev/member/resume-rewriter'),
          cta: t('continueDraft'),
          Icon: FileText,
        },
      ],
    },
    {
      title: t('groupInterview'),
      count: 3,
      tiles: [
        {
          title: t('tileInterview'),
          body: t('tileInterviewBody'),
          href: toolHref(hubHref, '/dashboard/ai-tools/interview-practice', '/dev/member/interview-practice'),
          cta: t('recordAnswer'),
          tag: '60%',
          tone: 'info' as const,
          Icon: Mic,
        },
        {
          title: t('tileVoice'),
          body: t('tileVoiceBody'),
          href: toolHref(hubHref, '/dashboard/ai-tools?tab=session', '/dev/member/toolkit?tab=session'),
          cta: t('startSession'),
          Icon: AudioLines,
        },
        {
          title: t('tilePitch'),
          body: t('tilePitchBody'),
          href: toolHref(hubHref, '/dashboard/ai-tools/elevator-pitch', '/dev/member/elevator-pitch'),
          cta: t('reviewPitch'),
          tag: t('completed'),
          tone: 'ok',
          Icon: Sparkles,
        },
      ],
    },
    {
      title: t('groupApps'),
      count: 3,
      tiles: [
        {
          title: t('tileMatch'),
          body: t('tileMatchBody'),
          href: toolHref(hubHref, '/dashboard/ai-tools/job-match-scorer', '/dev/member/job-match'),
          cta: t('runScorer'),
          recommended: true,
          Icon: Search,
        },
        {
          title: t('tileCover'),
          body: t('tileCoverBody'),
          href: toolHref(hubHref, '/dashboard/ai-tools/cover-letter', '/dev/member/cover-letter'),
          cta: t('viewDrafts'),
          Icon: MailOpen,
        },
        {
          title: t('tileGap'),
          body: t('tileGapBody'),
          href: toolHref(hubHref, '/dashboard/ai-tools/gap-analyzer', '/dev/member/gap-analyzer'),
          cta: t('reviewGap'),
          Icon: Route,
        },
      ],
    },
  ];

  return (
    <DesignSurface surface="warm">
      <div className="wa-dense-page wa-space-y-5">
        <PageOpener
          kicker={t('kicker')}
          title={t('claim')}
          lede={advisorName ? t('lede', { advisor: advisorName }) : t('ledeNoAdvisor')}
          icon={<Target size={14} aria-hidden />}
        />
        <div className="wa-kit-card">
          <KpiStrip
            items={[
              { label: t('kpiTools'), value: t('kpiToolsValue', { used: toolsInUse, total: toolsTotal }) },
              { label: t('kpiResumeScore'), value: `${resumeScore} / 100` },
              { label: t('kpiMock'), value: t('kpiMockValue', { current: mockQuestion, total: mockTotal }), tone: 'info', delta: undefined },
              { label: t('kpiAdvisorSync'), value: nextSync, delta: advisorName ?? undefined, deltaTone: 'muted' },
            ]}
          />
        </div>
        <section className="wa-kit-card wa-flex wa-items-center wa-justify-between wa-flex-wrap wa-gap-3">
          <div>
            <div className="wa-flex wa-items-center wa-gap-2">
              <h2 style={{ margin: 0, fontWeight: 800, fontSize: 'var(--wa-type-body)' }}>
                {t('nextUp', { title: t('tileInterview') })}
              </h2>
              <StatusTag tone="warn">{t('recommended')}</StatusTag>
            </div>
            <p className="wa-kit-lede" style={{ margin: '8px 0 0' }}>
              {advisorName ? t('nextUpBody', { advisor: advisorName }) : t('nextUpBodyNoAdvisor')}
            </p>
          </div>
          <Link
            href={toolHref(hubHref, '/dashboard/ai-tools/interview-practice', '/dev/member/interview-practice')}
            className="wa-kit-cta wa-kit-focus"
            style={{ textDecoration: 'none' }}
          >
            {t('resumeInterview')}
          </Link>
        </section>
        <div className="wa-dense-grid wa-dense-grid--3">
          {groups.map((group) => (
            <section key={group.title} className="wa-space-y-3">
              <div className="wa-flex wa-items-center wa-justify-between">
                <h2 style={{ margin: 0, fontWeight: 800, fontSize: 'var(--wa-type-body)' }}>{group.title}</h2>
                <span className="wa-kit-meta">{t('toolsCount', { count: group.count })}</span>
              </div>
              {group.tiles.map((tile) => {
                const Icon = tile.Icon;
                return (
                  <article key={tile.title} className="wa-kit-card wa-kit-card--sm" style={{ display: 'grid', gap: 8 }}>
                    <div className="wa-flex wa-items-start wa-justify-between wa-gap-2">
                      <Icon size={18} aria-hidden />
                      {tile.recommended ? <StatusTag tone="warn">{t('recommended')}</StatusTag> : tile.tag ? <StatusTag tone={tile.tone ?? 'muted'}>{tile.tag}</StatusTag> : null}
                    </div>
                    <h3 style={{ margin: 0, fontWeight: 800, fontSize: 'var(--wa-type-body)' }}>{tile.title}</h3>
                    <p className="wa-kit-lede" style={{ margin: 0 }}>{tile.body}</p>
                    <Link href={tile.href} className="wa-kit-focus" style={{ color: 'var(--wa-accent)', fontWeight: 700, minHeight: 44, display: 'inline-flex', alignItems: 'center' }}>
                      {tile.cta}
                    </Link>
                  </article>
                );
              })}
            </section>
          ))}
        </div>
        <section className="wa-kit-card wa-flex wa-items-center wa-justify-between wa-flex-wrap wa-gap-3">
          <div className="wa-flex wa-items-center wa-gap-3">
            <Avatar initials={advisor ? advisor.name.slice(0, 2).toUpperCase() : 'WA'} size={44} />
            <div>
              <h2 style={{ margin: 0, fontWeight: 800, fontSize: 'var(--wa-type-body)' }}>
                {advisorName ? t('reviewWith', { advisor: advisorName }) : t('kicker')}
              </h2>
              <p className="wa-kit-lede" style={{ margin: '4px 0 0' }}>{t('reviewBody')}</p>
            </div>
          </div>
          {advisor ? (
            <Link href={advisor.messagingHref} className="wa-kit-cta wa-kit-cta--ghost wa-kit-focus" style={{ textDecoration: 'none' }}>
              {advisor.firstName}
            </Link>
          ) : null}
        </section>
      </div>
    </DesignSurface>
  );
}
