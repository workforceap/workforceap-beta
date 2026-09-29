import { notFound } from 'next/navigation';
import { CronsMonitorKit, type CronJobRow } from '@/components/portal/kit/pages/admin-subviews/CronsMonitorKit';

/**
 * Showcase-only render of the admin Cron Monitor with inline mock data —
 * no auth/DB, so screenshot tooling can photograph the kit component directly.
 */
export const dynamic = 'force-dynamic';

const JOBS: CronJobRow[] = [
  {
    id: 'c1',
    job: 'member-nightly-sync',
    schedule: 'Every 15 min',
    lastRun: '3 min ago',
    duration: '2.4s',
    status: 'Success',
    freshness: 'ok',
    lastSuccess: '3 min ago',
  },
  {
    id: 'c2',
    job: 'placement-retention-check',
    schedule: 'Daily 6AM CT',
    lastRun: '11h ago',
    duration: '18.1s',
    status: 'Success',
    freshness: 'ok',
    lastSuccess: '11h ago',
  },
  {
    id: 'c3',
    job: 'coursera-progress-pull',
    schedule: 'Hourly',
    lastRun: '42 min ago',
    duration: '—',
    status: 'Failed',
    freshness: 'overdue',
    lastSuccess: '3h ago',
  },
  {
    id: 'c4',
    job: 'at-risk-flag-refresh',
    schedule: 'Every 30 min',
    lastRun: '6 min ago',
    duration: '4.7s',
    status: 'Running',
    freshness: 'ok',
    lastSuccess: '36 min ago',
  },
  {
    id: 'c5',
    job: 'weekly-recap-digest',
    schedule: 'Sunday 6PM UTC',
    lastRun: '2 days ago',
    duration: '31.9s',
    status: 'Success',
    freshness: 'ok',
    lastSuccess: '2 days ago',
  },
  {
    id: 'c6',
    job: 'legacy-export-cleanup',
    schedule: 'Weekly',
    lastRun: '9 days ago',
    duration: '—',
    status: 'Disabled',
    freshness: 'unknown',
    lastSuccess: '40 days ago',
  },
  {
    id: 'c7',
    job: 'monthly-report-export',
    schedule: 'Monthly on the 1st, 2:31 PM UTC',
    lastRun: '—',
    duration: '—',
    status: null,
    freshness: 'never_run',
    lastSuccess: '—',
  },
];

export default function DevStaffCronsMonitorPage() {
  if (process.env.VERCEL_ENV === 'production') notFound();

  return (
    <CronsMonitorKit
      jobs={JOBS}
      totalJobs={7}
      enabled={3}
      failing={1}
      lastRun="3 min ago"
    />
  );
}
