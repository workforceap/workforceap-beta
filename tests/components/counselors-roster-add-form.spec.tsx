import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CounselorsRosterKit } from '@/components/portal/kit/pages/admin-subviews/CounselorsRosterKit';
import { AddCounselorForm } from '@/components/admin/AddCounselorForm';

/**
 * WAP-193: promoting a user to counselor/advisor used to exist only on
 * /admin/counselors?ui=legacy. The default roster now carries the same form.
 */

const nav = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => nav,
  usePathname: () => '/admin/counselors',
  useSearchParams: () => new URLSearchParams(),
}));

const fetchMock = vi.fn();
beforeEach(() => {
  nav.refresh.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const baseProps = { counselors: [], total: 0, avgCaseload: 0, atRiskOwned: 0, avgResponse: '—' };
const PARTNERS = [{ id: 'p1', name: 'Goodwill Central Texas' }];

describe('CounselorsRosterKit add-counselor slot', () => {
  it('promotes a user from the default roster and refreshes it', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 201, json: async () => ({ counselor: { id: 'c1' } }) } as Response);
    render(<CounselorsRosterKit {...baseProps} addCounselor={<AddCounselorForm partners={PARTNERS} />} />);

    const section = screen.getByRole('region', { name: 'Add counselor' });
    fireEvent.change(within(section).getByLabelText('User ID (UUID)'), { target: { value: ' user-123 ' } });
    fireEvent.change(within(section).getByLabelText('Title (optional)'), { target: { value: 'Career Coach' } });
    fireEvent.click(within(section).getByRole('button', { name: 'Add Counselor' }));

    await waitFor(() => expect(within(section).getByRole('status')).toHaveTextContent('Counselor added.'));
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/counselors', expect.objectContaining({ method: 'POST' }));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toEqual({
      userId: 'user-123',
      partnerId: null,
      affiliation: 'wap_staff',
      title: 'Career Coach',
    });
    expect(nav.refresh).toHaveBeenCalledTimes(1);
  });

  it('requires a partner for partner-affiliated counselors without calling the API', () => {
    render(<CounselorsRosterKit {...baseProps} addCounselor={<AddCounselorForm partners={PARTNERS} />} />);
    fireEvent.change(screen.getByLabelText('User ID (UUID)'), { target: { value: 'user-123' } });
    fireEvent.change(screen.getByLabelText('Affiliation'), { target: { value: 'partner' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Counselor' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Select a partner organization');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('renders no add form without the slot', () => {
    render(<CounselorsRosterKit {...baseProps} />);
    expect(screen.queryByRole('region', { name: 'Add counselor' })).toBeNull();
  });
});
