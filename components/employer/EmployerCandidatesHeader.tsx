import type { ReactNode } from 'react';
import Link from 'next/link';
import EmployerPageOpener from './EmployerPageOpener';
import { SectionHeader } from '@/components/portal/kit/SectionHeader';
import { LinkTabs } from '@/components/portal/kit/LinkTabs';
import {
  EMPLOYER_CANDIDATE_VIEWS,
  employerCandidatesHref,
  type EmployerCandidateParams,
  type EmployerCandidateView,
  type EmployerCandidatesCopy,
} from '@/lib/employer/candidatesWorkspace';

/**
 * One hiring workspace heading and link-based views. A navigation requests
 * only the selected server view; no hidden application/match loaders run.
 * Tabs supply general orientation; the section retains view-specific counts
 * and explanations rather than repeating a workspace description above it.
 */
export default function EmployerCandidatesHeader({
  activeView,
  copy,
  kicker,
  title,
  subtitle,
  action,
  params,
  baseHref,
}: {
  activeView: EmployerCandidateView;
  copy: EmployerCandidatesCopy;
  kicker: string;
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
  params?: EmployerCandidateParams;
  /** Preview proofs can keep view navigation on their fixture route. */
  baseHref?: string;
}) {
  return (
    <>
      <EmployerPageOpener kicker={kicker} title={copy.title} action={action} />
      <LinkTabs label={copy.navLabel} activeKey={activeView} className="wa-mb-5" data-testid="employer-candidate-views">
        {EMPLOYER_CANDIDATE_VIEWS.map((view) => (
          <Link
            key={view}
            href={employerCandidatesHref(view, params, baseHref)}
            prefetch={false}
            className="wa-kit-tab"
            aria-current={view === activeView ? 'page' : undefined}
            data-candidate-view={view}
            data-tour={view === 'applicants' ? undefined : `tour-${view}`}
          >
            {copy.views[view]}
          </Link>
        ))}
      </LinkTabs>
      <SectionHeader title={title} goal={typeof subtitle === 'string' ? subtitle : undefined} />
      {subtitle && typeof subtitle !== 'string' ? <p className="wa-page-opener-lede wa-mb-5">{subtitle}</p> : null}
    </>
  );
}
