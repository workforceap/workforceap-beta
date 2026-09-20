import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { getTranslations } from 'next-intl/server';
import { resolveAdminPageTenant } from '@/lib/tenant/adminPageScope';
import { isReadOnlyPortalAuditHeader } from '@/lib/audit/readOnlyPortalAudit';
import { StudentsRosterKit } from '@/components/portal/kit/pages/admin-subviews/StudentsRosterKit';
import {
  STUDENTS_SECONDARY_LOAD_NOTICE,
  loadStudentsRoster,
} from '@/lib/admin/studentsRosterLoad';
import { loadTrainingRoster } from '@/lib/admin/trainingRosterLoad';
import {
  STUDENTS_ROSTER_VIEW_HREFS,
  TRAINING_PROGRESS_LEGACY_HREF,
  parseStudentsRosterView,
} from '@/lib/admin/studentsRosterView';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('admin');
  return buildPageMetadataAsync({
    title: t('adminStudents') || 'Students',
    description: t('studentListAndManagement') || 'View and manage student accounts',
    path: '/admin/students',
  });
}

/**
 * The one admin roster. `?view=training` swaps the column preset to training
 * progress (same kit, same member population); the default is the Students
 * roster. `?ui=legacy` forwards to the management hub (/admin/members).
 */
export default async function AdminStudentsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/admin/students');

  const scope = await resolveAdminPageTenant(user.id);
  if (!scope.ok) redirect('/dashboard');

  const params = (await searchParams) ?? {};
  const requestedUi = typeof params.ui === 'string' ? params.ui : null;

  // Legacy → forward to the real members workspace (preserves the prior default).
  if (requestedUi === 'legacy') {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (typeof value === 'string' && key !== 'ui') query.set(key, value);
    });
    const queryString = query.toString();
    redirect(`/admin/members${queryString ? `?${queryString}` : ''}`);
  }

  const view = parseStudentsRosterView(params.view);

  if (view === 'training') {
    const readOnlyAudit = isReadOnlyPortalAuditHeader(await headers());
    const training = await loadTrainingRoster(scope, { readOnlyAudit });
    // The legacy dual-table still reads its own data, so it stays the fallback.
    if (!training.ok) redirect(TRAINING_PROGRESS_LEGACY_HREF);
    return (
      <>
        {training.secondaryLoadFailed ? <span hidden data-portal-error-state="admin-students-secondary-load" /> : null}
        <StudentsRosterKit
          view="training"
          viewHrefs={STUDENTS_ROSTER_VIEW_HREFS}
          students={training.students}
          total={training.total}
          showingLabel={training.showingLabel}
          notice={training.secondaryLoadFailed ? STUDENTS_SECONDARY_LOAD_NOTICE : undefined}
        />
      </>
    );
  }

  const roster = await loadStudentsRoster(scope);

  // If the core roster query fails, fall back to the proven members workspace
  // rather than rendering a fabricated/empty kit.
  if (!roster.ok) redirect('/admin/members');

  return (
    <>
      {roster.secondaryLoadFailed ? <span hidden data-portal-error-state="admin-students-secondary-load" /> : null}
      <StudentsRosterKit
        view="roster"
        viewHrefs={STUDENTS_ROSTER_VIEW_HREFS}
        students={roster.students}
        total={roster.total}
        notice={roster.secondaryLoadFailed ? STUDENTS_SECONDARY_LOAD_NOTICE : undefined}
      />
    </>
  );
}
