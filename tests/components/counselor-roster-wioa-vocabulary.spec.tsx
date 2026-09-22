import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

/**
 * Counselor roster WIOA pill speaks the shared staff intake vocabulary.
 * Bug fixed: `needs_info` used to fall through the `not_eligible` case and
 * read "Not Eligible" in red; it now reads "Needs more information" (alert).
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/counselor/students',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: React.ComponentProps<'a'>) => <a href={href} {...rest}>{children}</a>,
}));

import CounselorStudentsRosterClient, {
  type CounselorRosterClientRow,
} from '@/components/portal/counselor/CounselorStudentsRosterClient';

function row(id: string, wioaReviewStatus: string | null): CounselorRosterClientRow {
  return {
    assignmentId: `assign-${id}`,
    memberId: `member-${id}`,
    fullName: `Member ${id}`,
    email: `${id}@example.test`,
    enrolledProgram: null,
    curriculumVersion: null,
    programInterest: null,
    assessmentScorePct: null,
    wioaReviewStatus,
    memberProgramProgress: [],
    riskScore: null,
    riskLevel: 'LOW',
    lastActivityAt: null,
  };
}

const ROWS = [
  row('needs', 'needs_info'),
  row('noteligible', 'not_eligible'),
  row('verified', 'verified'),
  row('pending', 'pending'),
  row('review', 'in_review'),
  row('none', null),
];

function tagsWithText(container: HTMLElement, text: string): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>('.wa-kit-tag')).filter((el) => el.textContent === text);
}

afterEach(cleanup);

describe('counselor roster — WIOA pill vocabulary', () => {
  it('labels needs_info "Needs more information" with the alert tone, not "Not Eligible"', () => {
    const { container } = render(<CounselorStudentsRosterClient rows={ROWS} filterMeta={[]} />);
    // Desktop table + mobile card both render (CSS picks one), so expect ≥ 1 and all alike.
    const needsInfo = tagsWithText(container, 'Needs more information');
    expect(needsInfo.length).toBeGreaterThan(0);
    for (const tag of needsInfo) expect(tag.className).toContain('wa-kit-tag--alert');
    expect(screen.queryByText('Not Eligible')).toBeNull();
    expect(screen.queryByText('WIOA Pending')).toBeNull();
    expect(screen.queryByText('WIOA Verified')).toBeNull();
    expect(screen.queryByText('WIOA: Not Started')).toBeNull();
  });

  it('paints not_eligible as danger and the other states with their vocabulary tone', () => {
    const { container } = render(<CounselorStudentsRosterClient rows={ROWS} filterMeta={[]} />);
    const expectTone = (text: string, tone: string) => {
      const tags = tagsWithText(container, text);
      expect(tags.length, text).toBeGreaterThan(0);
      for (const tag of tags) expect(tag.className, text).toContain(`wa-kit-tag--${tone}`);
    };
    expectTone('Not eligible', 'danger');
    expectTone('Intake verified', 'ok');
    expectTone('Awaiting review', 'warn');
    expectTone('In review', 'info');
    expectTone('Not reviewed', 'muted');
    // Exactly one row reads "Not eligible" — the needs_info row no longer joins it.
    const notEligibleRows = new Set(tagsWithText(container, 'Not eligible').map((el) => el.closest('tr, .wa-kit-card')));
    expect(notEligibleRows.size).toBeLessThanOrEqual(2);
  });

  it('explains the needs_info state in the tooltip instead of calling the member ineligible', () => {
    const { container } = render(<CounselorStudentsRosterClient rows={[row('needs', 'needs_info')]} filterMeta={[]} />);
    const tooltips = Array.from(container.querySelectorAll<HTMLElement>('[title]')).map((el) => el.title);
    expect(tooltips.some((t) => /more information/i.test(t))).toBe(true);
    expect(tooltips.some((t) => /not eligible/i.test(t))).toBe(false);
  });
});
