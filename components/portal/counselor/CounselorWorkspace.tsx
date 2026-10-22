import type { ReactNode } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { DesignSurface, PageOpener, SectionHeader } from '@/components/portal/kit';
import { LinkTabs } from '@/components/portal/kit/LinkTabs';
import {
  COUNSELOR_ATTENTION_FILTERS,
  COUNSELOR_WORKSPACE_VIEWS,
  counselorWorkspaceHref,
  type CounselorAttentionFilter,
  type CounselorWorkspaceView,
} from '@/lib/counselor/workspace';

/** One counselor workspace, with link navigation so only the selected view
 * loads. Existing queue components and their real actions live inside it. */
export default function CounselorWorkspace({
  view,
  filter = 'all',
  children,
  baseHref = '/counselor/today',
}: {
  view: CounselorWorkspaceView;
  filter?: CounselorAttentionFilter;
  children: ReactNode;
  /** Preview proofs can keep view navigation on their fixture route. */
  baseHref?: string;
}) {
  const t = useTranslations('portalWorkspaces.counselor');
  const current = COUNSELOR_WORKSPACE_VIEWS.find((item) => item.id === view)!;
  return (
    <DesignSurface surface="dense" className="wa-p-4 md:wa-p-6">
      <PageOpener
        kicker={t('kicker')}
        title={t('title')}
        lede={t('lede')}
        action={<Link href="/counselor/students" className="wa-page-action" data-tour="tour-today-roster">{t('allMembers')}</Link>}
      />
      <LinkTabs label={t('viewsLabel')} activeKey={view} className="wa-my-5">
        {COUNSELOR_WORKSPACE_VIEWS.map((item) => (
          <Link key={item.id} href={counselorWorkspaceHref(item.id).replace('/counselor/today', baseHref)} className="wa-kit-tab" aria-current={view === item.id ? 'page' : undefined}>
            {t(`views.${item.id}.label`)}
          </Link>
        ))}
      </LinkTabs>
      <SectionHeader title={t(`views.${current.id}.label`)} goal={t(`views.${current.id}.description`)} />
      {view === 'attention' ? (
        <nav aria-label={t('filtersLabel')} className="wa-flex wa-flex-wrap wa-gap-2 wa-mb-5">
          {COUNSELOR_ATTENTION_FILTERS.map((item) => (
            <Link
              key={item.id}
              data-tour={item.id === 'at-risk' ? 'tour-nav-at-risk' : undefined}
              href={counselorWorkspaceHref('attention', item.id === 'all' ? {} : { filter: item.id }).replace('/counselor/today', baseHref)}
              className={`wa-kit-cta${filter === item.id ? '' : ' wa-kit-cta--ghost'}`}
              aria-current={filter === item.id ? 'page' : undefined}
            >
              {t(`filters.${item.id}`)}
            </Link>
          ))}
        </nav>
      ) : null}
      <section aria-label={t('region', { view: t(`views.${current.id}.label`) })} data-counselor-workspace-view={view}>
        {children}
      </section>
    </DesignSurface>
  );
}
