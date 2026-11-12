import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import WapatReport from '@/components/assessment/WapatReport';
import AssessmentResultHistory from '@/components/admin/AssessmentResultHistory';
import { computeWapat } from '@/lib/assessment/wapat';

afterEach(cleanup);

const rows = (correctIds: number[]) =>
  Array.from({ length: 35 }, (_, i) => ({ id: i + 1, answer: 'A', correct: correctIds.includes(i + 1) }));

describe('WapatReport', () => {
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

  it('carries no inline font-size or style attributes (kit rule)', () => {
    const { container } = render(<WapatReport result={computeWapat(rows([1]))} />);
    expect(container.querySelectorAll('[style]')).toHaveLength(0);
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
