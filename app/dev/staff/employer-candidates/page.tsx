import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import EmployerCandidatesHeader from '@/components/employer/EmployerCandidatesHeader';
import EmployerApplicationsClient from '@/components/employer/EmployerApplicationsClient';
import MobileApplicationsClient from '@/components/employer/MobileApplicationsClient';
import EmployerMatchHistoryClient from '@/components/employer/EmployerMatchHistoryClient';
import EmployerKanban from '@/components/employer/EmployerKanban';
import PortalPageFrame from '@/components/portal/PortalPageFrame';
import { DesignSurface } from '@/components/portal/kit';
import ThemeSelector from '@/components/theme/ThemeSelector';
import { employerCandidatesCopy, parseEmployerCandidateView, type EmployerCandidateParams } from '@/lib/employer/candidatesWorkspace';

export const dynamic = 'force-dynamic';

/** Actual workspace chrome and empty clients. No employer data reads or mutation targets. */
export default async function EmployerCandidatesProof({ searchParams }: { searchParams?: Promise<EmployerCandidateParams> }) {
  if (process.env.VERCEL_ENV === 'production') notFound();
  const params = (await searchParams) ?? {};
  const view = parseEmployerCandidateView(params.view);
  const t = await getTranslations('employer');
  const titles = { applicants: t('applicantsMetaTitle'), matches: t('matchHistoryMetaTitle'), pipeline: t('candidatePipeline') };
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
            <div className="wa-block md:wa-hidden wa-pb-8"><MobileApplicationsClient initialRows={[]} activeStatusFilter={null} activeSort="applied_desc" /></div>
            <div className="wa-hidden md:wa-block"><EmployerApplicationsClient initialRows={[]} activeStatusFilter={null} activeSort="applied_desc" /></div>
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
