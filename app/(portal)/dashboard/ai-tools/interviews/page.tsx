import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import InterviewWorkspaceClient from '@/components/portal/InterviewWorkspaceClient';
import { ToolkitToolChrome } from '@/components/portal/kit/pages/member/ToolkitToolChrome';
import { normalizeInterviewRole } from '@/lib/member/memberWorkspace';
import { MessagesSquare } from 'lucide-react';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('memberWorkspace.interviews');
  return buildPageMetadataAsync({ title: t('title'), description: t('description'), path: '/dashboard/ai-tools/interviews' });
}

export default async function InterviewsPage({ searchParams }: { searchParams?: Promise<{ role?: string }> }) {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/dashboard/ai-tools/interviews');
  const params = await searchParams;
  const t = await getTranslations('memberWorkspace.interviews');
  return (
    <ToolkitToolChrome title={t('title')} lede={t('intro')} icon={<MessagesSquare size={16} aria-hidden="true" />}>
      <InterviewWorkspaceClient initialRole={normalizeInterviewRole(params?.role)} />
    </ToolkitToolChrome>
  );
}
