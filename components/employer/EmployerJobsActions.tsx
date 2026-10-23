import { Plus, Upload } from 'lucide-react';
import { KitLinkButton } from '@/components/portal/kit/KitLinkButton';

/** Jobs owns posting/import actions at every viewport; the forms retain their original routes. */
export default function EmployerJobsActions({
  labels,
  showJobs = false,
  current,
}: {
  labels: { nav: string; jobs: string; post: string; import: string };
  showJobs?: boolean;
  current?: 'post' | 'import';
}) {
  return (
    <nav aria-label={labels.nav} className="wa-flex wa-flex-wrap wa-items-center wa-gap-2" data-testid="employer-jobs-actions">
      {showJobs ? <KitLinkButton href="/employer/jobs" label={labels.jobs} /> : null}
      {current !== 'import' ? (
        <KitLinkButton href="/employer/jobs/import" label={labels.import} icon={<Upload size={16} aria-hidden />} />
      ) : null}
      {current !== 'post' ? (
        <KitLinkButton href="/employer/jobs/new" label={labels.post} variant="primary" icon={<Plus size={16} aria-hidden />} />
      ) : null}
    </nav>
  );
}
