import { notFound } from 'next/navigation';
import { DesignSurface } from '@/components/portal/kit';
import PageHeader from '@/components/portal/PageHeader';
import PartnerMembersList from '@/components/portal/PartnerMembersList';
import PartnerReferredMembersMobile from '@/components/partner/PartnerReferredMembersMobile';

/**
 * Showcase-only render of the redesigned partner "Referred Members" roster
 * (app/(portal)/partner/referred-members/page.tsx) with inline mock data —
 * no auth/DB, so screenshot tooling can photograph the Command Center kit
 * treatment (DataTable + StatusTag + StageTrack, desktop; card list, mobile)
 * directly across every milestone stage.
 */
export const dynamic = 'force-dynamic';

const MOCK_ROWS = [
  {
    id: 'm1',
    fullName: 'Aaliyah Washington',
    stage: 'applied',
    stageLabel: 'Applied',
    progress: 0,
    programTitle: 'IT Support',
    story: 'Applied',
    referredAtLabel: '6/28/2026',
    placementVerified: null,
  },
  {
    id: 'm2',
    fullName: 'Sofia Reyes-Martinez',
    stage: 'enrolled',
    stageLabel: 'Enrolled',
    progress: 4,
    programTitle: 'AI Practitioner',
    story: 'Enrolled in AI Practitioner',
    referredAtLabel: '6/25/2026',
    placementVerified: null,
  },
  {
    id: 'm3',
    fullName: 'Priya Natarajan',
    stage: 'in_training',
    stageLabel: 'In Training',
    progress: 42,
    programTitle: 'IT Support',
    story: '42% through IT Support',
    referredAtLabel: '6/2/2026',
    placementVerified: null,
  },
  {
    id: 'm4',
    fullName: 'Hoang Tran',
    stage: 'in_training',
    stageLabel: 'In Training',
    progress: 18,
    programTitle: 'Warehouse & Logistics',
    story: '18% through Warehouse & Logistics',
    referredAtLabel: '5/14/2026',
    placementVerified: null,
  },
  {
    id: 'm5',
    fullName: 'Devon Cole',
    stage: 'certified',
    stageLabel: 'Certified',
    progress: 100,
    programTitle: 'IT Support',
    story: 'Completed IT Support',
    referredAtLabel: '4/30/2026',
    placementVerified: null,
  },
  {
    id: 'm6',
    fullName: 'Marcus DeLeon',
    stage: 'placed',
    stageLabel: 'Placed',
    progress: 100,
    programTitle: 'Field Service Technician',
    story: 'Placed at Austin Energy as Field Service Technician',
    referredAtLabel: '5/28/2026',
    placementVerified: false,
  },
  {
    id: 'm7',
    fullName: 'Renata Alves',
    stage: 'placed',
    stageLabel: 'Placed',
    progress: 100,
    programTitle: 'Medical Billing & Coding',
    story: 'Placed at HEB Distribution as Warehouse Associate',
    referredAtLabel: '3/11/2026',
    placementVerified: true,
  },
];

export default function DevStaffPartnerMembersPage() {
  if (process.env.VERCEL_ENV === 'production') notFound();

  return (
    <DesignSurface surface="dense" className="wa-flex wa-flex-col wa-gap-6 wa-p-6">
      <PageHeader
        title="Referred members"
        subtitle="Search and filter everyone your organization has referred to WorkforceAP."
      />

      <div className="wa-block md:wa-hidden">
        <PartnerReferredMembersMobile rows={MOCK_ROWS} />
      </div>

      <div className="wa-hidden md:wa-block">
        <PartnerMembersList members={MOCK_ROWS} />
      </div>
    </DesignSurface>
  );
}
