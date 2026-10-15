import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

/**
 * /admin/wioa-screening (kit view) speaks the shared staff intake vocabulary.
 * Bug fixed: a `verified` review used to render "Eligible" although staff
 * verification is not a legal WIOA eligibility determination
 * (lib/wioa/wioaReview.ts:1). It now reads "Intake verified".
 */

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: React.ComponentProps<'a'>) => <a href={href} {...rest}>{children}</a>,
}));

import { WioaScreeningKit, type WioaScreeningRow } from '@/components/portal/kit/pages/admin-subviews/WioaScreeningKit';
import { INTAKE_STATUS_KEYS, type IntakeStatusKey } from '@/lib/status/applicationStatusVocabulary';
import WioaReviewFilterBar from '@/components/admin/WioaReviewFilterBar';

function row(reviewStatus: IntakeStatusKey): WioaScreeningRow {
  return {
    id: `member-${reviewStatus}`,
    name: `Member ${reviewStatus}`,
    initials: 'MM',
    category: 'Adult',
    docs: 'Complete',
    docsComplete: true,
    reviewStatus,
    reviewer: '—',
    awaitingReview: reviewStatus === 'pending' || reviewStatus === 'in_review',
    daysWaiting: null,
    reviewedAt: null,
  };
}

const ROWS = INTAKE_STATUS_KEYS.map(row);

afterEach(cleanup);

describe('WioaScreeningKit — staff review vocabulary', () => {
  it('says "Intake verified", never "Eligible", for a verified staff review', () => {
    const { container } = render(
      <WioaScreeningKit rows={ROWS} total={ROWS.length} verified={1} pendingReview={2} needDocs={1} notEligible={1} />,
    );
    expect(screen.getAllByText('Intake verified').length).toBeGreaterThan(0);
    expect(screen.queryByText(/^Eligible$/)).toBeNull();
    expect(container.textContent).not.toMatch(/(^|\s)Eligible\b/);
    expect(screen.queryByText('Unreviewed')).toBeNull();
    expect(screen.queryByText('Needs docs')).toBeNull();
    expect(screen.queryByText(/^Pending$/)).toBeNull();
    expect(screen.queryByText('Pending Review')).toBeNull();
  });

  it('labels every review state with the staff word and heads the column "Staff review"', () => {
    render(<WioaScreeningKit rows={ROWS} total={ROWS.length} verified={1} pendingReview={2} needDocs={1} notEligible={1} />);
    expect(screen.getByRole('columnheader', { name: 'Staff review' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Determination' })).toBeNull();
    for (const word of ['Not reviewed', 'Awaiting review', 'In review', 'Needs more information', 'Not eligible', 'Status not recorded']) {
      expect(screen.getAllByText(word).length, word).toBeGreaterThan(0);
    }
  });

  it('names the KPI tiles with the same words as the rows', () => {
    render(<WioaScreeningKit rows={[]} total={0} verified={3} pendingReview={4} needDocs={5} notEligible={6} />);
    const tile = (label: string) => screen.getByText(label).closest('.wa-kit-stat-tile') as HTMLElement | null;
    expect(tile('Intake verified')?.textContent).toContain('3');
    expect(tile('Awaiting review')?.textContent).toContain('4');
    expect(tile('Needs more information')?.textContent).toContain('5');
    expect(tile('Not eligible')?.textContent).toContain('6');
  });

  it('labels actual application evidence and opens the member Eligibility tab in both layouts', () => {
    render(<WioaScreeningKit rows={[{ ...row('pending'), source: 'Application screening', category: 'Not recorded' }]}
      total={1} verified={0} pendingReview={1} needDocs={0} notEligible={0} />);
    expect(screen.getAllByText('Application screening').length).toBeGreaterThan(0);
    expect(screen.getByRole('columnheader', { name: 'Source' })).toBeInTheDocument();
    for (const link of screen.getAllByRole('link', { name: 'Open' })) {
      expect(link).toHaveAttribute('href', '/admin/members/member-pending?tab=eligibility');
    }
  });

  it('preserves the legacy view while selecting or clearing a review filter', () => {
    render(<WioaReviewFilterBar active="pending" legacy />);
    expect(screen.getByRole('link', { name: 'All' })).toHaveAttribute('href', '/admin/wioa-screening?ui=legacy');
    expect(screen.getByRole('link', { name: 'Needs more information' })).toHaveAttribute('href', '/admin/wioa-screening?ui=legacy&review=needs_info');
  });
});
