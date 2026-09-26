process.env.TZ = 'UTC';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import EmployerWorkflowTimeline from '@/components/employer/EmployerWorkflowTimeline';
import PartnerWorkflowTimeline from '@/components/partner/PartnerWorkflowTimeline';

const events = [
  { id: 'ev-1', createdAt: '2026-09-19T02:30:00Z', kind: 'status_change', headline: 'Fixture headline', detail: null, actorName: 'Fixture Actor' },
];

describe('workflow timelines render event times in Central time', () => {
  it('EmployerWorkflowTimeline', () => {
    const html = renderToStaticMarkup(<EmployerWorkflowTimeline events={events} />);
    expect(html).toContain('Sep 18, 2026, 9:30 PM CDT');
    expect(html).not.toContain('2:30');
    expect(html).not.toContain('9/19/2026');
  });

  it('PartnerWorkflowTimeline', () => {
    const html = renderToStaticMarkup(<PartnerWorkflowTimeline events={events} />);
    expect(html).toContain('Sep 18, 2026, 9:30 PM CDT');
    expect(html).not.toContain('2:30');
    expect(html).not.toContain('9/19/2026');
  });

  it('redacts historic member placement claims in the partner timeline', () => {
    const html = renderToStaticMarkup(<PartnerWorkflowTimeline events={[{
      id: 'old-claim', createdAt: '2026-09-19T02:30:00Z',
      kind: 'placement_confirmation_submitted',
      headline: 'Private Employer offer reported by member',
      detail: 'Private Role at Private Employer',
      actorName: 'Fixture Actor',
    }]} />);
    expect(html).toContain('Placement reported, pending verification');
    expect(html).not.toContain('Private Employer');
    expect(html).not.toContain('Private Role');
  });
});
