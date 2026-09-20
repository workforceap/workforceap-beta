import { notFound } from 'next/navigation';
import {
  PipelineFunnelKit,
} from '@/components/portal/kit/pages/admin-subviews/PipelineFunnelKit';
import type { KpiItem, RankDatum } from '@/components/portal/kit';

/**
 * Showcase-only render of the admin Applications funnel with inline mock
 * data — no auth/DB, so screenshot tooling can photograph the kit component
 * directly.
 */
export const dynamic = 'force-dynamic';

const KPIS: KpiItem[] = [
  { label: 'Started', value: 1204 },
  { label: 'Enrolled', value: 724 },
  { label: 'Placed', value: 213 },
  { label: 'Conversion', value: '17.7%' },
];

const FUNNEL: RankDatum[] = [
  { label: 'Started application', value: '1,204', pct: 100, color: 'info' },
  { label: 'Completed intake', value: '968', pct: 80, color: 'info' },
  { label: 'Eligibility cleared', value: '847', pct: 70, color: 'info' },
  { label: 'Enrolled', value: '724', pct: 60, color: 'success' },
  { label: 'Active', value: '612', pct: 51, color: 'success' },
];

export default function DevStaffPipelineFunnelPage() {
  if (process.env.VERCEL_ENV === 'production') notFound();

  return (
    <PipelineFunnelKit
      kicker="Outcomes"
      title="Applications funnel"
      goal="Where applicants drop off"
      kpis={KPIS}
      funnel={FUNNEL}
      funnelTitle="Funnel"
      funnelSubtitle="last 90 days"
    />
  );
}
