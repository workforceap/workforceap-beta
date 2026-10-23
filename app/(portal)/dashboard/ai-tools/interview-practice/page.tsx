import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { prisma } from '@/lib/db/prisma';
import { prefillInterviewPractice } from '@/lib/ai/prefillFromMemberState';
import { InterviewPracticeKit } from '@/components/portal/kit/pages/member/InterviewPracticeKit';
import { normalizeInterviewRole } from '@/lib/member/memberWorkspace';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard');
  return buildPageMetadataAsync({
    title: t('interviewPracticeMetaTitle'),
    description: t('interviewPracticeMetaDesc'),
    path: '/dashboard/ai-tools/interview-practice',
  });
}

type SearchParams = Promise<{ prefill?: string; role?: string }>;

export default async function InterviewPracticePage({ searchParams }: { searchParams: SearchParams }) {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/dashboard/ai-tools/interview-practice');

  let savedResults: { id: string; inputSummary: string | null; output: string | null; createdAt: Date }[] = [];
  let savedResultsLoadFailed = false;
  try {
    savedResults = await prisma.aIToolResult.findMany({
      where: { userId: user.id, toolType: 'interview_practice' },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { id: true, inputSummary: true, output: true, createdAt: true },
    });
  } catch (error) {
    savedResultsLoadFailed = true;
    console.error('[interview-practice page] saved results query failed', error);
  }

  const sp = await searchParams;
  const shouldPrefill = sp.prefill === 'true';
  let initialData: { role: string; experienceLevel: 'entry' | 'mid' | 'senior'; resumeContext: string } | null = null;
  if (shouldPrefill) {
    try {
      initialData = await prefillInterviewPractice(user.id);
    } catch (err) {
      console.error('[interview-practice page] prefill failed', err);
    }
  }
  // URL role param overrides prefill
  const targetRole = normalizeInterviewRole(sp.role);
  if (targetRole) {
    initialData = { ...(initialData ?? { experienceLevel: 'mid', resumeContext: '' }), role: targetRole };
  }

  return (
    <>
      {savedResultsLoadFailed ? (
        <span hidden data-portal-error-state="interview-practice-results-load" />
      ) : null}
      <InterviewPracticeKit memberId={user.id} initialData={initialData} savedResults={savedResults} />
    </>
  );
}
