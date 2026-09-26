import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('next/link', () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));
vi.mock('@/components/portal/kit', () => ({
  CardHead: ({ title }: { title: string }) => <h2>{title}</h2>,
  KitEmptyState: ({ title }: { title: string }) => <p>{title}</p>,
  SegmentedProgress: ({ pct, label }: { pct: number; label: string }) => <div role="progressbar" aria-label={label} aria-valuenow={pct} />,
  StageTrack: ({ index }: { index: number }) => <span data-stage-index={index} />,
  StatusTag: ({ children, tone }: { children: React.ReactNode; tone: string }) => <span data-tone={tone}>{children}</span>,
  colorVar: (color: string) => color,
}));

import PartnerMilestonesView from '@/components/partner/PartnerMilestonesView';
import PartnerMilestonesMobile from '@/components/partner/PartnerMilestonesMobile';

const at = '2026-09-10T15:00:00.000Z';
const milestones = [
  { id: 'pending', kind: 'placement_pending', label: 'Placement reported, pending verification', memberId: 'm1', memberName: 'Pending Member', at },
  { id: 'verified', kind: 'placement', label: 'Placed at Confirmed Employer', memberId: 'm2', memberName: 'Verified Member', at },
  { id: 'cert', kind: 'certification', label: 'Earned certificate', memberId: 'm3', memberName: 'Certified Member', at },
  { id: 'event', kind: 'event', label: 'Enrolled in a program', memberId: 'm4', memberName: 'Enrolled Member', at },
];

beforeEach(() => {
  vi.clearAllMocks();
  h.fetch.mockResolvedValue(new Response(JSON.stringify({ milestones }), { status: 200 }));
  vi.stubGlobal('fetch', h.fetch);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('partner milestone placement verification', () => {
  it('counts verified placements as wins and shows self-reports as pending on desktop', async () => {
    render(<PartnerMilestonesView />);
    await screen.findByText('Milestone feed (4)');
    expect(screen.getByText('1 placements')).toHaveAttribute('data-tone', 'ok');
    expect(screen.getByText('1 pending placements')).toHaveAttribute('data-tone', 'warn');
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50');
    const pending = screen.getByText('Placement reported, pending verification').closest('li');
    expect(pending).not.toBeNull();
    expect(within(pending!).getByText('Pending verification')).toHaveAttribute('data-tone', 'warn');
    expect(within(pending!).queryByText('Placement')).toBeNull();
  });

  it('puts only self-reported placement in Pending Review on mobile', async () => {
    render(<PartnerMilestonesMobile />);
    await screen.findByText('Placement reported, pending verification');
    expect(screen.getByText('Pending verification')).toHaveAttribute('data-tone', 'warn');
    expect(screen.getByText('Completed (', { exact: false })).toHaveTextContent('3');
    fireEvent.click(screen.getByRole('button', { name: /Completed/ }));
    expect(screen.getByText(/Placed at Confirmed Employer/)).toBeVisible();
    expect(screen.getByText(/Earned certificate/)).toBeVisible();
  });
});
