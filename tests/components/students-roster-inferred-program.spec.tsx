import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@astryxdesign/core/Card', () => ({
  Card: ({ children }: { children?: React.ReactNode }) => <div data-testid="card">{children}</div>,
}));
vi.mock('@astryxdesign/core/Token', () => ({
  Token: ({ label }: { label: string }) => <span>{label}</span>,
}));
vi.mock('@astryxdesign/core/ProgressBar', () => ({ ProgressBar: () => <div role="progressbar" /> }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { StudentsRosterKit, type StudentRow } from '@/components/portal/kit/pages/admin-subviews/StudentsRosterKit';
import { emailWrapParts, rosterProgramLabel, ROSTER_PROGRAM_PLACEHOLDERS } from '@/lib/admin/studentsRosterView';

afterEach(cleanup);

/**
 * WAP-209 (phone QA, 390x844): `loadTrainingRoster` can produce a named program
 * with no assignment, and the dev Students roster deliberately shows the same
 * shape. Every kit view (table and phone card) marks that title as inferred.
 * The production default roster loader instead supplies a placeholder when
 * no program is assigned. Emails prefer a break at "@" or a local-part dot.
 */

const IT = 'IT Support Professional Certificate (IBM)';

const base = {
  location: 'Austin, TX',
  progress: 40,
  readiness: 60,
  counselor: 'S. Chen',
  status: 'In Training' as const,
  lastActive: '2h ago',
  inWap: true,
};
const inferred: StudentRow = { ...base, id: 'u1', name: 'Noel Gonzalez', email: 'noel@example.test', program: IT, noProgram: true, training: { modulesDone: 3, modulesTotal: 9, pace: 'On track' } };
const assigned: StudentRow = { ...base, id: 'u2', name: 'Avery Stone', email: 'avery.stone@example.test', program: IT, training: { modulesDone: 5, modulesTotal: 9, pace: 'Ahead' } };
const unassigned: StudentRow = { ...base, id: 'u3', name: 'Dana Reed', email: 'dana@example.test', program: ROSTER_PROGRAM_PLACEHOLDERS.unassigned, noProgram: true };

describe('inferred program label in every roster view (WAP-209)', () => {
  it.each(['roster', 'training'] as const)('%s view: the table row and the phone card both say "(inferred)"', (view) => {
    render(<StudentsRosterKit view={view} students={[inferred, assigned]} total={2} />);
    const tableRow = within(screen.getByRole('table')).getByText('Noel Gonzalez').closest('tr')!;
    expect(tableRow.textContent).toContain('No program');
    expect(tableRow.textContent).toContain(`${IT} (inferred)`);

    const cards = screen.getAllByTestId('card');
    const noelCard = cards.find((card) => card.textContent?.includes('Noel Gonzalez'))!;
    expect(noelCard.textContent).toContain('No program');
    expect(noelCard.textContent).toContain(`${IT} (inferred)`);

    // An assigned program never carries the suffix.
    const averyRow = within(screen.getByRole('table')).getByText('Avery Stone').closest('tr')!;
    expect(averyRow.textContent).not.toContain('inferred');
    const averyCard = cards.find((card) => card.textContent?.includes('Avery Stone'))!;
    expect(averyCard.textContent).not.toContain('inferred');
  });

  it('roster view: a placeholder like "Unassigned" beside "No program" stays as it is', () => {
    render(<StudentsRosterKit students={[unassigned]} total={1} />);
    const tableRow = within(screen.getByRole('table')).getByText('Dana Reed').closest('tr')!;
    expect(tableRow.textContent).toContain('No program');
    expect(tableRow.textContent).not.toContain('inferred');
  });

  it('rosterProgramLabel: suffix only for a WAP member with no assigned program whose title names one', () => {
    expect(rosterProgramLabel(inferred)).toBe(`${IT} (inferred)`);
    expect(rosterProgramLabel(assigned)).toBe(IT);
    for (const placeholder of Object.values(ROSTER_PROGRAM_PLACEHOLDERS)) {
      expect(rosterProgramLabel({ program: placeholder, noProgram: true, inWap: true })).toBe(placeholder);
    }
    // Unmatched Coursera identities are not WAP members; the "Unmatched" token already says so.
    expect(rosterProgramLabel({ program: 'Coursera activity', noProgram: true, inWap: false })).toBe('Coursera activity');
  });
});

describe('email wrapping at phone width (WAP-209)', () => {
  it('emailWrapParts: breaks after name-part dots and before "@", never inside the domain', () => {
    expect(emailWrapParts('avery@example.test')).toEqual(['avery', '@example.test']);
    expect(emailWrapParts('michael.brown.1@example.test')).toEqual(['michael.', 'brown.', '1', '@example.test']);
    expect(emailWrapParts('no-at-sign')).toEqual(['no-at-sign']);
    expect(emailWrapParts('@example.test')).toEqual(['@example.test']);
    for (const email of ['avery@example.test', 'michael.brown.1@example.test', 'no-at-sign']) {
      expect(emailWrapParts(email).join('')).toBe(email);
    }
  });

  it('renders the email with a <wbr> before "@" and break-word, not overflow-wrap:anywhere', () => {
    render(<StudentsRosterKit students={[assigned]} total={1} />);
    const emails = screen.getAllByText('avery.stone@example.test');
    expect(emails.length).toBe(2); // table row + phone card
    for (const email of emails) {
      expect(email.innerHTML).toBe('avery.<wbr>stone<wbr>@example.test');
      expect(email).toHaveStyle({ overflowWrap: 'break-word', whiteSpace: 'normal' });
    }
  });
});
