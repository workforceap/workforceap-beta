import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

import en from '@/messages/en.json';
import { MemberJobsKit } from '@/components/portal/kit/pages/member/MemberJobsKit';

/**
 * #2493 follow-up: the Applications card renders `KitEmptyState` itself when
 * there are no applications and only mounts the `DataTable` when there are
 * rows, so the table's own `empty` prop could never paint. The prop is gone;
 * this pins the one path that remains in both states, from the DOM.
 */

afterEach(cleanup);

function renderKit(ui: React.ReactElement) {
  return render(<NextIntlClientProvider locale="en" messages={en}>{ui}</NextIntlClientProvider>);
}

/** The Applications card: the `.wa-kit-card` that owns the "Applications" heading. */
function applicationsCard(): HTMLElement {
  const heading = screen.getByRole('heading', { level: 2, name: 'Applications' });
  const card = heading.closest('.wa-kit-card');
  expect(card, 'the Applications heading sits in a kit card').not.toBeNull();
  return card as HTMLElement;
}

describe('MemberJobsKit applications card: one empty path', () => {
  it('no applications: the card paints exactly one KitEmptyState (kind "first") with the empty.applications copy, and no table', () => {
    renderKit(<MemberJobsKit applications={[]} openRoles={[]} recommended={[]} />);
    const card = applicationsCard();
    const empties = card.querySelectorAll<HTMLElement>('.wa-kit-empty');
    expect(empties).toHaveLength(1);
    expect(empties[0].dataset.kind).toBe('first');
    expect(within(card).getByText(en.empty.applications.title)).toBeInTheDocument();
    expect(within(card).getByText(en.empty.applications.body)).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: en.empty.applications.action })).toBeInTheDocument();
    expect(card.querySelector('table')).toBeNull();
    expect(card.textContent).not.toContain('No rows yet');
  });

  it('with an application: the row renders, and no empty state or "No rows yet" fallback appears in the card', () => {
    renderKit(
      <MemberJobsKit
        applications={[{ id: 'a1', role: 'Warehouse Associate', company: 'Fixture Co', location: 'Austin, TX', applied: 'Sep 1', stage: 'Applied', tone: 'info' }]}
        openRoles={[]}
        recommended={[]}
      />,
    );
    const card = applicationsCard();
    expect(card.querySelectorAll('.wa-kit-empty')).toHaveLength(0);
    expect(card.textContent).not.toContain('No rows yet');
    expect(within(card).getAllByText('Warehouse Associate').length).toBeGreaterThan(0);
    expect(within(card).getAllByText('Applied', { selector: '.wa-kit-tag' }).length).toBeGreaterThan(0);
  });
});
