import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { isSuperAdmin } from '@/lib/auth/roles';
import { CSP_VIOLATION_BUCKET_RETENTION_DAYS } from '@/lib/retention/config';
import { loadCspViolationOverview } from '@/lib/security/cspViolationStore';
import { CspReportView } from '@/components/admin/CspReportView';

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadataAsync({
    title: 'CSP violation reports',
    description: 'Aggregated Content-Security-Policy violation reports from the Report-Only soak (WAP-36).',
    path: '/admin/csp-report',
  });
}

/**
 * /admin/csp-report — super-admin-only, read-only viewer for the aggregated
 * CSP violation reports the `/api/csp-report` sink persists (WAP-36 phase 2
 * prep). Guard order copies `/admin/data-retention`: unauthenticated → login,
 * authenticated non-super-admin → /admin. Platform-wide data, so no tenant
 * scope is applied on purpose (see the table's migration comment).
 */
export default async function AdminCspReportPage() {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/admin/csp-report');

  const superAdmin = await isSuperAdmin(user.id);
  if (!superAdmin) redirect('/admin');

  const overview = await loadCspViolationOverview();

  return (
    <CspReportView
      total24h={overview.total24h}
      total7d={overview.total7d}
      enforced7d={overview.enforced7d}
      bucketCount={overview.bucketCount}
      generatedAt={overview.generatedAt.toISOString()}
      retentionDays={CSP_VIOLATION_BUCKET_RETENTION_DAYS}
      groups={overview.groups.map((group) => ({
        directive: group.directive,
        blockedHost: group.blockedHost,
        count: group.count,
        documentPaths: group.documentPaths,
        documentPathCount: group.documentPathCount,
        dispositions: group.dispositions,
        firstSeenAt: group.firstSeenAt.toISOString(),
        lastSeenAt: group.lastSeenAt.toISOString(),
      }))}
    />
  );
}
