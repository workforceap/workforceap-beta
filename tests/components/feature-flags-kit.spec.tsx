import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh, push: mocks.push }) }));

import { FeatureFlagsKit, type FeatureFlagRow } from '@/components/portal/kit/pages/admin-subviews/FeatureFlagsKit';
import FeatureFlagToggle from '@/components/portal/kit/pages/admin-subviews/FeatureFlagToggle';

/**
 * Feature flags kit page (admin audit gap map, wave 16): an empty registry
 * shows one kit empty state with a real next step, and the State column is a
 * toggle that reuses the existing PATCH route (same body, same server guard)
 * instead of a read-only tag.
 */
const FLAG: FeatureFlagRow = {
  id: 'flag-1',
  name: 'Coursera Integration V2',
  key: 'coursera-v2',
  description: 'New sync pipeline',
  enabled: true,
  rolloutPercentage: 0,
  updated: 'Sep 1',
};

function renderKit(flags: FeatureFlagRow[]) {
  const on = flags.filter((f) => f.enabled).length;
  return render(
    <FeatureFlagsKit flags={flags} total={flags.length} on={on} off={flags.length - on} recentlyChanged={0} />,
  );
}

describe('FeatureFlagsKit empty state', () => {
  afterEach(cleanup);

  it('replaces the table with one kit empty state whose CTA opens the create workspace', () => {
    renderKit([]);
    expect(screen.getByRole('heading', { level: 2, name: 'No feature flags yet' })).toBeInTheDocument();
    expect(screen.getByText(/Create a flag to start rolling out features gradually/)).toBeInTheDocument();
    const cta = screen.getByText('Create a flag').closest('a');
    expect(cta).not.toBeNull();
    expect(cta).toHaveAttribute('href', '/admin/feature-flags?ui=legacy');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByText(/Showing 0 of 0/)).not.toBeInTheDocument();
    // Exactly one empty state — the DataTable's own placeholder is not also rendered.
    expect(screen.getAllByText('No feature flags yet')).toHaveLength(1);
  });

  it('renders the table (with a toggle per row) when flags exist', () => {
    renderKit([FLAG]);
    expect(screen.queryByText('No feature flags yet')).not.toBeInTheDocument();
    expect(screen.getByRole('table')).toBeInTheDocument();
    // Table row + mobile card each carry a toggle for the same flag; both start On.
    const toggles = screen.getAllByRole('checkbox');
    expect(toggles.length).toBeGreaterThanOrEqual(1);
    for (const toggle of toggles) {
      expect(toggle).toBeChecked();
      expect(toggle.closest('label')).toHaveTextContent('On');
    }
    expect(screen.getByText('Showing 1 of 1')).toBeInTheDocument();
  });
});

describe('FeatureFlagToggle', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    mocks.refresh.mockReset();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('PATCHes the existing feature-flag route with { enabled } and refreshes on success', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ flag: { ...FLAG, enabled: false } }) });
    render(<FeatureFlagToggle id="flag-1" name="Coursera Integration V2" enabled />);

    const toggle = screen.getByRole('checkbox');
    expect(toggle).toBeChecked();
    fireEvent.click(toggle);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/admin/feature-flags/flag-1');
    expect(init.method).toBe('PATCH');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(String(init.body))).toEqual({ enabled: false });

    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1));
    expect(toggle).not.toBeChecked();
    expect(screen.getByText('Off')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('rolls back and shows the server message when the route refuses', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: 'Cron settings must be managed through Email & Cron Management' }),
    });
    render(<FeatureFlagToggle id="flag-2" name="cron:job-alerts" enabled />);

    fireEvent.click(screen.getByRole('checkbox'));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Cron settings must be managed through Email & Cron Management'));
    expect(screen.getByRole('checkbox')).toBeChecked();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it('shows a retry message on a network failure and keeps the previous state', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    render(<FeatureFlagToggle id="flag-3" name="Beta nav" enabled={false} />);

    fireEvent.click(screen.getByRole('checkbox'));

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});
