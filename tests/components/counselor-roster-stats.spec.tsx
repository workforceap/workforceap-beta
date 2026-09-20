import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import CounselorRosterStats from '@/components/portal/counselor/CounselorRosterStats';
import type { CounselorRosterStat } from '@/lib/counselor/rosterStats';

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: React.ComponentProps<'a'>) => <a href={href} {...rest}>{children}</a>,
}));

const STATS: CounselorRosterStat[] = [
  { key: 'atRisk', label: 'At risk', value: 2, caption: 'Saved at-risk alert that is open, acknowledged or escalated', tone: 'accent', href: '/counselor/at-risk' },
  { key: 'replyOwed', label: 'Reply owed', value: 0, caption: 'Member message without a staff reply for 24+ hours', href: '/counselor/queue' },
  { key: 'completions', label: 'Completions, 30d', value: 5, caption: 'Courses completed by your members in the last 30 days', href: '/counselor/triage' },
  { key: 'placements', label: 'Placements, 30d', value: 1, caption: 'Placements recorded for your members in the last 30 days', href: '/counselor/placements' },
];

/** Counselor audit §6 item 4: four tiles, each says why, each goes somewhere. */
describe('CounselorRosterStats', () => {
  it('renders exactly four linked tiles with a caption under every number', () => {
    render(<CounselorRosterStats stats={STATS} />);
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(4);
    for (const [i, stat] of STATS.entries()) {
      expect(links[i]).toHaveAttribute('href', stat.href);
      expect(links[i].className).toContain('wa-kit-focus');
      expect(within(links[i]).getByText(stat.label)).toBeInTheDocument();
      expect(within(links[i]).getByText(String(stat.value))).toBeInTheDocument();
      expect(within(links[i]).getByText(stat.caption)).toBeInTheDocument();
    }
  });

  it('maps the attention tone onto the tile hook and keeps every number neutral (WAP-99)', () => {
    render(<CounselorRosterStats stats={STATS} />);
    const atRiskValue = screen.getByText('2');
    expect(atRiskValue.style.color).toBe('');
    expect(atRiskValue.closest('.wa-kit-card')!.classList.contains('wa-kit-tone--alert')).toBe(true);
    const replyOwedValue = screen.getByText('0');
    expect(replyOwedValue.style.color).toBe('');
    expect(replyOwedValue.closest('.wa-kit-card')!.className).not.toMatch(/wa-kit-tone--/);
  });

  it('no longer prints the roster-size and cohort cards the audit flagged as repeats', () => {
    render(<CounselorRosterStats stats={STATS} />);
    for (const gone of ['Total Members', 'Active Members', 'Avg Progress', 'Enrolled', 'Hot member queue']) {
      expect(screen.queryByText(gone)).toBeNull();
    }
  });
});
