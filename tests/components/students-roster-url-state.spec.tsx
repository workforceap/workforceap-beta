import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@astryxdesign/core/Card', () => ({
  Card: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@astryxdesign/core/SegmentedControl', () => ({
  SegmentedControl: ({ children, onChange, label }: { children?: React.ReactNode; onChange: (value: string) => void; label: string }) => (
    <div role="radiogroup" aria-label={label}>
      {Array.isArray(children)
        ? children.map((child: { props: { value: string; label: string } }) => (
            <button type="button" key={child.props.value} onClick={() => onChange(child.props.value)}>{child.props.label}</button>
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
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { StudentsRosterKit, type StudentRow } from '@/components/portal/kit/pages/admin-subviews/StudentsRosterKit';

afterEach(cleanup);

const rows: StudentRow[] = [
  {
    id: '1',
    name: 'Avery Stone',
    email: 'avery@example.test',
    location: 'Austin, TX',
    program: 'IT Support',
    progress: 91,
    readiness: 84,
    counselor: 'S. Chen',
    status: 'Job-Ready',
    lastActive: '2h ago',
    lastActiveAt: 3,
  },
  {
    id: '2',
    name: 'Blake Reed',
    email: 'blake@example.test',
    location: 'Austin, TX',
    program: 'Healthcare',
    progress: 22,
    readiness: 40,
    counselor: 'R. Patel',
    status: 'At Risk',
    lastActive: '16d ago',
    lastActiveAt: 1,
  },
  {
    id: '3',
    name: 'Casey Lane',
    email: 'casey@example.test',
    location: 'Round Rock, TX',
    program: 'Data & AI',
    progress: 55,
    readiness: 70,
    counselor: 'S. Chen',
    status: 'In Training',
    lastActive: '5h ago',
    lastActiveAt: 2,
  },
];

const chip = (name: string) => within(screen.getByRole('radiogroup', { name: 'Roster filters' }))
  .getAllByRole('button').find((b) => b.textContent?.startsWith(`${name} ·`))!;

describe('roster URL state', () => {
  it('leaves a plain /admin/students URL untouched on mount (portal smoke row admin-open-student-roster)', () => {
    window.history.replaceState(null, '', '/admin/students');
    render(<StudentsRosterKit students={rows} total={rows.length} urlState="" />);
    expect(window.location.pathname + window.location.search).toBe('/admin/students');
  });

  it('still records a non-default chip and keeps it out of the URL again when reset to All', () => {
    window.history.replaceState(null, '', '/admin/students');
    render(<StudentsRosterKit students={rows} total={rows.length} urlState="" />);
    fireEvent.click(chip('At Risk'));
    expect(window.location.search).toContain('chip=At+Risk');
    fireEvent.click(chip('All'));
    expect(window.location.search).not.toContain('chip');
  });
});
