import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';
import dynamic from 'next/dynamic';
import { redirect } from 'next/navigation';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { SkillMapperKit } from '@/components/portal/kit/pages/member/SkillMapperKit';
import ToolHistoryPanel from '@/components/portal/ToolHistoryPanel';
import { loadSkillMapperContext } from '@/lib/member/loadSkillMapperContext';
import { ONET_OCCUPATION_CODE, type SavedSkillMapperRun } from '@/lib/member/skillMapperRun';

const SkillMapperClient = dynamic(() => import('@/components/portal/tools/SkillMapperClient'), {
  loading: () => (
    <div
      role="status"
      aria-live="polite"
      className="wa-kit-card"
      style={{
        padding: '2.5rem 1.25rem',
        textAlign: 'center',
        color: 'var(--wa-muted)',
        fontSize: '0.9rem',
        fontWeight: 600,
      }}
    >
      Loading Skill Mapper…
    </div>
  ),
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard');
  return buildPageMetadataAsync({
    title: t('skillMapperMetaTitle'),
    description: t('skillMapperMetaDesc'),
    path: '/dashboard/ai-tools/skill-mapper',
  });
}

export default async function SkillMapperPage({ searchParams }: {
  searchParams?: Promise<{ result?: string | string[]; code?: string | string[]; title?: string | string[] }>;
}) {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/dashboard/ai-tools/skill-mapper');
  const params = await searchParams;
  const t = await getTranslations('memberWorkspace.exploration');
  const requestedId = typeof params?.result === 'string' ? params.result : params?.result?.[0];
  let initialRun: SavedSkillMapperRun | null = null;
  let selectionError: string | undefined;
  if (requestedId) {
    try {
      const context = await loadSkillMapperContext(user.id, requestedId);
      initialRun = context.selected;
      if (context.selectionUnavailable) selectionError = t('selectionUnavailable');
    } catch (error) {
      console.error('[skill-mapper page] saved lookup failed', error);
      selectionError = t('selectionLoadFailed');
    }
  }
  const initialTarget = !requestedId && typeof params?.code === 'string' && ONET_OCCUPATION_CODE.test(params.code)
    ? { code: params.code, title: typeof params.title === 'string' ? params.title.slice(0, 200) : params.code }
    : undefined;

  return (
    <SkillMapperKit>
      <SkillMapperClient key={initialRun?.id ?? initialTarget?.code ?? requestedId ?? 'search'} initialRun={initialRun} initialTarget={initialTarget} selectionError={selectionError} />
      <ToolHistoryPanel
        userId={user.id}
        toolType="skill_assessment"
        inputSummaryStartsWith="Skill mapper lookup"
        title="Recent Skill Mapper Lookups"
      />
    </SkillMapperKit>
  );
}
