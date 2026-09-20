import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Swap the design-system primitives for plain elements so these tests assert
// the roster's preset behaviour rather than Astryx internals. The segmented
// control is rendered as real buttons so chip clicks can be exercised.
vi.mock('@astryxdesign/core/Card', () => ({
  Card: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@astryxdesign/core/Button', () => ({
  Button: ({ label }: { label: string }) => <span>{label}</span>,
}));
vi.mock('@astryxdesign/core/Link', () => ({
  Link: ({ children, href }: { children?: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
vi.mock('@astryxdesign/core/SegmentedControl', () => ({
  SegmentedControl: ({
    children,
    onChange,
    label,
  }: {
    children?: React.ReactNode;
    onChange: (value: string) => void;
    label: string;
  }) => (
    <div role="radiogroup" aria-label={label} data-onchange="1">
      {Array.isArray(children)
        ? children.map((child: { props: { value: string; label: string } }) => (
            <button type="button" key={child.props.value} onClick={() => onChange(child.props.value)}>
              {child.props.label}
            </button>
          ))
        : null}
    </div>
  ),
  SegmentedControlItem: () => null,
}));
vi.mock('@astryxdesign/core/Token', () => ({
  Token: ({ label }: { label: string }) => <span>{label}</span>,
}));
vi.mock('@astryxdesign/core/ProgressBar', () => ({
  ProgressBar: () => <div role="progressbar" />,
}));
const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

import { StudentsRosterKit, type StudentRow } from '@/components/portal/kit/pages/admin-subviews/StudentsRosterKit';

afterEach(() => {
  cleanup();
  push.mockClear();
});

const IT = 'IT Support Professional Certificate (IBM)';
const AI = 'AI and Software Developer Professional Certificate';

/** Same learners in both presets; the training facts are ignored by the roster preset and vice versa. */
const ROWS: StudentRow[] = [
  {
    id: 'u1:it', name: 'Noel Gonzalez', email: 'noel@example.test', location: 'Austin, TX', program: IT,
    progress: 22, readiness: 40, counselor: 'S. Chen', status: 'At Risk',
    training: { modulesDone: 2, modulesTotal: 10, pace: 'Behind' },
    courseraGrade: 85.4, inWap: true, noProgram: true, lastActive: '2h ago', lastActiveAt: 3,
  },
  {
    id: 'u2:ai', name: 'Joseph David Ring', email: 'joseph@example.test', location: 'Austin, TX', program: AI,
    progress: 16, readiness: 55, counselor: 'R. Patel', status: 'In Training',
    training: { modulesDone: 2, modulesTotal: 17, pace: 'Behind' },
    courseraGrade: 86.8, inWap: true, lastActive: '1d ago', lastActiveAt: 2,
  },
  {
    id: 'u3:it', name: 'Avery Stone', email: 'avery@example.test', location: 'Round Rock, TX', program: IT,
    progress: 91, readiness: 84, counselor: 'S. Chen', status: 'Job-Ready',
    training: { modulesDone: 9, modulesTotal: 10, pace: 'Ahead' },
    courseraGrade: null, inWap: true, lastActive: '16d ago', lastActiveAt: 1,
  },
  {
    id: 'u4:it', name: 'Dana Reed', email: 'dana@example.test', location: 'Austin, TX', program: IT,
    progress: 0, readiness: 10, counselor: 'Unassigned', status: 'In Training',
    training: { modulesDone: 0, modulesTotal: 10, pace: 'Stalled' },
    courseraGrade: null, inWap: true, lastActive: '—', lastActiveAt: null,
  },
  {
    id: 'coursera:zed@example.com', name: 'Zed Coursera', email: 'zed@example.com', program: 'Coursera activity',
    progress: 4, status: 'In Training', training: { modulesDone: 0, modulesTotal: 3, pace: 'Stalled' },
    inWap: false, lastActive: '5h ago', lastActiveAt: 4,
    href: '/admin/coursera/learners/unmatched/zed%40example.com',
  },
];

/**
 * DataTable renders the table AND the mobile cards, hiding one with CSS, so
 * every learner's name is in the DOM twice. Reading order off the table keeps
 * these assertions unambiguous. The student cell is Avatar + a text block
 * whose first child div holds the name.
 */
function namesInTable(): string[] {
  const table = document.querySelector('table');
  if (!table) return [];
  return Array.from(table.querySelectorAll('tbody tr'))
    .map((row) => row.querySelector('td:first-child div > div > div')?.textContent?.trim() ?? '')
    .filter(Boolean);
}

function headersInTable(): string[] {
  return Array.from(document.querySelectorAll('table thead th')).map((th) =>
    th.querySelector('button span')?.textContent?.trim() ?? th.textContent?.trim() ?? '',
  );
}

function chipLabels(): string[] {
  return within(screen.getByRole('radiogroup', { name: 'Roster filters' }))
    .getAllByRole('button')
    .map((button) => button.textContent ?? '');
}

function clickChip(name: string) {
  const chip = within(screen.getByRole('radiogroup', { name: 'Roster filters' }))
    .getAllByRole('button')
    .find((button) => button.textContent?.startsWith(`${name} ·`));
  if (!chip) throw new Error(`chip ${name} not rendered`);
  fireEvent.click(chip);
}

function kpi(label: string): string {
  const labelNode = Array.from(document.querySelectorAll('.wa-kit-stat-label')).find(
    (node) => node.textContent?.trim() === label,
  );
  return labelNode?.parentElement?.querySelector('.wa-kit-stat-value')?.textContent?.trim() ?? '';
}

describe('StudentsRosterKit roster preset (default)', () => {
  it('renders the Students columns, status chips and no KPI strip', () => {
    render(<StudentsRosterKit students={ROWS} total={ROWS.length} />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Students');
    expect(headersInTable()).toEqual([
      'Student', 'Program', 'Progress', 'Coursera grade', 'Readiness', 'Counselor', 'Status', 'Last active',
    ]);
    expect(chipLabels()).toEqual(['All · 5', 'Job-Ready · 1', 'At Risk · 1', 'In Training · 2', 'Unmatched · 1']);
    expect(screen.queryByTestId('students-roster-kpis')).toBeNull();
  });

  it('opens most recently active first and filters by status chip', () => {
    render(<StudentsRosterKit students={ROWS} total={ROWS.length} />);
    expect(namesInTable()).toEqual(['Zed Coursera', 'Noel Gonzalez', 'Joseph David Ring', 'Avery Stone', 'Dana Reed']);
    clickChip('In Training');
    expect(namesInTable()).toEqual(['Joseph David Ring', 'Dana Reed']);
    clickChip('Unmatched');
    expect(namesInTable()).toEqual(['Zed Coursera']);
  });

  it('links to the training preset and the management hub', () => {
    render(<StudentsRosterKit students={ROWS} total={ROWS.length} />);
    const nav = screen.getByRole('navigation', { name: 'Roster views' });
    expect(within(nav).getByText('Training progress').closest('a')?.getAttribute('href')).toBe('/admin/students?view=training');
    expect(within(nav).getByText('Management hub').closest('a')?.getAttribute('href')).toBe('/admin/members');
  });
});

describe('StudentsRosterKit training preset', () => {
  function renderTraining(extra: Partial<React.ComponentProps<typeof StudentsRosterKit>> = {}) {
    return render(<StudentsRosterKit view="training" students={ROWS} total={ROWS.length} {...extra} />);
  }

  it('renders the Training progress columns, pace chips and KPI strip', () => {
    renderTraining();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Training progress');
    expect(headersInTable()).toEqual([
      'Student', 'Program', 'Modules', '% Complete', 'Coursera grade', 'Pace', 'Last active',
    ]);
    expect(chipLabels()).toEqual([
      'All · 5', 'Ahead · 1', 'On track · 0', 'Behind · 2', 'Stalled · 1', 'Unmatched · 1',
    ]);
    expect(screen.getByTestId('students-roster-kpis')).toBeTruthy();
  });

  it('opens most complete first and shows module counts', () => {
    renderTraining();
    expect(namesInTable()).toEqual([
      'Avery Stone', 'Noel Gonzalez', 'Joseph David Ring', 'Zed Coursera', 'Dana Reed',
    ]);
    const table = screen.getByRole('table');
    expect(within(table).getByText('Noel Gonzalez').closest('tr')?.textContent).toContain('2 / 10');
  });

  it('filters by pace chip and keeps unmatched identities out of pace chips', () => {
    renderTraining();
    clickChip('Stalled');
    expect(namesInTable()).toEqual(['Dana Reed']);
    clickChip('Unmatched');
    expect(namesInTable()).toEqual(['Zed Coursera']);
    clickChip('Behind');
    expect(namesInTable()).toEqual(['Noel Gonzalez', 'Joseph David Ring']);
  });

  it('recomputes the KPI strip from the filtered rows', () => {
    // A filtered table above unfiltered totals reads as though the totals were
    // the filter's result, which is the accuracy problem this page had.
    renderTraining();
    expect(kpi('On Track')).toBe('1');
    expect(kpi('Behind')).toBe('2');
    expect(kpi('Stalled')).toBe('2');
    clickChip('Behind');
    expect(kpi('On Track')).toBe('0');
    expect(kpi('Behind')).toBe('2');
    expect(kpi('Stalled')).toBe('0');
    // (22 + 16) / 2 = 19
    expect(kpi('Avg %')).toBe('19%');
  });

  it('orders pace by health from the column header', () => {
    renderTraining();
    fireEvent.click(screen.getByRole('button', { name: /^Sort by Pace/ }));
    // Metrics default to descending on first click: worst pace first.
    expect(namesInTable()[0]).toBe('Zed Coursera');
    fireEvent.click(screen.getByRole('button', { name: /^Sort by Pace, descending/ }));
    expect(namesInTable()[0]).toBe('Avery Stone');
  });

  it('parks missing last-active timestamps last from the column header', () => {
    renderTraining();
    fireEvent.click(screen.getByRole('button', { name: /^Sort by Last active/ }));
    expect(namesInTable()).toEqual([
      'Zed Coursera', 'Noel Gonzalez', 'Joseph David Ring', 'Avery Stone', 'Dana Reed',
    ]);
  });

  it('marks a program inferred from activity rather than assigned', () => {
    renderTraining();
    const table = screen.getByRole('table');
    const noelRow = within(table).getByText('Noel Gonzalez').closest('tr');
    expect(noelRow?.textContent).toContain('No program');
    expect(noelRow?.textContent).toContain(`${IT} (inferred)`);
    const averyRow = within(table).getByText('Avery Stone').closest('tr');
    expect(averyRow?.textContent).not.toContain('inferred');
  });

  it('links back to the roster preset and to the legacy detailed view', () => {
    renderTraining({ viewHrefs: { roster: '/admin/students', training: '/admin/training-progress' } });
    const nav = screen.getByRole('navigation', { name: 'Roster views' });
    expect(within(nav).getByText('Roster').closest('a')?.getAttribute('href')).toBe('/admin/students');
    expect(within(nav).getByText('Detailed view').closest('a')?.getAttribute('href')).toBe('/admin/training-progress?ui=legacy');
  });

  it('shows the loader coverage disclosure in place of the default footer', () => {
    renderTraining({ showingLabel: '47 of 128 members have training activity · 81 not in a program or course yet' });
    expect(screen.getByTestId('students-roster-footer').textContent).toContain('47 of 128 members');
  });
});

describe('StudentsRosterKit shared behaviour', () => {
  it('narrows both presets with the search box and shows the preset empty state', () => {
    render(<StudentsRosterKit students={ROWS} total={ROWS.length} />);
    fireEvent.change(screen.getByLabelText('Search students'), { target: { value: 'gonzalez' } });
    expect(namesInTable()).toEqual(['Noel Gonzalez']);
    fireEvent.change(screen.getByLabelText('Search students'), { target: { value: 'nobody' } });
    expect(namesInTable()).toEqual([]);
    expect(screen.getAllByText('No students match this view').length).toBeGreaterThan(0);
    cleanup();

    render(<StudentsRosterKit view="training" students={ROWS} total={ROWS.length} />);
    fireEvent.change(screen.getByLabelText('Search learners'), { target: { value: 'zed@example.com' } });
    expect(namesInTable()).toEqual(['Zed Coursera']);
  });

  it('opens the member record, or the row href when one is set', () => {
    render(<StudentsRosterKit view="training" students={ROWS} total={ROWS.length} />);
    const table = screen.getByRole('table');
    fireEvent.click(within(table).getByText('Zed Coursera').closest('tr') as HTMLElement);
    expect(push).toHaveBeenCalledWith('/admin/coursera/learners/unmatched/zed%40example.com');
    fireEvent.click(within(table).getByText('Avery Stone').closest('tr') as HTMLElement);
    expect(push).toHaveBeenCalledWith('/admin/members/u3:it');
  });
});
