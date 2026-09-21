import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { resolveAdminPageTenant } from '@/lib/tenant/adminPageScope';
import { isReadOnlyPortalAuditHeader } from '@/lib/audit/readOnlyPortalAudit';
import {
  REPORTING_HUB_PATH,
  REPORTING_TAB_PARAM,
  parseReportingTab,
  type ReportingTabId,
} from '@/lib/admin/reportingHub';
import { ReportingHubKit } from '@/components/portal/kit/pages/admin-subviews/ReportingHubKit';
import { ReportingOverviewSection } from './sections/OverviewSection';
import { ReportingOutcomesSection } from './sections/OutcomesSection';
import { ReportingTrainingSection } from './sections/TrainingSection';
import { ReportingCourseraSection } from './sections/CourseraSection';
import { ReportingExportsSection } from './sections/ExportsSection';

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadataAsync({
    title: 'Reporting',
    description: 'Enrollment, outcomes, training progress, Coursera and exports for this organization in one place.',
    path: REPORTING_HUB_PATH,
  });
}

export const dynamic = 'force-dynamic';

/**
 * The admin reporting hub. Seven reporting routes (analytics, metrics, board,
 * outcomes, training progress, Coursera, exports) now forward here; each is
 * a tab that loads only its own data (`?tab=`), with the same role gate every
 * one of them had: signed-in org admin (or super-admin) via
 * `resolveAdminPageTenant`, members bounced to their dashboard.
 */
export default async function AdminReportingPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getUser();
  if (!user) redirect(`/login?redirectTo=${REPORTING_HUB_PATH}`);
  const scope = await resolveAdminPageTenant(user.id);
  if (!scope.ok) redirect('/dashboard');

  const params = (await searchParams) ?? {};
  const tab: ReportingTabId = parseReportingTab(params[REPORTING_TAB_PARAM]);
  const readOnlyAudit = isReadOnlyPortalAuditHeader(await headers());

  // Sections are async server components awaited here (not mounted as
  // elements) so the one tab's loaders run inside this request and a failed
  // load can still `redirect()` to its legacy fallback.
  let content: React.ReactNode;
  switch (tab) {
    case 'outcomes':
      content = await ReportingOutcomesSection({ scope, params });
      break;
    case 'training':
      content = await ReportingTrainingSection({ scope, readOnlyAudit });
      break;
    case 'coursera':
      content = await ReportingCourseraSection({ scope, userId: user.id, readOnlyAudit });
      break;
    case 'exports':
      content = await ReportingExportsSection();
      break;
    case 'overview':
    default:
      content = await ReportingOverviewSection({ scope, readOnlyAudit });
      break;
  }

  return <ReportingHubKit activeTab={tab}>{content}</ReportingHubKit>;
}
