import { useTranslations } from 'next-intl';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { ArrowRight, Wand2 } from 'lucide-react';
import { KitLinkButton } from '@/components/portal/kit/KitLinkButton';
import type { MemberToolRecommendation } from '@/lib/member/recommendMemberTool';

/**
 * The AI Career Tools introduction card. The member home ("This week") no
 * longer renders it: the stage-specific pick is the last row of the This week
 * list and the tools are one link in the quiet link row. Kept for any surface
 * that wants a full introduction; a missing stage recommendation must not hide
 * the tools.
 */
export default function MemberAiToolsCard({
  toolkitHref,
  recommendedTool,
}: {
  toolkitHref: string;
  recommendedTool?: MemberToolRecommendation | null;
}) {
  const t = useTranslations('aiToolsDiscovery');
  return (
    <div className="wa-kit-card">
      <VStack as="section" gap={3} aria-labelledby="member-ai-tools-heading">
        <HStack gap={2} vAlign="center">
          <Wand2 size={22} aria-hidden="true" />
          <h2 id="member-ai-tools-heading" className="wa-kit-card-title">{t('title')}</h2>
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
    </div>
  );
}
