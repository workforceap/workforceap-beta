import { act, cleanup, render, screen, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import messages from '@/messages/en.json';
import WioaScreeningReadonly from '@/components/admin/WioaScreeningReadonly';
import AssessmentAnswersReadonly from '@/components/admin/AssessmentAnswersReadonly';
import CounselorIntakeReviewPanel from '@/components/counselor/CounselorIntakeReviewPanel';
import CounselorNotesPanel from '@/app/(portal)/counselor/students/[memberId]/CounselorNotesPanel';
import AdvisorSessionNotesPanel from '@/app/(portal)/counselor/students/[memberId]/AdvisorSessionNotesPanel';
import { computeWioaSignal, type WioaQualificationSnapshot } from '@/lib/wioa/wioaQualification';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';

/**
 * #2406 follow-up: the record panels inside the counselor student detail tabs
 * (application review, WIOA screening, assessment answers, counselor notes,
 * session notes) render on kit chrome — `.wa-kit-card` sections, kit heading
 * classes, `.wa-kit-meta` captions and the kit tone hooks — with no inline
 * `font-size` and no legacy `--color-*` / hex colours. Heading levels are the
 * ones the tab panels expect: the page owns the single h1, section panels
 * open with an h2, card heads below are h3.
 */

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }) }));
vi.mock('@/lib/fetchWithTimeout', () => ({ fetchWithTimeout: vi.fn() }));
vi.mock('@/components/admin/ConfirmDialog', () => ({ default: () => null }));

const answers = {
  ageBracket: '25_54' as const,
  countyOrZip: 'Travis',
  primaryBarrier: 'childcare' as const,
  dislocatedWorker: true,
  lowIncomeSelfReport: true,
  trainingInterest: true,
  completedIntakeSelfReport: false,
  publicAssistanceSelfReport: false,
};
const snapshot: WioaQualificationSnapshot = { version: 2, submittedAt: '2026-09-19T12:00:00Z', answers, ...computeWioaSignal(answers) };

const note = { id: 'n1', content: 'Reached out about the resume draft.', createdAt: '2026-09-18T19:00:00Z', updatedAt: '2026-09-18T19:00:00Z', author: { fullName: 'Dana Counselor', email: 'dana@example.test' }, canDelete: true };

const withIntl = (ui: ReactElement) => <NextIntlClientProvider locale="en" messages={messages}>{ui}</NextIntlClientProvider>;

const LEGACY_INLINE = /--color-|--surface|--outline|#[0-9a-fA-F]{3,8}\b/;

/** Every panel: kit card root, no inline font sizes, no legacy colours, no h1. */
function expectKitPanel(root: HTMLElement) {
  expect(root.classList.contains('wa-kit-card')).toBe(true);
  for (const el of Array.from(root.querySelectorAll<HTMLElement>('[style]'))) {
    expect(el.style.fontSize, `inline font-size on <${el.tagName.toLowerCase()}>`).toBe('');
    expect(el.getAttribute('style')).not.toMatch(LEGACY_INLINE);
  }
  for (const heading of Array.from(root.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6'))) {
    expect(heading.getAttribute('style')).toBeNull();
    expect(heading.className.trim()).not.toBe('');
  }
  expect(root.querySelector('h1')).toBeNull();
}

afterEach(cleanup);

describe('WioaScreeningReadonly', () => {
  it('is a kit card with an h2 section title and kit meta captions', () => {
    const { container } = render(
      <WioaScreeningReadonly snapshot={snapshot} reviewStatus="pending" reviewedAt="2026-09-19T13:00:00Z" reviewerName="Staff" reviewNotes="Docs requested" />,
    );
    const root = container.firstElementChild as HTMLElement;
    expectKitPanel(root);
    expect(root.tagName).toBe('SECTION');
    expect(within(root).getByRole('heading', { level: 2, name: 'WIOA self-screening' })).toBeInTheDocument();
    expect(root.querySelectorAll('h3')).toHaveLength(0);
    expect(root.querySelector('p')!.classList.contains('wa-kit-meta')).toBe(true);
    expect(within(root).getByText(/Docs requested/)).toBeInTheDocument();
  });
});

describe('AssessmentAnswersReadonly', () => {
  it('is a kit card with an h2 title and marks answers through the kit tone hooks', () => {
    const rows = [
      { id: 1, question: 'What does DNS do?', answer: 'B' as const, answerLabel: 'Resolves names', correct: true, points: 1 },
      { id: 2, question: 'Which layer routes packets?', answer: null, answerLabel: null, correct: false, points: 1 },
    ];
    const { container } = render(<AssessmentAnswersReadonly rows={rows} score={1} scorePct={50} completedAt="2026-09-19T12:00:00Z" programInterest="Cloud & IT" />);
    const root = container.firstElementChild as HTMLElement;
    expectKitPanel(root);
    expect(within(root).getByRole('heading', { level: 2, name: 'Training preassessment (skills check)' })).toBeInTheDocument();
    expect(within(root).getByLabelText('correct').classList.contains('wa-kit-tone--ok')).toBe(true);
    expect(within(root).getByLabelText('incorrect').classList.contains('wa-kit-tone--danger')).toBe(true);
    expect(root.querySelector('p')!.classList.contains('wa-kit-meta')).toBe(true);
  });
});

describe('CounselorIntakeReviewPanel', () => {
  it('is a kit card: h2 section title, h3 card head on wa-kit-stat-label, StatusTag for the application status', () => {
    render(
      <CounselorIntakeReviewPanel
        memberId="member-1"
        applications={[{ id: 'app-1', status: 'PENDING', programTitle: 'Cloud & IT', submittedAt: '2026-09-18T12:00:00Z' }]}
        wioa={{ hasScreening: true, submittedAt: snapshot.submittedAt, reviewStatus: 'pending', reviewedAt: null, reviewNotes: null }}
      />,
    );
    const root = screen.getByTestId('counselor-intake-review-panel');
    expectKitPanel(root);
    expect(within(root).getByRole('heading', { level: 2, name: 'Application review' })).toBeInTheDocument();
    const h3 = within(root).getByRole('heading', { level: 3, name: 'WIOA intake verification' });
    expect(h3.classList.contains('wa-kit-stat-label')).toBe(true);
    const status = within(root).getByText('Pending review');
    expect(status.classList.contains('wa-kit-tag')).toBe(true);
    expect(status.classList.contains('wa-kit-tag--warn')).toBe(true);
    expect(within(root).getByLabelText('Internal notes').className).not.toBe('');
  });
});

for (const [label, Component, heading] of [
  ['Counselor note', CounselorNotesPanel, 'Counselor Notes'],
  ['Session note', AdvisorSessionNotesPanel, 'Session Notes'],
] as const) {
  describe(`${label} panel`, () => {
    beforeEach(() => vi.mocked(fetchWithTimeout).mockReset().mockResolvedValue({ ok: true, json: async () => [note] } as Response));

    it('is a kit card whose h3 card head sits on wa-kit-stat-label, with kit meta captions and no inline sizes', async () => {
      const { container } = render(withIntl(<Component memberId="member-1" />));
      await act(async () => {});
      const root = container.firstElementChild as HTMLElement;
      expectKitPanel(root);
      const h3 = within(root).getByRole('heading', { level: 3, name: heading });
      expect(h3.classList.contains('wa-kit-stat-label')).toBe(true);
      expect(root.querySelectorAll('h2')).toHaveLength(0);
      expect(within(root).getByText(note.content)).toBeInTheDocument();
      expect(within(root).getByText(/Dana Counselor/).classList.contains('wa-kit-meta')).toBe(true);
    });
  });
}
