import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { FeedbackKit } from '@/components/portal/kit/pages/admin-subviews/FeedbackKit';
import { parseFeedbackFilters } from '@/lib/admin/feedbackFilters';

/**
 * WAP-193 slice 2: the type/rating/date filters and paging used to exist only
 * in the ?ui=legacy feedback client. The default kit view now renders them as
 * a GET form plus Previous/Next links.
 */

afterEach(cleanup);

const base = { feedback: [], total: 120, recent: 4, critical: 9, avgRating: '4.1' };

describe('FeedbackKit filters (WAP-193)', () => {
  it('shows the current filters, the matching range and both page links', () => {
    const values = parseFeedbackFilters({ type: 'counselor', rating: '2', from: '2026-09-01', page: '2' });
    render(
      <FeedbackKit
        {...base}
        filters={{
          values,
          matching: 130,
          pageSize: 50,
          prevHref: '/admin/feedback?type=counselor&rating=2&from=2026-09-01',
          nextHref: '/admin/feedback?type=counselor&rating=2&from=2026-09-01&page=3',
        }}
      />,
    );

    const form = screen.getByRole('form', { name: 'Filter feedback' });
    expect(form.getAttribute('method')).toBe('get');
    expect((within(form).getByLabelText('Type') as HTMLSelectElement).value).toBe('counselor');
    expect((within(form).getByLabelText('Rating') as HTMLSelectElement).value).toBe('2');
    expect((within(form).getByLabelText('From') as HTMLInputElement).value).toBe('2026-09-01');
    expect(screen.getByRole('status')).toHaveTextContent('Showing 51–100 of 130');
    expect(screen.getByRole('link', { name: 'Previous' }).getAttribute('href')).toBe(
      '/admin/feedback?type=counselor&rating=2&from=2026-09-01',
    );
    expect(screen.getByRole('link', { name: 'Next' }).getAttribute('href')).toContain('page=3');
  });

  it('says when nothing matches and offers no page links', () => {
    render(
      <FeedbackKit
        {...base}
        filters={{ values: parseFeedbackFilters({ rating: '1' }), matching: 0, pageSize: 50, prevHref: null, nextHref: null }}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('No feedback matches these filters.');
    expect(screen.queryByRole('link', { name: 'Next' })).toBeNull();
  });
});
