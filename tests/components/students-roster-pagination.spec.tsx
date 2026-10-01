import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@astryxdesign/core/Card', () => ({
  Card: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@astryxdesign/core/SegmentedControl', () => ({
  SegmentedControl: ({ children }: { children?: React.ReactNode }) => <div data-testid="chips">{children}</div>,
  SegmentedControlItem: () => null,
}));
vi.mock('@astryxdesign/core/Token', () => ({
  Token: ({ label }: { label: string }) => <span>{label}</span>,
}));
vi.mock('@astryxdesign/core/ProgressBar', () => ({
  ProgressBar: () => <div role="progressbar" />,
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { StudentsRosterKit, type StudentRow } from '@/components/portal/kit/pages/admin-subviews/StudentsRosterKit';
import { KIT_TABLE_PAGE_SIZE } from '@/components/portal/kit/kitTableUrlState';

afterEach(cleanup);

/**
 * Portal refine (2026-09-22, item 17): the roster rendered every filtered row
 * — a 132-row org became 132 stacked cards (a 34 000px page) on a phone. The
 * kit pages the filtered set at KIT_TABLE_PAGE_SIZE and the saved-view chip
 * strip scrolls sideways instead of clipping its last chip at 390px.
 */

const ROWS: StudentRow[] = Array.from({ length: KIT_TABLE_PAGE_SIZE + 10 }, (_, i) => ({
  id: `s${i + 1}`,
  name: `Student ${String(i + 1).padStart(2, '0')}`,
  email: `student${i + 1}@example.test`,
  location: 'Austin, TX',
  program: i % 2 === 0 ? 'IT Support' : 'Healthcare',
  progress: 50,
  readiness: 60,
  counselor: 'S. Chen',
  status: 'In Training',
  lastActive: '2h ago',
  // Descending default sort: keep insertion order stable for the assertions.
  lastActiveAt: ROWS_COUNT_HELPER(i),
}));

function ROWS_COUNT_HELPER(i: number): number {
  return 1000 - i;
}

/** Clickable kit rows carry role="button", so count body rows by element rather than role. */
function bodyRows(): HTMLElement[] {
  return Array.from(screen.getByRole('table').querySelectorAll<HTMLElement>('tbody tr'));
}

describe('StudentsRosterKit pagination', () => {
  it('shows one page of rows and a pager when the filtered roster exceeds the page size', () => {
    render(<StudentsRosterKit students={ROWS} total={ROWS.length} />);
    expect(bodyRows()).toHaveLength(KIT_TABLE_PAGE_SIZE);
    const navs = screen.getAllByRole('navigation', { name: 'Roster pagination' });
    expect(navs.length).toBeGreaterThan(0);
  });

  it('moves to the next page and drops back to page 1 when the search changes', () => {
    render(<StudentsRosterKit students={ROWS} total={ROWS.length} />);
    const [nav] = screen.getAllByRole('navigation', { name: 'Roster pagination' });
    fireEvent.click(within(nav).getByRole('button', { name: 'Go to next page' }));
    expect(bodyRows()).toHaveLength(ROWS.length - KIT_TABLE_PAGE_SIZE);

    fireEvent.change(screen.getByPlaceholderText('Name, email or program'), { target: { value: 'Student' } });
    expect(bodyRows()).toHaveLength(KIT_TABLE_PAGE_SIZE);
  });

  it('renders no pager for a roster that fits one page', () => {
    render(<StudentsRosterKit students={ROWS.slice(0, 3)} total={3} />);
    expect(bodyRows()).toHaveLength(3);
    expect(screen.queryByRole('navigation', { name: 'Roster pagination' })).toBeNull();
  });

  it('wraps the saved-view chips in the sideways-scrolling strip', () => {
    render(<StudentsRosterKit students={ROWS.slice(0, 3)} total={3} />);
    const strip = screen.getByTestId('chips').parentElement;
    expect(strip).not.toBeNull();
    expect(strip!.className).toContain('wa-kit-view-chips');
  });
});
