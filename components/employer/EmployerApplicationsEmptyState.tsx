import { createTranslator } from 'next-intl';
import { KitEmptyState } from '@/components/portal/kit';
import { employerApplicationsListHref, type EmployerApplicationsSort } from '@/lib/employer/employerApplicationsListQuery';
import type { EmployerApplicationsEmptyCase } from '@/lib/employer/applicationEmptyState';
import { jobApplicationStatusLabel } from '@/lib/status/jobApplicationStatusVocabulary';
import scopedMessages from '@/messages/scoped/employer-applications.en.json';

/** Stage-zero and empty-page recovery; both clear status/page and keep the sort. */
export default function EmployerApplicationsEmptyState({
  emptyCase,
  activeSort,
}: {
  emptyCase: EmployerApplicationsEmptyCase;
  activeSort: EmployerApplicationsSort;
}) {
  // English-only catalog, never merged into the request messages: es/fr/pt copy
  // is held for native review (docs/qa/employer-applications-empty-states.md).
  const t = createTranslator({ locale: 'en', messages: scopedMessages, namespace: 'empty.employer' });
  const href = employerApplicationsListHref({ sort: activeSort });
  if (emptyCase.kind === 'stage') {
    return (
      <KitEmptyState
        framed
        kind="filtered"
        headingAs="h3"
        title={t('applicationsFiltered.title', { stage: jobApplicationStatusLabel(emptyCase.stage, 'employer') })}
        description={t('applicationsFiltered.body')}
        primaryAction={{ label: t('applicationsFiltered.action'), href }}
      />
    );
  }
  return (
    <KitEmptyState
      framed
      kind="filtered"
      headingAs="h3"
      title={t('applicationsPage.title')}
      description={t('applicationsPage.body')}
      primaryAction={{ label: t('applicationsPage.action'), href }}
    />
  );
}
