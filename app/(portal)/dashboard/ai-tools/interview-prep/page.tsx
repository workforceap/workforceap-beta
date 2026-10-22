import { getTranslations } from 'next-intl/server';
import { getUser } from '@/lib/auth/server';
import { redirect } from 'next/navigation';
import { Metadata } from 'next';
import { buildPageMetadataAsync } from '@/app/seo';
import { InterviewPrepKit } from '@/components/portal/kit/pages/member/InterviewPrepKit';
import { normalizeInterviewRole } from '@/lib/member/memberWorkspace';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard');
  return buildPageMetadataAsync({
    title: t('interviewPrepMetaTitle'),
    description: t('interviewPrepMetaDesc'),
    path: '/dashboard/ai-tools/interview-prep',
  });
};

export default async function InterviewPrepBundlePage({ searchParams }: { searchParams?: Promise<{ role?: string }> } = {}) {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/dashboard/ai-tools/interview-prep');

  const params = await searchParams;
  return <InterviewPrepKit initialRole={normalizeInterviewRole(params?.role)} />;
}
