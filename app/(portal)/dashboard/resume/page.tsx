import { getMemberState } from '@/lib/member/getMemberState';
import type { Metadata } from 'next';
import dynamic from 'next/dynamic';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import Link from 'next/link';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { prisma } from '@/lib/db/prisma';
import { withDbRetry } from '@/lib/db/withDbRetry';
import { ensureAppUserProvisioned } from '@/lib/member/ensureAppUser';
import { isReadOnlyPortalAuditHeader } from '@/lib/audit/readOnlyPortalAudit';
import { getTranslations } from 'next-intl/server';
import { DesignSurface, PageOpener } from '@/components/portal/kit';

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
  return buildPageMetadataAsync({
    title: 'My Resume',
    description: 'Upload, view, and AI-generate your professional resume.',
    path: '/dashboard/resume',
  });
}

export default async function DashboardResumePage() {
  const user = await getUser();
  if (!user) redirect("/login?redirectTo=/dashboard/resume");
  const t = await getTranslations('profile');
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

  // Still need profile for resume paths
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
    phone: "", // getMemberState doesn't expose phone currently
  };

  return (
    <DesignSurface surface="warm">
      <div style={{ padding: "1.25rem 1rem 0", borderBottom: "1px solid var(--wa-border)", background: "var(--wa-surface)" }}>
        <PageOpener
          className="wa-mb-5"
          kicker="Career toolkit"
          title={t('resume')}
          lede="Upload your resume, review it inline, or build one from your profile."
          action={
            <Link href="/dashboard/ai-tools" className="wa-kit-cta wa-kit-cta--ghost">
              Career Toolkit
            </Link>
          }
        />
      </div>
      {readOnlyAudit && (
        <span hidden data-portal-audit-suppressed="resume-storage-provider-and-member-state-cache" />
      )}
      {/* ── Mobile ── */}
      <div className="md:wa-hidden" style={{ paddingBottom: "6rem" }}>
        <div style={{ padding: "1rem" }}>
          <ResumeClient
            completeness={completeness}
            witData={{
              name: fields.name,
              email: fields.email,
              phone: fields.phone,
              recentEmployer: "",
              targetJob: "",
              skills: "",
            }}
            hasOriginal={!!profile?.resumeOriginalPath}
            hasEnhanced={!!profile?.resumeEnhancedPath}
          />
        </div>      </div>

      {/* ── Desktop ── */}
      <div
        className="wa-hidden md:wa-block"
        style={{ background: "var(--wa-bg)", minHeight: "100vh" }}
      >
        <div style={{ padding: "2rem" }}>
          <ResumeClient
            completeness={completeness}
            witData={{
              name: fields.name,
              email: fields.email,
              phone: fields.phone,
              recentEmployer: "",
              targetJob: "",
              skills: "",
            }}
            hasOriginal={!!profile?.resumeOriginalPath}
            hasEnhanced={!!profile?.resumeEnhancedPath}
            layout="side-by-side"
          />
        </div>
      </div>
    </DesignSurface>
  );
}
