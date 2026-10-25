import type { ReactNode } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { DesignSurface, PageOpener } from '@/components/portal/kit';
import { LinkTabs } from '@/components/portal/kit/LinkTabs';
import {
  STUDENTS_WORKSPACE_VIEWS,
  studentsWorkspaceHref,
  type StudentsReadinessView,
  type StudentsWorkspaceView,
} from '@/lib/admin/studentsWorkspace';

/** Compact shared chrome. Active tabs orient the visible workspace; a screen-reader
 * heading preserves the section outline. Data, filters and actions remain view-owned. */
export default function StudentsWorkspace({ view, readiness = 'interview', children, baseHref = '/admin/students' }: {
  view: StudentsWorkspaceView;
  readiness?: StudentsReadinessView;
  children: ReactNode;
  /** Preview proofs can keep view navigation on their fixture route. */
  baseHref?: string;
}) {
  const t = useTranslations('portalWorkspaces.students');
  const selected = STUDENTS_WORKSPACE_VIEWS.find((item) => item.id === view)!;
  return (
    <DesignSurface surface="dense" className="wa-p-4 md:wa-p-6">
      <PageOpener
        title={t('title')}
        action={
          <span className="wa-flex wa-flex-wrap wa-gap-3">
            <Link href="/admin/members/duplicates" className="wa-page-action">{t('duplicates')}</Link>
            <Link href="/admin/members/new" className="wa-kit-cta">{t('add')}</Link>
          </span>
        }
      />
      <LinkTabs label={t('viewsLabel')} activeKey={view} className="wa-my-5">
        {STUDENTS_WORKSPACE_VIEWS.map((item) => (
          <Link key={item.id} href={studentsWorkspaceHref(item.id).replace('/admin/students', baseHref)} className="wa-kit-tab" aria-current={view === item.id ? 'page' : undefined}>
            {t(`views.${item.id}.label`)}
          </Link>
        ))}
      </LinkTabs>
      {view === 'readiness' ? (
        <nav aria-label={t('readinessLabel')} className="wa-flex wa-flex-wrap wa-gap-2 wa-mb-5">
          <Link href={studentsWorkspaceHref('readiness', { readiness: 'interview' }).replace('/admin/students', baseHref)} className={`wa-kit-cta${readiness === 'interview' ? '' : ' wa-kit-cta--ghost'}`} aria-current={readiness === 'interview' ? 'page' : undefined}>{t('interview')}</Link>
          <Link href={studentsWorkspaceHref('readiness', { readiness: 'job' }).replace('/admin/students', baseHref)} className={`wa-kit-cta${readiness === 'job' ? '' : ' wa-kit-cta--ghost'}`} aria-current={readiness === 'job' ? 'page' : undefined}>{t('trainingThreshold')}</Link>
        </nav>
      ) : null}
      <section aria-label={t('region', { view: t(`views.${selected.id}.label`) })} data-students-workspace-view={view}>
        <h2 className="sr-only">{t(`views.${selected.id}.label`)}</h2>
        {children}
      </section>
    </DesignSurface>
  );
}
