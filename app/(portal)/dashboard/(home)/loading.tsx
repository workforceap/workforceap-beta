import DashboardSkeleton from '@/components/dashboard/DashboardSkeleton';

/** Route-level skeleton for `/dashboard` only. Kept under `(home)` so
 *  unknown member URLs can 404 instead of streaming this home shell.
 *  The kit home waits on `loadMemberDashboardHome` (1–2 Prisma ops);
 *  `?ui=legacy` / `?tab=` redirect before any read.
 */
export default function DashboardLoading() {
  return <DashboardSkeleton />;
}
