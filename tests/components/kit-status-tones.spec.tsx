import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('@astryxdesign/core/Card', () => ({
  Card: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@astryxdesign/core/SegmentedControl', () => ({
  SegmentedControl: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  SegmentedControlItem: () => null,
}));
vi.mock('@astryxdesign/core/Token', () => ({
  Token: ({ label }: { label: string }) => <span data-astryx-token>{label}</span>,
}));
vi.mock('@astryxdesign/core/ProgressBar', () => ({ ProgressBar: () => <div role="progressbar" /> }));
vi.mock('@/components/portal/EmployerApplicationChatClient', () => ({ default: () => null }));

import { UniversalSearch } from '@/components/portal/kit/UniversalSearch';
import { CounselorsRosterKit, type CounselorRow } from '@/components/portal/kit/pages/admin-subviews/CounselorsRosterKit';
import { StudentsRosterKit, type StudentRow } from '@/components/portal/kit/pages/admin-subviews/StudentsRosterKit';
import { EmployerHomeKit, type EmployerCandidateRow } from '@/components/portal/kit/pages/employer/EmployerHomeKit';
import MobileApplicationsClient from '@/components/employer/MobileApplicationsClient';
import type { EmployerApplicationRow } from '@/components/employer/EmployerApplicationsClient';

afterEach(cleanup);

/**
 * Portal refine (2026-09-22): what the kit renders for the status surfaces the
 * audit measured under AA. The contrast arithmetic for the tokens lives in
 * tests/lib/success-text-token-contrast.spec.ts; this file proves the
 * components read the neutral / tokenised paths.
 *
 *   - Numerals stay neutral (KIT_GUIDE §4): the counselors roster at-risk and
 *     placements counts, the employer pipeline fit % and the students roster
 *     readiness score used to paint the base --wa-success / --wa-gold /
 *     --wa-accent hues (3.45 / 3.70:1 on white).
 *   - The ⌘K hint is a kit <kbd>, not the gray Astryx Token (3.14:1 on the
 *     dark header).
 *   - The employer mobile applications pill is the kit StatusTag with the
 *     guide §4 tones, not a hex palette without a dark variant.
 */

const BASE_HUES = ['var(--wa-success)', 'var(--wa-gold)', 'var(--wa-accent)', 'var(--wa-info)'];

function textNodes(text: string): HTMLElement[] {
  return screen.getAllByText(text, { exact: true });
}

describe('numerals stay neutral', () => {
  it('counselors roster: at-risk and placements counts carry no state hue (table and mobile card)', () => {
    const row: CounselorRow = {
      id: 'c1', name: 'Devon Whitfield', initials: 'DW', caption: 'WorkforceAP · Senior Career Coach',
      caseload: 52, atRisk: 9, placements: 33, avgResponse: '3.6h', load: 'Over',
    };
    render(<CounselorsRosterKit counselors={[row]} total={1} matchingTotal={1} avgCaseload={52} atRiskOwned={9} avgResponse="3.6h" />);
    const numerals = [...textNodes('9'), ...textNodes('33')];
    expect(numerals.length).toBeGreaterThanOrEqual(2);
    for (const el of numerals) {
      const color = el.style.color;
      expect(color === '' || color === 'var(--wa-text)', `${el.outerHTML} paints ${color}`).toBe(true);
      expect(BASE_HUES).not.toContain(color);
    }
  });

  it('students roster: the readiness score is --wa-text, not a score→colour ladder', () => {
    const rows: StudentRow[] = [
      { id: '1', name: 'Avery Stone', email: 'avery@example.test', location: 'Austin, TX', program: 'IT Support', progress: 91, readiness: 84, counselor: 'S. Chen', status: 'Job-Ready', lastActive: '2h ago', lastActiveAt: 3 },
      { id: '2', name: 'Blake Reed', email: 'blake@example.test', location: 'Austin, TX', program: 'Healthcare', progress: 22, readiness: 40, counselor: 'R. Patel', status: 'At Risk', lastActive: '16d ago', lastActiveAt: 1 },
    ];
    render(<StudentsRosterKit students={rows} total={rows.length} />);
    // 84 (would have been green) and 40 (would have been crimson): both the table cell and the mobile card.
    const numerals = [...textNodes('84'), ...textNodes('40')];
    expect(numerals.length).toBeGreaterThanOrEqual(2);
    for (const el of numerals) {
      const color = el.style.color;
      expect(color === '' || color === 'var(--wa-text)', `${el.outerHTML} paints ${color}`).toBe(true);
    }
  });

  it('employer pipeline: the fit % is --wa-text for high, mid and low scores', () => {
    const candidates: EmployerCandidateRow[] = [
      { id: 'a', name: 'Maria Gonzalez', role: 'Salesforce Administrator', fitScore: 94, status: 'interview' },
      { id: 'b', name: 'Ethan Brooks', role: 'IT Support Specialist', fitScore: 76, status: 'reviewing' },
      { id: 'c', name: 'Alicia Fontaine', role: 'Business Systems Analyst', fitScore: 42, status: 'applied' },
    ];
    render(<EmployerHomeKit companyName="Deloitte" candidates={candidates} />);
    const fits = [...textNodes('94%'), ...textNodes('76%'), ...textNodes('42%'), ...textNodes('94% fit'), ...textNodes('76% fit'), ...textNodes('42% fit')];
    expect(fits.length).toBeGreaterThanOrEqual(3);
    for (const el of fits) expect(el.style.color).toBe('var(--wa-text)');
  });

  it('employer pipeline: "Candidate pipeline" is an h2 directly under the page h1', () => {
    render(<EmployerHomeKit companyName="Deloitte" candidates={[]} />);
    expect(screen.getByRole('heading', { level: 2, name: 'Candidate pipeline' })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });
});

describe('⌘K hint', () => {
  it('renders as a kit <kbd>, not the gray Astryx Token', () => {
    render(<UniversalSearch hint />);
    const hint = screen.getByText('⌘K');
    expect(hint.tagName).toBe('KBD');
    expect(hint).toHaveClass('wa-kit-search-hint');
    expect(document.querySelector('[data-astryx-token]')).toBeNull();
  });
});

describe('employer mobile applications status pill', () => {
  const row = (id: string, status: string): EmployerApplicationRow => ({
    id, jobId: 'j1', status, appliedAt: '2026-09-01T00:00:00Z', employerNotes: null,
    job: { id: 'j1', title: 'Warehouse Associate' },
    student: { id: `s-${id}`, fullName: `Student ${id}`, email: `${id}@example.test` },
  });

  it('is the kit StatusTag with the §4 tones: rejected → danger, hired → ok, pending → alert, interview → info', () => {
    render(<MobileApplicationsClient initialRows={[row('r', 'rejected'), row('h', 'hired'), row('p', 'pending'), row('i', 'interview'), row('v', 'reviewing')]} />);
    const tagFor = (label: string) => screen.getByText(label, { selector: '.wa-kit-tag' });
    expect(tagFor('Not selected')).toHaveClass('wa-kit-tag--danger');
    expect(tagFor('Hired')).toHaveClass('wa-kit-tag--ok');
    expect(tagFor('New')).toHaveClass('wa-kit-tag--alert');
    expect(tagFor('Interviewing')).toHaveClass('wa-kit-tag--info');
    expect(tagFor('Reviewing')).toHaveClass('wa-kit-tag--warn');
    for (const tag of document.querySelectorAll<HTMLElement>('.wa-kit-tag')) {
      expect(tag.style.background).toBe('');
      expect(tag.style.color).toBe('');
    }
  });
});
