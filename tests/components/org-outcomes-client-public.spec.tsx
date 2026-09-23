/**
 * O01: the public /org/[slug]/outcomes page shows counts, never salary or
 * days-to-place cards, and replaces a suppressed small-N rate with the
 * methodology's "sample too small for a reliable rate" note (rule 1).
 */
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('next/image', () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => {
    const { alt, ...rest } = props;
    // eslint-disable-next-line @next/next/no-img-element -- test mock for next/image
    return <img {...rest} alt={alt ?? ''} />;
  },
}));

import OrgOutcomesClient from '@/app/org/[slug]/outcomes/OrgOutcomesClient';

const fetchMock = vi.fn();

// The unfiltered admin-shaped payload: even if a salary or days value reaches
// the client, the public page must not render a card for it.
function payload(metrics: Record<string, unknown>) {
  return {
    quarter: 'Q2',
    year: 2026,
    periodStart: 'Apr 1, 2026',
    periodEnd: 'Jun 30, 2026',
    generatedAt: '2026-07-01T00:00:00.000Z',
    partnerName: 'Partner One',
    partnerSlug: 'partner-one',
    smallSampleThreshold: 10,
    metrics: {
      totalReferred: 3,
      totalEnrolled: 2,
      completions: 1,
      placements: 1,
      activeMembers: 1,
      dropOffs: 1,
      avgDaysToPlacement: 41,
      salaryAvg: 52000,
      ...metrics,
    },
    programBreakdown: [],
  };
}

function renderClient() {
  return render(
    <OrgOutcomesClient partnerId="p-1" partnerName="Partner One" partnerSlug="partner-one" partnerLogo={null} partnerBrandColor={null} />,
  );
}

describe('OrgOutcomesClient public outcomes', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('renders no salary or days-to-place card and notes the suppressed drop-off rate', async () => {
    fetchMock.mockResolvedValue(Response.json(payload({ dropOffRate: null, dropOffRateSuppressed: true })));

    const { container } = renderClient();
    await screen.findByText('Drop-offs');

    expect(screen.queryByText(/Avg Salary/i)).toBeNull();
    expect(screen.queryByText(/Days to Place/i)).toBeNull();
    expect(container.textContent).not.toContain('52,000');
    expect(container.textContent).not.toContain('52000');
    expect(screen.getByText(/N=3 · sample too small for a reliable rate/)).toBeTruthy();
    expect(container.textContent).not.toMatch(/\d+%/);
  });

  it('shows the drop-off rate when it is not suppressed', async () => {
    fetchMock.mockResolvedValue(
      Response.json(payload({ totalReferred: 10, dropOffs: 2, dropOffRate: 20, dropOffRateSuppressed: false })),
    );

    renderClient();

    expect(await screen.findByText('2 (20%)')).toBeTruthy();
    expect(screen.queryByText(/sample too small/)).toBeNull();
  });
});
