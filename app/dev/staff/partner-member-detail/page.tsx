import { notFound } from 'next/navigation';
import PartnerMemberJourney, { type PartnerJourneyStep } from '@/components/partner/PartnerMemberJourney';
import PartnerPlacementCard, { type PartnerPlacementView } from '@/components/partner/PartnerPlacementCard';
import PartnerStageBadge from '@/components/partner/PartnerStageBadge';
import type { PartnerMemberStage } from '@/lib/partner/memberStage';

/**
 * Showcase-only render of the partner member detail pieces
 * (app/(portal)/partner/referred-members/[memberId]/page.tsx) with inline
 * sample data — no auth/DB, so screenshot tooling can photograph each
 * placement state: verified (full tier), awaiting verification, and a
 * restricted referral-track partner.
 */
export const dynamic = 'force-dynamic';

interface Scenario {
  key: string;
  title: string;
  name: string;
  stage: PartnerMemberStage;
  steps: PartnerJourneyStep[];
  placement: PartnerPlacementView;
}

const intake: PartnerJourneyStep = { key: 'intake', label: 'Intake', detail: 'Referral on file', date: 'Jun 2, 2026', done: true };
const training: PartnerJourneyStep = { key: 'training', label: 'Training', detail: 'IT Support Professional', date: 'Jun 9, 2026', done: true };

const SCENARIOS: Scenario[] = [
  {
    key: 'verified',
    title: 'Verified placement (workforce board)',
    name: 'Sample Member A',
    stage: 'placed_verified',
    steps: [
      intake,
      training,
      { key: 'cert', label: 'Certification', detail: 'In progress or complete', date: 'Aug 20, 2026', done: true },
      { key: 'placement', label: 'Placement', detail: 'Help Desk Technician @ Sample Employer', date: 'Sep 8, 2026', done: true },
      { key: 'retention', label: 'Retention / follow-up', detail: 'Onboarding window through Dec 7, 2026', date: 'Dec 7, 2026', done: false },
    ],
    placement: {
      state: 'verified',
      placedOn: 'Sep 8, 2026',
      details: { employerName: 'Sample Employer', jobTitle: 'Help Desk Technician', salary: '$45,000' },
    },
  },
  {
    key: 'pending',
    title: 'Placement reported, not yet verified',
    name: 'Sample Member B',
    stage: 'awaiting_verification',
    steps: [
      intake,
      training,
      { key: 'cert', label: 'Certification', detail: 'In progress or complete', date: 'Aug 28, 2026', done: true },
      { key: 'placement', label: 'Placement', detail: 'Placement reported, pending verification', date: null, done: false, pending: true },
      { key: 'retention', label: 'Retention / follow-up', detail: 'Awaiting verified placement', date: null, done: false },
    ],
    placement: { state: 'pending', showJobDetails: true },
  },
  {
    key: 'restricted',
    title: 'In training (referral partner)',
    name: 'Sample Member C',
    stage: 'in_training',
    steps: [
      intake,
      training,
      { key: 'cert', label: 'Certification', detail: 'Pending', date: null, done: false },
      { key: 'placement', label: 'Placement', detail: 'Not placed yet', date: null, done: false },
    ],
    placement: { state: 'none' },
  },
];

function heading(title: string) {
  return <h2 style={{ fontSize: '0.8125rem', margin: 0, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{title}</h2>;
}

export default function DevStaffPartnerMemberDetailPage() {
  if (process.env.VERCEL_ENV === 'production') notFound();

  return (
    <main style={{ padding: '2rem 1rem', maxWidth: '72rem', margin: '0 auto', display: 'grid', gap: '2.5rem' }}>
      {SCENARIOS.map((scenario) => (
        <section key={scenario.key} data-scenario={scenario.key} style={{ display: 'grid', gap: '1rem' }}>
          <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--wa-muted-strong)' }}>{scenario.title}</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.75rem' }}>
            <h1 style={{ margin: 0, fontSize: '1.75rem' }}>{scenario.name}</h1>
            <PartnerStageBadge stage={scenario.stage} />
          </div>
          <div className="wa-grid wa-grid-cols-1 md:wa-grid-cols-2 wa-gap-4">
            <section className="portal-card portal-card--flat" style={{ padding: '1rem' }}>
              {heading('Member journey')}
              <div style={{ marginTop: '1rem' }}>
                <PartnerMemberJourney steps={scenario.steps} />
              </div>
            </section>
            <section className="portal-card portal-card--flat" style={{ padding: '1rem', alignSelf: 'start' }}>
              {heading('Placement')}
              <PartnerPlacementCard placement={scenario.placement} />
            </section>
          </div>
        </section>
      ))}
    </main>
  );
}
