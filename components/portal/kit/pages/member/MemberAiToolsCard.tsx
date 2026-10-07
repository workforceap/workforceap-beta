'use client';

import { useTranslations } from 'next-intl';
import { Card } from '@astryxdesign/core/Card';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { ArrowRight, Wand2 } from 'lucide-react';
import { KitLinkButton } from '@/components/portal/kit/KitLinkButton';
import type { MemberToolRecommendation } from '@/lib/member/recommendMemberTool';

/** A permanent home entry point; a missing stage recommendation must not hide the tools. */
export default function MemberAiToolsCard({
  toolkitHref,
  recommendedTool,
}: {
  toolkitHref: string;
  recommendedTool?: MemberToolRecommendation | null;
}) {
  const t = useTranslations('aiToolsDiscovery');
  return (
    <Card>
      <VStack as="section" gap={3} aria-labelledby="member-ai-tools-heading">
        <HStack gap={2} vAlign="center">
          <Wand2 size={22} aria-hidden="true" />
          <h2 id="member-ai-tools-heading" className="wa-text-lg wa-font-bold">{t('title')}</h2>
        </HStack>
        <p className="wa-kit-lede wa-m-0">
          {t('homeIntro')}
        </p>
        {recommendedTool ? (
          <VStack gap={2} data-testid="recommended-tool" data-tool={recommendedTool.slug}>
            <h3 className="wa-text-base wa-font-bold">{t('tryNext', { title: recommendedTool.title })}</h3>
            <p className="wa-kit-lede wa-m-0">{recommendedTool.body}</p>
          </VStack>
        ) : null}
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
