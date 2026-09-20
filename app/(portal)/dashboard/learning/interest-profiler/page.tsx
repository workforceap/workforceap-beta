import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { headers } from 'next/headers';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { isReadOnlyPortalAuditHeader } from '@/lib/audit/readOnlyPortalAudit';
import InterestProfilerClient from '@/components/portal/InterestProfilerClient';
import { PageOpener } from '@/components/portal/kit';

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadataAsync({
  title: 'O*NET Interest Profiler',
  description:
    'Take the Mini Interest Profiler (30 questions) and see how your interests line up with WorkforceAP programs.',
  path: '/dashboard/learning/interest-profiler',
});
}

export default async function InterestProfilerPage() {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/dashboard/learning/interest-profiler');
  const readOnlyAudit = isReadOnlyPortalAuditHeader(await headers());

  if (readOnlyAudit) {
    return (
      <div
        data-portal-audit-suppressed="onet-interest-profiler-external-questions"
        style={{ maxWidth: 720, margin: '0 auto', padding: '1.5rem 1rem 3rem' }}
      >
        <PageOpener className="wa-mb-5" kicker="Learning hub" title="O*NET Interest Profiler" />
        <p>
          This interactive assessment is available to members. Its external question feed is intentionally not
          consumed during the read-only release audit.
        </p>
        <Link href="/dashboard/learning" className="btn btn-outline">
          Back to Learning Hub
        </Link>
      </div>
    );
  }

  return (
    <>
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '1.5rem 1rem 3rem' }}>
      <PageOpener
        className="wa-mb-5"
        kicker="Learning hub"
        title="O*NET Interest Profiler"
        lede="Rate 30 short activities to see how your interests line up with WorkforceAP programs."
      />
      <InterestProfilerClient />
    </div>    </>
  );
}
