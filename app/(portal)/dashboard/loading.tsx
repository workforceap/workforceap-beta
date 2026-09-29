import DashboardSkeleton from '@/components/dashboard/DashboardSkeleton';

/** Route-level skeleton for the member dashboard home.
 *  The kit home (its one implementation) waits on `loadMemberDashboardHome`
 *  (1–2 Prisma ops); `?ui=legacy` / `?tab=` redirect before any read.
 */
export default function DashboardLoading() {
  return <DashboardSkeleton />;
}
