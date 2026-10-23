import { getMemberState } from '@/lib/member/getMemberState';
import type { Metadata } from 'next';
import dynamic from 'next/dynamic';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import Link from 'next/link';
import { Suspense } from 'react';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { getMemberDashboardAccess } from '@/lib/auth/memberDashboardAccess';
import { prisma } from '@/lib/db/prisma';
import { withDbRetry } from '@/lib/db/withDbRetry';
import { ensureAppUserProvisioned } from '@/lib/member/ensureAppUser';
import { isReadOnlyPortalAuditHeader } from '@/lib/audit/readOnlyPortalAudit';
import { getTranslations } from 'next-intl/server';
import { DesignSurface, PageOpener } from '@/components/portal/kit';
import ResumeStudioClient from '@/components/portal/ResumeStudioClient';
import ToolHistoryPanel from '@/components/portal/ToolHistoryPanel';
import styles from '@/components/portal/MemberWorkspace.module.css';
import resumeStyles from '@/components/portal/ResumeStudio.module.css';

const ResumeClient = dynamic(() => import('./ResumeClient'), {
  loading: () => (
    <div
      role="status"
      aria-live="polite"
      className="wa-kit-card"
      style={{
        minHeight: 280,
        padding: '2.5rem 1.25rem',
        textAlign: 'center',
        color: 'var(--wa-muted)',
        fontSize: '0.9rem',
        fontWeight: 600,
      }}
    >
      Loading resume tools…
    </div>
  ),
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('memberWorkspace.resume');
  return buildPageMetadataAsync({
    title: t('metaTitle'),
    description: t('metaDescription'),
    path: '/dashboard/resume',
  });
}

export default async function DashboardResumePage() {
  const user = await getUser();
  if (!user) redirect("/login?redirectTo=/dashboard/resume");
  const access = await getMemberDashboardAccess(user.id);
  if (access.redirectTo) redirect(access.redirectTo);
  const t = await getTranslations('profile');
  const tw = await getTranslations('memberWorkspace.resume');
  const readOnlyAudit = isReadOnlyPortalAuditHeader(await headers());

  // Single source of truth: getMemberState returns consistent profile % across
  // all surfaces. It throws "Member not found" when the app `users` row is
  // missing (orphaned Supabase auth user). Self-heal by provisioning the row
  // and retrying once before giving up — the root layout normally provisions on
  // entry, but guard here so a direct hit never 500s. Reads wrapped in
  // withDbRetry to ride out a transient pooler blip (2026-06-30 incident).
  let memberState;
  try {
    memberState = await withDbRetry(() => getMemberState(user.id, { readOnlyAudit }));
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Member not found')) {
      await ensureAppUserProvisioned(user, { readOnlyAudit });
      memberState = await withDbRetry(() => getMemberState(user.id, { readOnlyAudit }));
    } else {
      throw err;
    }
  }
  const completeness = memberState.profileCompletenessPct;

  // The member state already resolves profile and account phone from its owned user read.
  const profile = await withDbRetry(() =>
    prisma.profile.findUnique({
      where: { userId: user.id },
      select: {
        resumeOriginalPath: true,
        resumeEnhancedPath: true,
      },
    }),
  );

  const fields = {
    name: memberState.fullName ?? "",
    email: memberState.email ?? "",
    phone: memberState.contactPhone ?? "",
  };

  return (
    <DesignSurface surface="warm">
      <div className={styles.workspace}>
        <PageOpener
          className={resumeStyles.opener}
          kicker="AI Career Tools"
          title={t('resume')}
          lede={tw('intro')}
          action={
            <Link href="/dashboard/ai-tools" className="wa-page-action wa-kit-focus">
              {tw('design.backToTools')}
            </Link>
          }
        />
        {readOnlyAudit && (
          <span hidden data-portal-audit-suppressed="resume-storage-provider-and-member-state-cache" />
        )}
        <Suspense fallback={null}>
          <ResumeStudioClient
            basePath="/dashboard/resume"
            hasResume={!!(profile?.resumeOriginalPath || profile?.resumeEnhancedPath)}
            filesSlot={
              <ResumeClient
                completeness={completeness}
                witData={{ ...fields, recentEmployer: '', targetJob: '', skills: '' }}
                hasOriginal={!!profile?.resumeOriginalPath}
                hasEnhanced={!!profile?.resumeEnhancedPath}
                layout="side-by-side"
              />
            }
            scoreHistorySlot={<ToolHistoryPanel userId={user.id} toolType="resume_analysis" />}
            rewriteHistorySlot={<ToolHistoryPanel userId={user.id} toolType="resume_rewriter" title={tw('rewriteHistory')} />}
          />
        </Suspense>
      </div>
    </DesignSurface>
  );
}
