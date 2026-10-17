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
 * must not hide the tools. Rows link to the live tool routes (or the
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
      <div className="wa-flex wa-items-center wa-justify-between wa-gap-3" style={{ marginBottom: 10 }}>
        <h2 id="member-ai-tools-heading" style={{ margin: 0, fontWeight: 800, fontSize: 'var(--wa-type-body)' }}>
          {th('aiToolsTitle')}
        </h2>
        <Link
          href={toolkitHref}
          className="wa-kit-focus"
          aria-label={t('explore')}
          style={{ color: 'var(--wa-accent)', fontWeight: 700, minHeight: 44, display: 'inline-flex', alignItems: 'center' }}
        >
          {th('openHub')}
        </Link>
      </div>
      <p className="wa-kit-meta" style={{ margin: '0 0 10px' }}>{th('aiAssistNote')}</p>
      {recommendedTool ? (
        <div style={{ marginBottom: 10 }} data-testid="recommended-tool" data-tool={recommendedTool.slug}>
          <p className="wa-kit-meta" style={{ margin: 0, fontWeight: 700 }}>{t('tryNext', { title: recommendedTool.title })}</p>
        </div>
      ) : null}
      <div style={{ display: 'grid', gap: 6 }}>
        {tiles.map((tile) => (
          <Link
            key={tile.slug}
            href={tile.href}
            className="wa-kit-focus"
            style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', textDecoration: 'none', color: 'inherit', minHeight: 44 }}
          >
            <span style={{ minWidth: 0 }}>
              <strong style={{ display: 'block', fontSize: 'var(--wa-type-body)', fontWeight: 800 }}>{tile.title}</strong>
              <span className="wa-kit-meta">{tile.body}</span>
            </span>
            <span className="wa-kit-meta" style={{ color: 'var(--wa-accent)', fontWeight: 700, flexShrink: 0 }}>{tile.title}</span>
          </Link>
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
