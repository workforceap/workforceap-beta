import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EmployerHomeKit, type EmployerCandidateRow } from '@/components/portal/kit/pages/employer/EmployerHomeKit';

/**
 * WAP-210: the employer home showed numbers nothing measured.
 *  - "Community impact" printed hires × $50,000 × 10% as "an estimated $X from
 *    your hires so far" whenever the page passed no real figure (it never did).
 *  - "View all N" printed the table's row count, capped at 5 by the query.
 */
const candidates: EmployerCandidateRow[] = Array.from({ length: 5 }, (_, i) => ({
  id: `app-${i}`,
  name: `Candidate ${i}`,
  role: 'IT Support Specialist',
  status: 'applied',
  statusLabel: 'New',
}));

describe('EmployerHomeKit numbers (WAP-210)', () => {
  it('states the 10% policy without inventing a dollar figure', () => {
    render(<EmployerHomeKit companyName="Acme" hires={3} candidates={candidates} />);
    expect(
      screen.getByText(/reinvests 10% of every first-year salary from your hires/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/\$\d/)).toBeNull();
    expect(screen.queryByText(/from your hires so far/)).toBeNull();
  });

  it('names a giveback figure only when one is passed', () => {
    render(<EmployerHomeKit companyName="Acme" hires={3} candidates={candidates} givebackFigure="$12,400" />);
    expect(screen.getByText(/an estimated \$12,400 from your hires so far/)).toBeInTheDocument();
  });

  it('"View all" counts every candidate, not the five rows on screen', () => {
    render(<EmployerHomeKit companyName="Acme" candidates={candidates} candidatesTotal={300} />);
    expect(screen.getByRole('link', { name: /View all 300/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /View all 5\b/ })).toBeNull();
  });

  it('"View all" carries no number when the total is unknown', () => {
    render(<EmployerHomeKit companyName="Acme" candidates={candidates} />);
    const link = screen.getByRole('link', { name: /View all/ });
    expect(link.textContent).not.toMatch(/\d/);
  });
});
