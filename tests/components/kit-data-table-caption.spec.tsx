import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DataTable } from '@/components/portal/kit';

afterEach(cleanup);

type Row = { name: string; score: string };
const rows: Row[] = [{ name: 'Analytics', score: '72%' }, { name: 'Design', score: '38%' }];

describe('kit DataTable caption and row headers', () => {
  it('names the table with a visually hidden caption and announces the row header with each value', () => {
    render(
      <DataTable
        caption="Occupation radar values"
        columns={[{ key: 'name', header: 'Competency', rowHeader: true }, { key: 'score', header: 'Target', numeric: true }]}
        rows={rows}
        rowKey={row => row.name}
      />,
    );
    const table = screen.getByRole('table', { name: 'Occupation radar values' });
    expect(table.querySelector('caption')).toHaveClass('wa-sr-only');
    expect(within(table).getAllByRole('columnheader').map(header => header.textContent)).toEqual(['Competency', 'Target']);
    const analytics = within(table).getByRole('rowheader', { name: 'Analytics' });
    expect(analytics.tagName).toBe('TH');
    expect(analytics).toHaveAttribute('scope', 'row');
    expect(within(analytics.closest('tr')!).getAllByRole('cell').map(cell => cell.textContent)).toEqual(['72%']);
  });

  it('keeps plain data cells and an unnamed table when neither option is used', () => {
    render(
      <DataTable
        columns={[{ key: 'name', header: 'Competency' }, { key: 'score', header: 'Target' }]}
        rows={rows}
        rowKey={row => row.name}
      />,
    );
    const table = screen.getByRole('table');
    expect(table.querySelector('caption')).toBeNull();
    expect(within(table).queryAllByRole('rowheader')).toHaveLength(0);
    expect(within(table).getAllByRole('cell').map(cell => cell.textContent)).toEqual(['Analytics', '72%', 'Design', '38%']);
    expect(table.querySelectorAll('tbody th')).toHaveLength(0);
  });
});
