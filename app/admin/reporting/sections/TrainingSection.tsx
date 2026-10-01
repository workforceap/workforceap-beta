import { redirect } from 'next/navigation';
import { studentsRosterNotice } from '@/lib/admin/studentsRosterLoad';
import { loadTrainingRoster } from '@/lib/admin/trainingRosterLoad';
import { TRAINING_PROGRESS_LEGACY_HREF } from '@/lib/admin/studentsRosterView';
import { reportingTabHref } from '@/lib/admin/reportingHub';
import type { AdminPageTenantOk } from '@/lib/tenant/adminPageScope';
import { StudentsRosterKit } from '@/components/portal/kit/pages/admin-subviews/StudentsRosterKit';

/**
 * Training progress tab: the training preset of the one admin roster (the
 * same `loadTrainingRoster` + `StudentsRosterKit view="training"` that
 * `/admin/training-progress` and `/admin/students?view=training` mount).
 * The legacy dual-table still reads its own data, so it stays the fallback
 * when the roster load fails.
 */
export async function ReportingTrainingSection({
  scope,
  readOnlyAudit,
}: {
  scope: AdminPageTenantOk;
  readOnlyAudit: boolean;
}) {
  const training = await loadTrainingRoster(scope, { readOnlyAudit });
  if (!training.ok) redirect(TRAINING_PROGRESS_LEGACY_HREF);

  return (
    <>
      {training.secondaryLoadFailed ? (
        <span hidden data-portal-error-state="admin-reporting-training-secondary-load" />
      ) : null}
      <StudentsRosterKit
        embedded
        view="training"
        viewHrefs={{ roster: '/admin/students', training: reportingTabHref('training') }}
        students={training.students}
        total={training.total}
        showingLabel={training.showingLabel}
        notice={studentsRosterNotice(training)}
      />
    </>
  );
}
