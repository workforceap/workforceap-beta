import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { KpiStrip, kpiPhoneColumns } from '@/components/portal/kit/KpiStrip';

afterEach(cleanup);

describe('kpiPhoneColumns', () => {
  it('keeps two columns when every value is a short number or dash and labels are short', () => {
    expect(
      kpiPhoneColumns([
        { label: 'Score', value: '72 / 100' },
        { label: 'Open roles', value: 12 },
        { label: 'Keyword match', value: '64%' },
        { label: 'Saved', value: '—' },
      ]),
    ).toBe(2);
  });

  it('stacks when a short number sits under a label that would wrap to three lines', () => {
    expect(
      kpiPhoneColumns([
        { label: 'Open roles', value: 12 },
        { label: 'Active applications', value: 3 },
        { label: 'High matches (≥85%)', value: 1 },
      ]),
    ).toBe(1);
  });

  it('stacks to one column when any value is a phrase', () => {
    expect(
      kpiPhoneColumns([
        { label: 'Resume match score', value: '72 / 100' },
        { label: 'Target role', value: 'Cloud Support Associate' },
        { label: 'Mock interview', value: 'Question 2 of 5' },
        { label: 'Interview prep', value: 'Thursday 10:00 AM' },
      ]),
    ).toBe(1);
    expect(kpiPhoneColumns([{ label: 'Modules', value: '3 of 8 modules' }])).toBe(1);
    expect(kpiPhoneColumns([{ label: 'Applications', value: '12 active' }])).toBe(1);
  });
});

describe('KpiStrip phone layout class', () => {
  it('marks a phrase strip to stack and a numeric strip to pair', () => {
    const phrase = render(
      <KpiStrip
        responsive="member"
        items={[
          { label: 'Mock interview', value: 'Question 2 of 5' },
          { label: 'Interview prep', value: 'Thursday 10:00 AM' },
        ]}
      />,
    );
    expect(phrase.container.querySelector('.wa-kit-kpi-strip--stack')).not.toBeNull();
    expect(phrase.container.querySelector('.wa-kit-kpi-strip--pair')).toBeNull();
    phrase.unmount();

    const numbers = render(
      <KpiStrip
        responsive="member"
        items={[
          { label: 'Open roles', value: 4 },
          { label: 'Interviews', value: 1 },
        ]}
      />,
    );
    expect(numbers.container.querySelector('.wa-kit-kpi-strip--pair')).not.toBeNull();
    expect(numbers.container.querySelector('.wa-kit-stat-tile__value')).toHaveTextContent('4');
  });
});


describe('staff KPI compatibility', () => {
  it.each([4, 5, 6] as const)('keeps the master grid for %s columns without member opt-in', (cols) => {
    const view = render(<KpiStrip cols={cols} items={[{ label: 'Members with an enrolled program', value: 'Waiting on approval' }]} />);
    expect(view.container.firstElementChild).toHaveClass('wa-grid', 'wa-grid-cols-2', `lg:wa-grid-cols-${cols}`, 'wa-gap-3');
    expect(view.container.querySelector('.wa-kit-kpi-strip')).toBeNull();
    expect(view.getByText('Members with an enrolled program')).toBeVisible();
  });
});
