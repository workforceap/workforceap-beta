import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { DesignSurface, PageOpener, StatusTag } from '@/components/portal/kit';
import PortalBreadcrumb from '@/components/portal/PortalBreadcrumb';
import TrainingBridgeClient from '@/components/portal/TrainingBridgeClient';
import { MemberCareerSteps } from '@/components/portal/MemberCareerSteps';
import { loadSkillMapperContext } from '@/lib/member/loadSkillMapperContext';
import type { SavedSkillMapperRun } from '@/lib/member/skillMapperRun';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('trainingBridge');
  return buildPageMetadataAsync({ title: t('metaTitle'), description: t('metaDesc'), path: '/dashboard/ai-tools/training-bridge' });
}

export default async function TrainingBridgePage({ searchParams }: {
  searchParams?: Promise<{ result?: string | string[] }>;
} = {}) {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/dashboard/ai-tools/training-bridge');
  const t = await getTranslations('trainingBridge');
  const tw = await getTranslations('memberWorkspace.training');
  const params = await searchParams;
  const requestedId = typeof params?.result === 'string' ? params.result : params?.result?.[0];
  let assessment: SavedSkillMapperRun | null = null;
  let recent: SavedSkillMapperRun[] = [];
  let selectionUnavailable = false;
  let assessmentLoadFailed = false;
  try {
    const context = await loadSkillMapperContext(user.id, requestedId);
    const selected = context.selected;
    assessment = selected;
    recent = context.recent;
    selectionUnavailable = context.selectionUnavailable;
    if (selected && !recent.some(run => run.id === selected.id)) recent = [selected, ...recent];
  } catch (err) {
    assessmentLoadFailed = true;
    console.error('[training-bridge page] assessment lookup failed', err);
  }

  return (
    <DesignSurface surface="warm">
      <div style={{ maxWidth: 900, margin: '0 auto', padding: 'var(--wa-pad-sm)' }} className="wa-space-y-5">
        {assessmentLoadFailed ? <span hidden data-portal-error-state="training-bridge-assessment-load" /> : null}
        <PortalBreadcrumb items={[{ label: 'AI Career Tools', href: '/dashboard/ai-tools' }, { label: t('title') }]} />
        <PageOpener kicker="AI Career Tools" title={t('title')} lede={tw('bridgeIntro')} action={<StatusTag tone="info">{t('betaTag')}</StatusTag>} />
        <MemberCareerSteps current="training" resultId={assessment?.id} />
        <TrainingBridgeClient
          key={assessment?.id ?? requestedId ?? 'general'}
          assessment={assessment}
          recentAssessments={recent}
          selectionUnavailable={selectionUnavailable}
          loadFailed={assessmentLoadFailed}
        />
      </div>
    </DesignSurface>
  );
}
