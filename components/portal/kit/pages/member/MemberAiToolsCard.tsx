'use client';

import { useTranslations } from 'next-intl';
import { Card } from '@astryxdesign/core/Card';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { KitLinkButton } from '@/components/portal/kit/KitLinkButton';
import type { MemberToolRecommendation } from '@/lib/member/recommendMemberTool';

const LIVE_TOOLS = [
  { slug: 'resume-studio', href: '/dashboard/ai-tools/resume-studio', titleKey: 'aiTileResumeTitle', bodyKey: 'aiTileResumeBody' },
  { slug: 'interview-practice', href: '/dashboard/ai-tools/interview-practice', titleKey: 'aiTileInterviewTitle', bodyKey: 'aiTileInterviewBody' },
  { slug: 'cover-letter', href: '/dashboard/ai-tools/cover-letter', titleKey: 'aiTileCoverTitle', bodyKey: 'aiTileCoverBody' },
  { slug: 'job-match-scorer', href: '/dashboard/ai-tools/job-match-scorer', titleKey: 'aiTileMatchTitle', bodyKey: 'aiTileMatchBody' },
] as const;

const DEV_TOOL_HREFS: Record<(typeof LIVE_TOOLS)[number]['slug'], string> = {
  'resume-studio': '/dev/member/resume-studio',
  'interview-practice': '/dev/member/interview-practice',
  'cover-letter': '/dev/member/cover-letter',
  'job-match-scorer': '/dev/member/job-match',
};

function resolveToolHref(toolkitHref: string, slug: (typeof LIVE_TOOLS)[number]['slug'], liveHref: string): string {
  if (toolkitHref.startsWith('/dev/member')) return DEV_TOOL_HREFS[slug];
  return liveHref;
}

/**
 * Permanent home entry for AI Career Tools. A missing stage recommendation
 * must not hide the tools. Tiles link to the live tool routes (or the
 * matching /dev/member proofs when the hub href is a proof).
 */
export default function MemberAiToolsCard({
  toolkitHref,
  recommendedTool,
}: {
  toolkitHref: string;
  recommendedTool?: MemberToolRecommendation | null;
}) {
  const t = useTranslations('aiToolsDiscovery');
  const th = useTranslations('dashboard.home');
  const tiles = LIVE_TOOLS.map((tool) => ({
    ...tool,
    href: resolveToolHref(toolkitHref, tool.slug, tool.href),
    title: th(tool.titleKey),
    body: th(tool.bodyKey),
  }));

  return (
    <Card>
      <VStack as="section" gap={4} aria-labelledby="member-ai-tools-heading">
        <HStack justify="between" align="center" wrap="wrap" gap={3}>
          <h2
            id="member-ai-tools-heading"
            className="wa-m-0"
            style={{ fontWeight: 800, fontSize: 'clamp(1.15rem, 2.6vw, 1.5rem)', letterSpacing: '-0.02em', textWrap: 'balance' }}
          >
            {th('aiClaim')}
          </h2>
          <Link href={toolkitHref} className="wa-kit-focus" style={{ color: 'var(--wa-accent)', fontWeight: 700, minHeight: 44, display: 'inline-flex', alignItems: 'center' }}>
            {th('openHub')}
          </Link>
        </HStack>
        <p className="wa-kit-lede wa-m-0">{t('homeIntro')}</p>
        <p className="wa-kit-meta wa-m-0">{th('aiAssistNote')}</p>
        {recommendedTool ? (
          <VStack gap={2} data-testid="recommended-tool" data-tool={recommendedTool.slug}>
            <h3 className="wa-text-base wa-font-bold wa-m-0">{t('tryNext', { title: recommendedTool.title })}</h3>
            <p className="wa-kit-lede wa-m-0">{recommendedTool.body}</p>
          </VStack>
        ) : null}
        <div style={{ display: 'grid', gap: 8 }}>
          {tiles.map((tile) => (
            <Link
              key={tile.slug}
              href={tile.href}
              className="wa-kit-card wa-kit-card--sm wa-kit-card--hover wa-kit-focus"
              style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', textDecoration: 'none', color: 'inherit', minHeight: 44 }}
            >
              <span>
                <strong style={{ display: 'block', fontSize: 'var(--wa-type-body)', fontWeight: 800 }}>{tile.title}</strong>
                <span className="wa-kit-meta">{tile.body}</span>
              </span>
              <span className="wa-kit-meta" style={{ color: 'var(--wa-accent)', fontWeight: 700 }}>{th('openHub')}</span>
            </Link>
          ))}
        </div>
        <HStack gap={3} wrap="wrap">
          <KitLinkButton
            href={recommendedTool?.href ?? toolkitHref}
            label={recommendedTool?.cta ?? t('explore')}
            variant="primary"
            size="md"
            className="wa-min-h-11 wa-max-w-full wa-whitespace-normal wa-h-auto"
            endContent={<ArrowRight size={18} aria-hidden="true" />}
          />
          {recommendedTool ? (
            <KitLinkButton href={toolkitHref} label={t('exploreAll')} size="md" className="wa-min-h-11 wa-max-w-full wa-whitespace-normal wa-h-auto" />
          ) : null}
        </HStack>
      </VStack>
    </Card>
  );
}
