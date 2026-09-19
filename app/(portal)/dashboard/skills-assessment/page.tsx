import type { Metadata } from 'next';
import { permanentRedirect } from 'next/navigation';
import { buildPageMetadataAsync } from '@/app/seo';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard');
  return buildPageMetadataAsync({
    title: t('assessmentMetaTitle'),
    description: t('assessmentMetaDesc'),
    path: '/dashboard/assessment',
  });
}

export default function SkillsAssessmentRedirectPage() {
  permanentRedirect('/dashboard/assessment');
}
