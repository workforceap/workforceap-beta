import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { InterviewCoachKit } from '@/components/portal/kit/pages/member/InterviewCoachKit';
import { normalizeInterviewRole } from '@/lib/member/memberWorkspace';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard');
  return buildPageMetadataAsync({
    title: t('interviewCoachMetaTitle'),
    description: t('interviewCoachMetaDesc'),
    path: '/dashboard/ai-tools/interview-coach',
  });
}

export default async function InterviewCoachPage({ searchParams }: { searchParams?: Promise<{ role?: string }> }) {
  const user = await getUser();
  if (!user) {
    redirect('/login?redirectTo=/dashboard/ai-tools/interview-coach');
  }

  const params = await searchParams;
  return <InterviewCoachKit userId={user.id} initialRole={normalizeInterviewRole(params?.role)} />;
}
