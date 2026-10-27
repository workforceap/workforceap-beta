import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import EmployerCandidatesHeader from '@/components/employer/EmployerCandidatesHeader';
import EmployerApplicationsClient from '@/components/employer/EmployerApplicationsClient';
import MobileApplicationsClient from '@/components/employer/MobileApplicationsClient';
import EmployerMatchHistoryClient from '@/components/employer/EmployerMatchHistoryClient';
import EmployerKanban from '@/components/employer/EmployerKanban';
import PortalPageFrame from '@/components/portal/PortalPageFrame';
import { DesignSurface } from '@/components/portal/kit';
import ThemeSelector from '@/components/theme/ThemeSelector';
import { employerCandidatesCopy, firstCandidateParam, parseEmployerCandidateView, type EmployerCandidateParams } from '@/lib/employer/candidatesWorkspace';
import { parseEmployerApplicationStatusFilter, parseEmployerApplicationsSort } from '@/lib/employer/employerApplicationsListQuery';
import type { EmployerApplicationsEmptyContext } from '@/lib/employer/applicationEmptyState';

export const dynamic = 'force-dynamic';

/**
 * Synthetic applicant empty scenarios: `empty=stage` (a selected stage, default
 * Reviewing, with a zero total) and `empty=page` (a positive total, no rows). The
 * request locale gates them exactly as in the authorized view.
 */
function applicantScenario(params: EmployerCandidateParams, locale: string) {
  const empty = firstCandidateParam(params.empty);
  const sort = parseEmployerApplicationsSort(firstCandidateParam(params.sort));
  const status = parseEmployerApplicationStatusFilter(firstCandidateParam(params.status));
  if (empty === 'stage') {
    const emptyContext: EmployerApplicationsEmptyContext = { locale, filteredTotal: 0 };
    return { status: status ?? 'reviewing', sort, emptyContext };
  }
  if (empty === 'page') {
    const emptyContext: EmployerApplicationsEmptyContext = { locale, filteredTotal: 26 };
    return { status, sort, emptyContext };
  }
  return { status: null, sort: 'applied_desc' as const, emptyContext: undefined };
}

/** Actual workspace chrome and empty clients. No employer data reads or mutation targets. */
export default async function EmployerCandidatesProof({ searchParams }: { searchParams?: Promise<EmployerCandidateParams> }) {
  if (process.env.VERCEL_ENV === 'production') notFound();
  const params = (await searchParams) ?? {};
  const view = parseEmployerCandidateView(params.view);
  const [t, locale] = await Promise.all([getTranslations('employer'), getLocale()]);
  const titles = { applicants: t('applicantsMetaTitle'), matches: t('matchHistoryMetaTitle'), pipeline: t('candidatePipeline') };
  const scenario = applicantScenario(params, locale);
  return (
    <DesignSurface surface="dense" className="wa-p-6">
      <PortalPageFrame>
        <div className="wa-flex wa-flex-wrap wa-items-center wa-justify-between wa-gap-4 wa-mb-5">
          <p role="note" className="wa-kit-meta">Preview fixture: the Candidates workspace and its existing empty views. Hiring records and actions use the authenticated employer portal.</p>
          <ThemeSelector />
        </div>
        <EmployerCandidatesHeader activeView={view} copy={employerCandidatesCopy(t)} kicker={t('employerPortal')}
          title={titles[view]} params={params} baseHref="/dev/staff/employer-candidates" />
        {view === 'applicants' ? (
          <>
            <div className="wa-block md:wa-hidden wa-pb-8"><MobileApplicationsClient initialRows={[]} activeStatusFilter={scenario.status} activeSort={scenario.sort} emptyContext={scenario.emptyContext} /></div>
            <div className="wa-hidden md:wa-block"><EmployerApplicationsClient initialRows={[]} activeStatusFilter={scenario.status} activeSort={scenario.sort} emptyContext={scenario.emptyContext} /></div>
          </>
        ) : view === 'matches' ? (
          <EmployerMatchHistoryClient initialRows={[]} />
        ) : (
          <EmployerKanban initialMatches={[]} />
        )}
      </PortalPageFrame>
    </DesignSurface>
  );
}
