import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { CommandCenterKit, type CommandCenterKitProps } from '@/components/portal/kit/pages/admin/CommandCenterKit';

afterEach(cleanup);
const base: CommandCenterKitProps = {
  dateLabel: 'Sep 9, 2026', kpis: [], queueItems: [], programHealth: [], placementsByMonth: [],
};

describe('compact admin command-center presentation', () => {
  it('preserves full queue counts, zero queues and destinations without nested controls', () => {
    const { container } = render(<CommandCenterKit {...base} addStudentHref="/admin/members/new"
      kpis={[{ label: 'Active students', value: 520 }, { label: 'Placements YTD', value: 0 }]}
      queueItems={[
        { id: 'reply', icon: null, iconColor: '', title: '522 conversations need a reply', detail: 'Members waiting', count: 522, actionLabel: '522 items', href: '/admin/command-center?queue=needs-reply' },
        { id: 'certs', icon: null, iconColor: '', title: 'Certifications awaiting review', detail: 'Verify evidence', count: 0, urgent: true, actionLabel: 'Review', href: '/admin/certifications' },
      ]} />);
    expect(screen.getByText('520')).toBeInTheDocument();
    expect(screen.getByText('2 queues')).toBeInTheDocument();
    expect(screen.getByText('522 conversations need a reply')).toBeInTheDocument();
    expect(screen.getByText('0 Certifications awaiting review')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '522 items' })).toHaveAttribute('href', '/admin/command-center?queue=needs-reply');
    expect(screen.getByRole('link', { name: 'Add student' })).toHaveAttribute('href', '/admin/members/new');
    expect(screen.queryByLabelText('Needs attention')).not.toBeInTheDocument();
    expect(screen.queryByText('/admin', { exact: true })).not.toBeInTheDocument();
    expect(container.querySelector('a button')).toBeNull();
  });

  it('summarizes a measured zero series without drawing a fictitious trend', () => {
    render(<CommandCenterKit {...base} placementsByMonth={[{ label: 'Jan', value: 0 }, { label: 'Feb', value: 0 }]} placementsSubtitle="2026 YTD · 0 total" />);
    const section = screen.getByRole('region', { name: 'Placements trend' });
    expect(within(section).getByText('2026 YTD · 0 total')).toBeInTheDocument();
    expect(within(section).getByText('No placements recorded for this period.')).toBeInTheDocument();
    expect(section.querySelector('svg')).toBeNull();
  });

  it('retains a real nonzero trend and does not label absent data as zero', () => {
    const { rerender } = render(<CommandCenterKit {...base} placementsByMonth={[{ label: 'Jan', value: 0 }, { label: 'Feb', value: 2 }]} placementsSubtitle="2026 YTD · 2 total" />);
    expect(screen.getByRole('region', { name: 'Placements trend' }).querySelector('svg')).not.toBeNull();
    expect(screen.getByText('Placements trend, 2026 YTD · 2 total')).toBeInTheDocument();
    rerender(<CommandCenterKit {...base} />);
    expect(screen.queryByRole('region', { name: 'Placements trend' })).not.toBeInTheDocument();
    expect(screen.queryByText('No placements recorded for this period.')).not.toBeInTheDocument();
    expect(screen.getByText('No enrollment data available.')).toBeInTheDocument();
  });

  it('retains callback actions and supplied real metric delta text', () => {
    const action = vi.fn();
    render(<CommandCenterKit {...base} onQueueAction={action} kpis={[{ label: 'Placements', value: 4, spark: { delta: '2 more this month', direction: 'up' } }]}
      queueItems={[{ id: 'outreach', icon: null, iconColor: '', title: 'Members need a check-in', detail: 'Training activity flagged', count: 4, urgent: true, actionLabel: 'Assign outreach' }]} />);
    expect(screen.getByText('2 more this month')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Assign outreach' }));
    expect(action).toHaveBeenCalledExactlyOnceWith('outreach');
  });
});
