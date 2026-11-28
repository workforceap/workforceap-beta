import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { BADGES, type MemberBadge } from '@/lib/member/badgesConfig';
import { WIRED_EVENTS as POINTS_WIRED_EVENTS } from '@/lib/member/pointsConfig';
import MilestoneBadges, { WIRED_EVENTS } from './MilestoneBadges';

function badge(over: Partial<MemberBadge> & Pick<MemberBadge, 'key'>): MemberBadge {
  const def = BADGES.find((item) => item.key === over.key)!;
  return {
    label: def.label,
    description: def.description,
    earned: false,
    earnedAt: null,
    have: 0,
    need: def.need,
    ...over,
  };
}

const none: MemberBadge[] = BADGES.map((def) => badge({ key: def.key }));

describe('MilestoneBadges', () => {
  it('only offers badges whose event is awarded today', () => {
    for (const def of BADGES) {
      if (def.event) expect(POINTS_WIRED_EVENTS.has(def.event)).toBe(true);
      expect(WIRED_EVENTS.has(def.event ?? 'daily_study')).toBe(true);
    }
    expect(BADGES.map((def) => def.key)).toEqual([
      'ready_to_start',
      'resume_ready',
      'job_hunter',
      'first_course',
      'certified',
      'streak_7',
    ]);
  });

  it('shows every earned badge with its date and every locked badge with its progress', () => {
    render(
      <MilestoneBadges
        badges={[
          badge({ key: 'ready_to_start', earned: true, earnedAt: '2026-06-01T15:00:00.000Z', have: 1 }),
          badge({ key: 'job_hunter', have: 2 }),
          badge({ key: 'streak_7', earned: true, earnedAt: null, have: 9 }),
        ]}
      />,
    );
    const list = screen.getByRole('list', { name: 'Milestone badges' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(3);

    const ready = within(list).getByRole('listitem', { name: /Ready to start/ });
    expect(within(ready).getByText('Earned')).toBeTruthy();
    expect(within(ready).getByText(/Jun 1, 2026/)).toBeTruthy();
    expect(ready.querySelector('[aria-hidden]')).toBeTruthy();

    const hunter = within(list).getByRole('listitem', { name: /Job hunter/ });
    expect(within(hunter).getByText('Locked')).toBeTruthy();
    expect(within(hunter).getByText('2 of 3')).toBeTruthy();
    expect(within(hunter).queryByText('Earned')).toBeNull();

    const streak = within(list).getByRole('listitem', { name: /7-day streak/ });
    expect(within(streak).getAllByText('Earned').length).toBeGreaterThan(0);
    expect(within(streak).queryByText(/2026/)).toBeNull();
  });

  it('says nothing is earned yet when every badge is locked', () => {
    render(<MilestoneBadges badges={none} />);
    expect(screen.getByText('No badges earned yet.')).toBeTruthy();
    expect(screen.getAllByText('Locked')).toHaveLength(none.length);
    expect(screen.queryByText('Earned')).toBeNull();
  });

  it('shows the empty state when there are no badges to show', () => {
    render(<MilestoneBadges badges={[]} />);
    expect(screen.getByText('No badges earned yet.')).toBeTruthy();
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('shows only earned badges, plus the current and best streak, in the compact view', () => {
    render(
      <MilestoneBadges
        variant="compact"
        badges={[
          badge({ key: 'resume_ready', earned: true, earnedAt: '2026-06-02T15:00:00.000Z', have: 1 }),
          badge({ key: 'job_hunter', have: 1 }),
        ]}
        currentStreak={4}
        longestStreak={9}
      />,
    );
    const region = screen.getByRole('region', { name: 'Milestone badges' });
    expect(within(region).getByText('Resume ready')).toBeTruthy();
    expect(within(region).queryByText('Job hunter')).toBeNull();
    expect(within(region).getByText('4-day streak')).toBeTruthy();
    expect(within(region).getByText('Best: 9 days')).toBeTruthy();
  });

  it('keeps the compact streak visible when no badge is earned', () => {
    render(
      <MilestoneBadges
        variant="compact"
        badges={none}
        currentStreak={0}
        longestStreak={0}
      />,
    );
    expect(screen.getByText('No badges earned yet.')).toBeTruthy();
    expect(screen.getByText('No active streak')).toBeTruthy();
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('keeps every badge row inside a 375px column and the compact row free to wrap', () => {
    const host = document.createElement('div');
    host.style.width = '375px';
    document.body.appendChild(host);
    const { container, rerender } = render(<MilestoneBadges badges={none} />, { container: host });
    const grid = container.querySelector('[data-milestone-badges="grid"]') as HTMLElement;
    expect(grid.className).toMatch(/grid-cols-1/);
    expect(grid.className).not.toMatch(/grid-cols-[2-9]/);
    for (const item of grid.querySelectorAll('li')) {
      expect((item as HTMLElement).style.width).toBe('');
    }

    rerender(
      <MilestoneBadges
        variant="compact"
        badges={[badge({ key: 'resume_ready', earned: true, have: 1 }), badge({ key: 'ready_to_start', earned: true, have: 1 })]}
        currentStreak={1}
        longestStreak={12}
      />,
    );
    const compact = container.querySelector('[data-milestone-badges="compact"]') as HTMLElement;
    expect(compact.className).toMatch(/flex-wrap/);
    host.remove();
  });
});
