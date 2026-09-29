import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import PartnerMemberJourney from '@/components/partner/PartnerMemberJourney';
import PartnerPlacementCard from '@/components/partner/PartnerPlacementCard';
import PartnerStageBadge from '@/components/partner/PartnerStageBadge';
import { partnerMemberStage } from '@/lib/partner/memberStage';
import { PARTNER_PLACEMENT_LABELS } from '@/lib/partner/partnerVisibleEvents';

describe('partnerMemberStage', () => {
  const base = { placedVerified: false, placementReported: false, enrolled: false, progressPct: 0 };

  it('never reads a reported placement as placed', () => {
    expect(partnerMemberStage({ ...base, placementReported: true, enrolled: true, progressPct: 100 })).toBe(
      'awaiting_verification',
    );
  });

  it('prefers a verified placement over everything else', () => {
    expect(partnerMemberStage({ ...base, placedVerified: true, placementReported: true })).toBe('placed_verified');
  });

  it('walks referred → in training → course-complete', () => {
    expect(partnerMemberStage(base)).toBe('referred');
    expect(partnerMemberStage({ ...base, enrolled: true, progressPct: 40 })).toBe('in_training');
    expect(partnerMemberStage({ ...base, enrolled: true, progressPct: 80 })).toBe('course_complete');
  });
});

describe('PartnerStageBadge', () => {
  it('always carries a text label', () => {
    expect(renderToStaticMarkup(<PartnerStageBadge stage="placed_verified" />)).toContain('Placed – verified');
    expect(renderToStaticMarkup(<PartnerStageBadge stage="awaiting_verification" />)).toContain(
      PARTNER_PLACEMENT_LABELS.pendingVerification,
    );
  });
});

describe('PartnerPlacementCard', () => {
  it('shows employer, role and salary only for a verified placement with details', () => {
    const html = renderToStaticMarkup(
      <PartnerPlacementCard
        placement={{
          state: 'verified',
          placedOn: 'Sep 1, 2026',
          details: { employerName: 'Sample Employer', jobTitle: 'Sample Role', salary: '$50,000' },
        }}
      />,
    );
    expect(html).toContain('Sample Employer');
    expect(html).toContain('Sample Role');
    expect(html).toContain('$50,000');
  });

  it('shows only the placed date to a restricted partner', () => {
    const html = renderToStaticMarkup(
      <PartnerPlacementCard placement={{ state: 'verified', placedOn: 'Sep 1, 2026', details: null }} />,
    );
    expect(html).toContain('Sep 1, 2026');
    expect(html).not.toContain('Employer');
    expect(html).not.toContain('Salary');
  });

  it('shows the pending notice with no job fields for a reported placement', () => {
    const html = renderToStaticMarkup(<PartnerPlacementCard placement={{ state: 'pending', showJobDetails: true }} />);
    expect(html).toContain(PARTNER_PLACEMENT_LABELS.pendingVerification);
    expect(html).not.toContain('<dt>');
  });
});

describe('PartnerMemberJourney', () => {
  it('numbers steps and marks the first unfinished one current', () => {
    const html = renderToStaticMarkup(
      <PartnerMemberJourney
        steps={[
          { key: 'a', label: 'Intake', detail: 'Referral on file', date: 'Aug 1, 2026', done: true },
          { key: 'b', label: 'Training', detail: 'Program', date: null, done: false },
          { key: 'c', label: 'Placement', detail: 'Not placed yet', date: null, done: false },
        ]}
      />,
    );
    expect(html).toContain('Completed: </span>Intake');
    expect(html).toContain('Current step: </span>Training');
    expect(html).toContain('Not yet reached: </span>Placement');
    expect(html).toMatch(/data-state="upcoming"[\s\S]*>3</);
  });

  it('labels a reported placement as pending, not current', () => {
    const html = renderToStaticMarkup(
      <PartnerMemberJourney
        steps={[
          { key: 'a', label: 'Intake', detail: '', date: null, done: true },
          { key: 'b', label: 'Placement', detail: 'Pending', date: null, done: false, pending: true },
        ]}
      />,
    );
    expect(html).toContain('Pending verification: </span>Placement');
    expect(html).not.toContain('Current step:');
  });
});
