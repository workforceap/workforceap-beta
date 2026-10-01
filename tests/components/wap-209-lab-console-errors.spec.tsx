import { cleanup, render } from '@testing-library/react';
import { isValidElement, type ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * WAP-209 (phone QA): two dev-lab console errors that broke QA runs.
 *
 *   - /dev/member/jobs logged React's "Each child in a list should have a
 *     unique key" from the server. DataTable renders on the server and handed
 *     KitTableShell (a client component) an array of unkeyed cell elements
 *     per row; a server-component cell such as StatusTag in that array is what
 *     React warns about. Each cell is now keyed by its column.
 *   - /dev/astryx/table put TableRow straight inside Table ("<tr> cannot be a
 *     child of <table>", a hydration error). The rows now sit in TableBody.
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/dev/astryx/table',
  useSearchParams: () => new URLSearchParams(),
}));

import { DataTable, type Column } from '@/components/portal/kit/DataTable';
import { StatusTag } from '@/components/portal/kit';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

type Row = { id: string; role: string; stage: string };
const rows: Row[] = [
  { id: 'a1', role: 'Salesforce Administrator', stage: 'Interviewing' },
  { id: 'a2', role: 'Cloud Support Associate', stage: 'Applied' },
];
const columns: Column<Row>[] = [
  { key: 'role', header: 'Role', render: (r) => <span>{r.role}</span> },
  { key: 'stage', header: 'Stage', render: (r) => <StatusTag tone="muted">{r.stage}</StatusTag> },
];

describe('DataTable cell keys (WAP-209)', () => {
  it('hands KitTableShell one keyed element per cell, keyed by column', () => {
    // Called as a function, the way the server renders it: the returned element is the KitTableShell.
    const shell = DataTable<Row>({ columns, rows, rowKey: (r) => r.id, mobile: 'scroll' }) as ReactElement<{
      rows: Array<{ key: string; cells: unknown[] }>;
    }>;
    expect(shell.props.rows).toHaveLength(2);
    for (const row of shell.props.rows) {
      expect(row.cells).toHaveLength(2);
      expect(row.cells.map((cell) => (isValidElement(cell) ? cell.key : 'not-an-element'))).toEqual(['role', 'stage']);
    }
  });

  it('still renders the same cells', () => {
    const { container } = render(<DataTable<Row> columns={columns} rows={rows} rowKey={(r) => r.id} mobile="scroll" />);
    const cells = [...container.querySelectorAll('tbody tr')].map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent));
    expect(cells).toEqual([
      ['Salesforce Administrator', 'Interviewing'],
      ['Cloud Support Associate', 'Applied'],
    ]);
  });
});

describe('/dev/astryx/table DOM nesting (WAP-209)', () => {
  it('renders every row inside a <tbody>, with no nesting error', async () => {
    const errors: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      errors.push(args.map(String).join(' '));
    });
    const { default: DataTableTemplate } = await import('@/app/dev/astryx/table/page');
    const { container } = render(<DataTableTemplate />);
    const trs = [...container.querySelectorAll('table tr')];
    expect(trs.length).toBeGreaterThan(0);
    for (const tr of trs) expect(tr.parentElement?.tagName).toMatch(/^(TBODY|THEAD|TFOOT)$/);
    expect(errors.filter((e) => /cannot be a child of|hydration/i.test(e))).toEqual([]);
  });
});
