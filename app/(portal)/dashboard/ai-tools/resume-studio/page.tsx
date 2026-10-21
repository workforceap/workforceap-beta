import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { headers } from 'next/headers';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { getMemberResumeLoadResult, type MemberResumeLoadStatus } from '@/lib/member/getMemberResumePlainText';
import ToolHistoryPanel from '@/components/portal/ToolHistoryPanel';
import { ResumeStudioKit } from '@/components/portal/kit/pages/member/ResumeStudioKit';
import { isReadOnlyPortalAuditHeader } from '@/lib/audit/readOnlyPortalAudit';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('resumeStudio');
  return buildPageMetadataAsync({
    title: t('metaTitle'),
    description: t('metaDesc'),
    path: '/dashboard/ai-tools/resume-studio',
  });
}

export default async function ResumeStudioPage() {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/dashboard/ai-tools/resume-studio');
  const readOnlyAudit = isReadOnlyPortalAuditHeader(await headers());

  const t = await getTranslations('resumeStudio');

  let loadStatus: MemberResumeLoadStatus = 'unavailable';
  try {
    const result = await getMemberResumeLoadResult(user.id, 200, { readOnlyAudit });
    loadStatus = result.status;
  } catch (err) {
    console.error('[resume-studio page] resume check failed', err);
  }

  return (
    <Suspense fallback={null}>
      <>
        {readOnlyAudit && (
          <span hidden data-portal-audit-suppressed="resume-studio-storage-provider" />
        )}
        {loadStatus === 'unavailable' ? <span hidden data-portal-error-state="resume-studio-resume-load" /> : null}
        <ResumeStudioKit
          hasResume={loadStatus === 'available'}
          loadStatus={loadStatus}
          scoreHistorySlot={<ToolHistoryPanel userId={user.id} toolType="resume_analysis" />}
          rewriteHistorySlot={
            <ToolHistoryPanel userId={user.id} toolType="resume_rewriter" title={t('rewriteHistoryTitle')} />
          }
        />
      </>
    </Suspense>
  );
}
