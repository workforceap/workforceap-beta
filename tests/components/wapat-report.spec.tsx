import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import WapatReport from '@/components/assessment/WapatReport';
import AssessmentResultHistory from '@/components/admin/AssessmentResultHistory';
import { computeWapat } from '@/lib/assessment/wapat';

afterEach(cleanup);

const rows = (correctIds: number[]) =>
  Array.from({ length: 35 }, (_, i) => ({ id: i + 1, answer: 'A', correct: correctIds.includes(i + 1) }));

describe('WapatReport', () => {
  it('gives each section a bar, a question range and a one-line meaning, and never claims an outside equivalence', () => {
    const ids = [...Array.from({ length: 10 }, (_, i) => i + 1), 25];
    render(<WapatReport result={computeWapat(rows(ids))} />);
    const vocab = within(screen.getByTestId('wapat-vocabulary'));
    expect(vocab.getByRole('progressbar', { name: 'Vocabulary score' })).toHaveAttribute('aria-valuenow', '100');
    expect(vocab.getByText(/Word meaning across the first 10 questions/)).toBeInTheDocument();
    const math = within(screen.getByTestId('wapat-math'));
    expect(math.getByRole('progressbar', { name: 'Math and Reasoning score' })).toHaveAttribute('aria-valuenow', '9.1');
    expect(math.getByText(/Numbers and reasoning across questions 25 to 35/)).toBeInTheDocument();
    expect(screen.queryByRole('progressbar', { name: 'WAPAT Total Score score' })).toBeNull();
    expect(screen.getByTestId('wapat-report').textContent).not.toMatch(/AMCAT|Workforce Solutions/);
  });

  it('shows the four scores with their question ranges and counts', () => {
    const ids = [...Array.from({ length: 10 }, (_, i) => i + 1), 24, 25];
    render(<WapatReport result={computeWapat(rows(ids))} />);
    expect(screen.getByRole('heading', { name: 'Workforce Advancement Project Assessment Score' })).toBeInTheDocument();
    const cell = (key: string) => within(screen.getByTestId(`wapat-${key}`));
    expect(cell('vocabulary').getByText('(Q1–10)')).toBeInTheDocument();
    expect(cell('vocabulary').getByText('10/10')).toBeInTheDocument();
    expect(cell('vocabulary').getByText('100%')).toBeInTheDocument();
    expect(cell('reading').getByText('(Q11–24)')).toBeInTheDocument();
    expect(cell('reading').getByText('1/14')).toBeInTheDocument();
    expect(cell('math').getByText('(Q25–35)')).toBeInTheDocument();
    expect(cell('math').getByText('1/11')).toBeInTheDocument();
    expect(cell('total').getByText('12/35')).toBeInTheDocument();
    expect(cell('total').getByText('34.3%')).toBeInTheDocument();
  });

  it('shows Unavailable, never 0%, when answers are incomplete', () => {
    render(<WapatReport result={computeWapat(rows([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]).slice(0, 12))} />); // Q1-12 only
    expect(within(screen.getByTestId('wapat-vocabulary')).getByText('100%')).toBeInTheDocument();
    for (const key of ['reading', 'math', 'total']) {
      const row = within(screen.getByTestId(`wapat-${key}`));
      expect(row.getByText('Unavailable')).toBeInTheDocument();
      expect(row.queryByText('0%')).toBeNull();
    }
  });

  it('keeps the report text free of inline font sizes; the kit bar sets only its own width', () => {
    const { container } = render(<WapatReport result={computeWapat(rows([1]))} />);
    const styled = [...container.querySelectorAll('[style]')];
    expect(styled.length).toBeGreaterThan(0);
    for (const node of styled) {
      expect(node.closest('[role="progressbar"]')).not.toBeNull();
      expect(node.getAttribute('style')).not.toMatch(/font-size/i);
    }
  });
});

describe('AssessmentResultHistory (WAPAT)', () => {
  it('shows WAPAT for an attempt with retained answers and "unavailable" for a legacy one', () => {
    const answers = Object.fromEntries(Array.from({ length: 35 }, (_, i) => [String(i + 1), 'Z']));
    render(<AssessmentResultHistory history={[{ scorePct: 61, completedAt: '2026-10-09T00:00:00.000Z' }, { scorePct: 70, answers }]} />);
    const items = screen.getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('WAPAT unavailable (answers not retained) · points score 61%');
    expect(items[0]).not.toHaveTextContent(/WAPAT 0%/);
    // 'Z' is not a valid letter, so that attempt is also unavailable, not 0
    expect(items[1]).toHaveTextContent('WAPAT unavailable');
  });
});
