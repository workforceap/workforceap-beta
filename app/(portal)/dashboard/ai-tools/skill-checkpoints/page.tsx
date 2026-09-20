import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { DesignSurface, PageOpener } from '@/components/portal/kit';
import PortalBreadcrumb from '@/components/portal/PortalBreadcrumb';
import SkillCheckpointsClient from '@/components/portal/SkillCheckpointsClient';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('skillCheckpoints');
  return buildPageMetadataAsync({
    title: t('metaTitle'),
    description: t('metaDesc'),
    path: '/dashboard/ai-tools/skill-checkpoints',
  });
}

export default async function SkillCheckpointsPage() {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/dashboard/ai-tools/skill-checkpoints');

  return (
    <DesignSurface surface="warm">
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '1.25rem 1rem 3rem' }} className="wa-space-y-5">
        <PortalBreadcrumb
          items={[
            { label: 'Career Toolkit', href: '/dashboard/ai-tools' },
            { label: 'Skill Checkpoints' },
          ]}
        />
        <PageOpener
          kicker="AI Career Toolkit"
          title="Skill Checkpoints"
          lede="Short workplace scenarios that prove you can use a skill — not just study it"
        />
        <SkillCheckpointsClient userId={user.id} />
      </div>
    </DesignSurface>
  );
}
