'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { KitLinkButton } from '@/components/portal/kit/KitLinkButton';
import type { MemberToolRecommendation } from '@/lib/member/recommendMemberTool';

const HOME_TOOLS = [
  { slug: 'resume-studio', href: '/dashboard/ai-tools/resume-studio', titleKey: 'aiTileResumeTitle', bodyKey: 'aiTileResumeBody' },
  { slug: 'interview-practice', href: '/dashboard/ai-tools/interview-practice', titleKey: 'aiTileInterviewTitle', bodyKey: 'aiTileInterviewBody' },
  { slug: 'job-match-scorer', href: '/dashboard/ai-tools/job-match-scorer', titleKey: 'aiTileMatchTitle', bodyKey: 'aiTileMatchBody' },
] as const;

const DEV_TOOL_HREFS: Record<(typeof HOME_TOOLS)[number]['slug'], string> = {
  'resume-studio': '/dev/member/resume-studio',
  'interview-practice': '/dev/member/interview-practice',
  'job-match-scorer': '/dev/member/job-match',
};

function resolveToolHref(toolkitHref: string, slug: (typeof HOME_TOOLS)[number]['slug'], liveHref: string): string {
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
  const tiles = HOME_TOOLS.map((tool) => ({
    ...tool,
    href: resolveToolHref(toolkitHref, tool.slug, tool.href),
    title: th(tool.titleKey),
    body: th(tool.bodyKey),
  }));

  return (
    <section className="wa-kit-card" aria-labelledby="member-ai-tools-heading">
      <div className="wa-flex wa-items-center wa-justify-between wa-gap-3" style={{ marginBottom: 8 }}>
        <h2 id="member-ai-tools-heading" style={{ margin: 0, fontWeight: 800, fontSize: 'var(--wa-type-body)' }}>
          {th('aiToolsTitle')}
        </h2>
        <Link
          href={toolkitHref}
          className="wa-kit-focus"
          aria-label={t('explore')}
          style={{ color: 'var(--wa-accent)', fontWeight: 700, minHeight: 44, display: 'inline-flex', alignItems: 'center' }}
        >
          {th('viewAll')}
        </Link>
      </div>
      <p className="wa-kit-meta" style={{ margin: '0 0 12px' }}>{th('aiAssistNote')}</p>
      {recommendedTool ? (
        <div style={{ marginBottom: 10 }} data-testid="recommended-tool" data-tool={recommendedTool.slug}>
          <p className="wa-kit-meta" style={{ margin: 0, fontWeight: 700 }}>{t('tryNext', { title: recommendedTool.title })}</p>
        </div>
      ) : null}
      <div className="wa-dense-grid wa-dense-grid--3">
        {tiles.map((tile) => (
          <article key={tile.slug} className="wa-kit-card wa-kit-card--sm">
            <h3 style={{ margin: 0, fontWeight: 800, fontSize: 'var(--wa-type-body)' }}>{tile.title}</h3>
            <p className="wa-kit-meta" style={{ margin: '6px 0 8px' }}>{tile.body}</p>
            <Link
              href={tile.href}
              className="wa-kit-focus"
              style={{ color: 'var(--wa-accent)', fontWeight: 700, minHeight: 44, display: 'inline-flex', alignItems: 'center' }}
            >
              {tile.title}
            </Link>
          </article>
        ))}
      </div>
      {recommendedTool ? (
        <div className="wa-flex wa-items-center wa-gap-3 wa-flex-wrap" style={{ marginTop: 12 }}>
          <KitLinkButton
            href={recommendedTool.href}
            label={recommendedTool.cta}
            variant="primary"
            size="md"
            className="wa-min-h-11 wa-max-w-full wa-whitespace-normal wa-h-auto"
          />
          <KitLinkButton href={toolkitHref} label={t('exploreAll')} size="md" className="wa-min-h-11 wa-max-w-full wa-whitespace-normal wa-h-auto" />
        </div>
      ) : null}
    </section>
  );
}
