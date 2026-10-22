import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { getTranslations } from 'next-intl/server';
import { resolveAdminPageTenant } from '@/lib/tenant/adminPageScope';
import { isReadOnlyPortalAuditHeader } from '@/lib/audit/readOnlyPortalAudit';
import { StudentsRosterKit } from '@/components/portal/kit/pages/admin-subviews/StudentsRosterKit';
import Link from 'next/link';
import StudentsWorkspace from '@/components/admin/StudentsWorkspace';
import MemberManagementView from '@/components/admin/workspace/MemberManagementView';
import MemberInterviewReadyView from '@/components/admin/workspace/MemberInterviewReadyView';
import MemberJobReadyView from '@/components/admin/workspace/MemberJobReadyView';
import { parseStudentsWorkspaceView, parseStudentsReadinessView } from '@/lib/admin/studentsWorkspace';
import { loadStudentsRoster, studentsRosterNotice } from '@/lib/admin/studentsRosterLoad';
import { loadTrainingRoster } from '@/lib/admin/trainingRosterLoad';
import { loadStudentsRosterFocus, STUDENTS_FOCUS_UNAVAILABLE_NOTICE } from '@/lib/admin/studentsRosterFocus';
import {
  STUDENTS_NEEDS_PARAM,
  STUDENTS_ROSTER_VIEW_HREFS,
  TRAINING_PROGRESS_LEGACY_HREF,
  chipForStudentsNeeds,
  parseStudentsNeeds,
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
 * The Students workspace. Roster, management, training and readiness views
 * reuse their original scoped loaders and actions. `?view=training` swaps the column preset to training
 * progress (same kit, same member population); the default is the Students
 * roster. `?needs=at-risk|stalled` (the attention model's links from the
 * Command Center and overview) opens the nearest chip; `?needs=new-applicants`
 * opens the roster on exactly the members behind Today's "new applicants have
 * no counselor" row (WAP-198).
 * `?ui=legacy` forwards to the management hub (/admin/members).
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

  const workspaceView = parseStudentsWorkspaceView(params.view);
  if (workspaceView === 'manage') {
    const content = await MemberManagementView({ searchParams: Promise.resolve(params), embedded: true });
    return <StudentsWorkspace view="manage">{content}</StudentsWorkspace>;
  }
  if (workspaceView === 'readiness') {
    const readiness = parseStudentsReadinessView(params.readiness);
    const content = readiness === 'job'
      ? await MemberJobReadyView({ searchParams: Promise.resolve(params), embedded: true })
      : await MemberInterviewReadyView({ embedded: true });
    return <StudentsWorkspace view="readiness" readiness={readiness}>{content}</StudentsWorkspace>;
  }

  const view = parseStudentsRosterView(params.view);
  const needs = parseStudentsNeeds(params[STUDENTS_NEEDS_PARAM]);
  const initialChip = chipForStudentsNeeds(needs, view);
  const tableQuery = new URLSearchParams(Object.entries(params).flatMap(([key, value]) =>
    typeof value === 'string' ? [[key, value]] : [],
  )).toString();

  if (view === 'training') {
    const readOnlyAudit = isReadOnlyPortalAuditHeader(await headers());
    const training = await loadTrainingRoster(scope, { readOnlyAudit });
    // The legacy dual-table still reads its own data, so it stays the fallback.
    if (!training.ok) redirect(TRAINING_PROGRESS_LEGACY_HREF);
    return (
      <StudentsWorkspace view="training">
        {training.secondaryLoadFailed ? <span hidden data-portal-error-state="admin-students-secondary-load" /> : null}
        <p className="wa-mb-4"><Link href={TRAINING_PROGRESS_LEGACY_HREF} className="wa-page-action">Detailed provider and curriculum view</Link></p>
        <StudentsRosterKit
          key={`training:${tableQuery}`}
          urlState={tableQuery}
          embedded
          showViewNav={false}
          view="training"
          viewHrefs={STUDENTS_ROSTER_VIEW_HREFS}
          students={training.students}
          total={training.total}
          showingLabel={training.showingLabel}
          initialChip={initialChip}
          notice={studentsRosterNotice(training)}
        />
      </StudentsWorkspace>
    );
  }

  const [roster, focusLoad] = await Promise.all([
    loadStudentsRoster(scope),
    loadStudentsRosterFocus(scope, needs, view),
  ]);

  // If the core roster query fails, fall back to the proven members workspace
  // rather than rendering a fabricated/empty kit.
  if (!roster.ok) redirect('/admin/members');

  const notice = [studentsRosterNotice(roster), focusLoad.failed ? STUDENTS_FOCUS_UNAVAILABLE_NOTICE : null]
    .filter(Boolean)
    .join(' ') || undefined;

  return (
    <StudentsWorkspace view="roster">
      {roster.secondaryLoadFailed ? <span hidden data-portal-error-state="admin-students-secondary-load" /> : null}
      <StudentsRosterKit
        key={`roster:${tableQuery}`}
        urlState={tableQuery}
        embedded
        showViewNav={false}
        view="roster"
        viewHrefs={STUDENTS_ROSTER_VIEW_HREFS}
        students={roster.students}
        total={roster.total}
        initialChip={initialChip}
        focus={focusLoad.focus ?? undefined}
        notice={notice}
      />
    </StudentsWorkspace>
  );
}
