import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Kit `DataTable` / `KitTableShell` table standard (docs/KIT_GUIDE.md §6a):
 * every new behaviour is an opt-in prop, so a bare table renders as before,
 * and each prop produces the DOM contract staff pages and specs rely on.
 */

import { DataTable, type Column } from '@/components/portal/kit/DataTable';
import AdminDataLoadError from '@/components/admin/AdminDataLoadError';

type Row = { id: string; name: string; email: string; issues: number };

const rows: Row[] = [
  { id: 'a', name: 'Alice Example', email: 'alice@example.test', issues: 2 },
  { id: 'b', name: 'Bob Example', email: 'bob@example.test', issues: 0 },
  { id: 'c', name: 'Cara Example', email: 'cara@example.test', issues: 1 },
];

const columns: Column<Row>[] = [
  { key: 'name', header: 'Name', stickyLeft: true },
  { key: 'email', header: 'Email' },
  { key: 'issues', header: 'Issues', align: 'right' },
];

const base = { columns, rows, rowKey: (row: Row) => row.id, rowLabel: (row: Row) => row.name };

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('kit DataTable — default render is unchanged', () => {
  it('renders plain table chrome with no controls, pager, bar or notice', () => {
    const { container } = render(<DataTable<Row> {...base} data-testid="plain" />);
    const wrap = screen.getByTestId('plain');
    expect(wrap.className).toBe('wa-kit-table-wrap');
    expect(wrap).not.toHaveAttribute('aria-busy');
    expect(screen.getAllByRole('columnheader')).toHaveLength(3);
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('navigation')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('region')).toBeNull();
    expect(container.querySelector('.wa-kit-table-th--sticky')).toBeNull();
    expect(screen.getByRole('columnheader', { name: 'Name' })).toHaveClass('wa-kit-table-sticky-left');
    expect(screen.getAllByRole('row')).toHaveLength(4);
  });
});

describe('kit DataTable — sticky header', () => {
  it('marks every header cell sticky and gives the body a scroll height', () => {
    render(<DataTable<Row> {...base} stickyHeader stickyMaxHeight={320} data-testid="sticky" />);
    const wrap = screen.getByTestId('sticky');
    expect(wrap).toHaveClass('wa-kit-table-wrap', 'wa-kit-table-wrap--sticky');
    for (const th of screen.getAllByRole('columnheader')) expect(th).toHaveClass('wa-kit-table-th--sticky');
    expect(wrap.querySelector('.wa-overflow-x-auto')).toHaveStyle({ maxHeight: '320px', overflowY: 'auto' });
  });
});

describe('kit DataTable — selection and bulk bar', () => {
  it('selects rows by key, shows the bulk bar with a count and clears it', () => {
    const onSelectionChange = vi.fn();
    const bulkBar = vi.fn(({ selectedKeys }: { selectedKeys: string[] }) => <button type="button">Email {selectedKeys.length}</button>);
    render(<DataTable<Row> {...base} selectable onSelectionChange={onSelectionChange} bulkBar={bulkBar} />);

    expect(screen.queryByRole('region', { name: 'Bulk actions' })).toBeNull();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Alice Example' }));
    expect(onSelectionChange).toHaveBeenLastCalledWith(['a']);
    const bar = screen.getByRole('region', { name: 'Bulk actions' });
    expect(within(bar).getByRole('status')).toHaveTextContent('1 selected');
    expect(within(bar).getByRole('button', { name: 'Email 1' })).toBeInTheDocument();
    expect(bulkBar).toHaveBeenLastCalledWith(expect.objectContaining({ selectedKeys: ['a'] }));
    expect(screen.getByRole('checkbox', { name: 'Select Alice Example' }).closest('tr')).toHaveClass('wa-kit-table-row--selected');

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all rows on this page' }));
    expect(onSelectionChange).toHaveBeenLastCalledWith(['a', 'b', 'c']);
    expect(within(screen.getByRole('region', { name: 'Bulk actions' })).getByRole('status')).toHaveTextContent('3 selected');

    fireEvent.click(within(screen.getByRole('region', { name: 'Bulk actions' })).getByRole('button', { name: 'Clear' }));
    expect(onSelectionChange).toHaveBeenLastCalledWith([]);
    expect(screen.queryByRole('region', { name: 'Bulk actions' })).toBeNull();
    expect(screen.getByRole('checkbox', { name: 'Select all rows on this page' })).not.toBeChecked();
  });

  it('does not fire the row click when the checkbox is toggled', () => {
    const onRowClick = vi.fn();
    render(<DataTable<Row> {...base} selectable onRowClick={onRowClick} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Bob Example' }));
    expect(onRowClick).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('bob@example.test'));
    expect(onRowClick).toHaveBeenCalledWith(rows[1]);
  });

  it('honours a controlled selection', () => {
    const onSelectionChange = vi.fn();
    render(<DataTable<Row> {...base} selectable selectedKeys={['c']} onSelectionChange={onSelectionChange} bulkBar={() => null} />);
    expect(screen.getByRole('checkbox', { name: 'Select Cara Example' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Select Alice Example' })).not.toBeChecked();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Alice Example' }));
    expect(onSelectionChange).toHaveBeenCalledWith(['c', 'a']);
    // Controlled: the parent decides, the checkbox does not flip on its own.
    expect(screen.getByRole('checkbox', { name: 'Select Alice Example' })).not.toBeChecked();
  });
});

describe('kit DataTable — pagination footer', () => {
  it('renders the pager only when there is more than one page and reports the next page', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <DataTable<Row> {...base} pagination={{ page: 1, pageSize: 50, totalItems: 120, onChange, label: 'Staff pagination' }} />,
    );
    const nav = screen.getByRole('navigation', { name: 'Staff pagination' });
    fireEvent.click(within(nav).getByRole('button', { name: 'Go to next page' }));
    expect(onChange).toHaveBeenCalledWith(2);

    rerender(<DataTable<Row> {...base} pagination={{ page: 1, pageSize: 50, totalItems: 3, onChange }} />);
    expect(screen.queryByRole('navigation')).toBeNull();
  });

  it('keeps the pager under the stacked cards on phones', () => {
    render(
      <DataTable<Row>
        {...base}
        mobile="cards"
        cardRender={(row) => <p>{row.name}</p>}
        pagination={{ page: 2, pageSize: 1, totalItems: 3, onChange: vi.fn(), label: 'Cards pagination' }}
      />,
    );
    // One pager for the table branch, one for the cards branch.
    expect(screen.getAllByRole('navigation', { name: 'Cards pagination' })).toHaveLength(2);
  });
});

describe('kit DataTable — sub-rows', () => {
  it('adds a toggle only for rows with details and expands them in place', () => {
    render(
      <DataTable<Row>
        {...base}
        renderSubRow={(row) => (row.issues > 0 ? <p>{row.name} has {row.issues} issues</p> : null)}
      />,
    );
    expect(screen.getAllByRole('columnheader')).toHaveLength(4);
    expect(screen.queryByRole('button', { name: 'Show details for Bob Example' })).toBeNull();
    const toggle = screen.getByRole('button', { name: 'Show details for Alice Example' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Alice Example has 2 issues')).toBeNull();

    fireEvent.click(toggle);
    const opened = screen.getByRole('button', { name: 'Hide details for Alice Example' });
    expect(opened).toHaveAttribute('aria-expanded', 'true');
    const detail = screen.getByText('Alice Example has 2 issues');
    expect(detail.closest('tr')).toHaveClass('wa-kit-table-subrow');
    expect(detail.closest('tr')).toHaveAttribute('id', opened.getAttribute('aria-controls'));
    expect(detail.closest('td')).toHaveAttribute('colspan', '4');

    fireEvent.click(opened);
    expect(screen.queryByText('Alice Example has 2 issues')).toBeNull();
  });

  it('does not fire the row click when the toggle is pressed', () => {
    const onRowClick = vi.fn();
    render(<DataTable<Row> {...base} onRowClick={onRowClick} renderSubRow={() => <p>detail</p>} />);
    fireEvent.click(screen.getByRole('button', { name: 'Show details for Cara Example' }));
    expect(onRowClick).not.toHaveBeenCalled();
  });
});

describe('kit DataTable — loading, error notice, scroll cue', () => {
  it('sets aria-busy and draws skeleton rows while the first page loads', () => {
    const { container, rerender } = render(<DataTable<Row> {...base} rows={[]} loading loadingRows={3} data-testid="loading" />);
    expect(screen.getByTestId('loading')).toHaveAttribute('aria-busy', 'true');
    expect(container.querySelectorAll('tr.wa-kit-table-skeleton-row')).toHaveLength(3);
    expect(container.querySelector('tr.wa-kit-table-skeleton-row')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByRole('heading', { name: 'No rows yet' })).toBeNull();

    rerender(<DataTable<Row> {...base} loading data-testid="loading" />);
    expect(screen.getByTestId('loading')).toHaveAttribute('aria-busy', 'true');
    expect(container.querySelectorAll('tr.wa-kit-table-skeleton-row')).toHaveLength(0);
    expect(screen.getByText('alice@example.test')).toBeInTheDocument();

    rerender(<DataTable<Row> {...base} rows={[]} data-testid="loading" />);
    expect(screen.getByTestId('loading')).not.toHaveAttribute('aria-busy');
    expect(screen.getByRole('heading', { name: 'No rows yet' })).toBeInTheDocument();
  });

  it('shows the error notice as an alert above the rows without hiding them', () => {
    render(<DataTable<Row> {...base} errorNotice="Counselor names could not be loaded." data-testid="notice" />);
    // Scoped to the table: Astryx controls keep a body-level live region alive between tests.
    expect(within(screen.getByTestId('notice')).getByRole('alert')).toHaveTextContent('Counselor names could not be loaded.');
    expect(screen.getByText('alice@example.test')).toBeInTheDocument();
  });

  it('announces "Scroll for more" only while columns overflow the box', () => {
    const observers: Array<{ cb: ResizeObserverCallback }> = [];
    class FakeResizeObserver {
      cb: ResizeObserverCallback;
      constructor(cb: ResizeObserverCallback) {
        this.cb = cb;
        observers.push(this);
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);

    render(<DataTable<Row> {...base} scrollCue data-testid="cue" />);
    const wrap = screen.getByTestId('cue');
    expect(wrap).toHaveClass('wa-kit-table-wrap--cue');
    expect(wrap).toHaveAttribute('data-scrollable', 'false');
    expect(screen.queryByText('Scroll for more')).toBeNull();

    const scroller = wrap.querySelector<HTMLDivElement>('.wa-overflow-x-auto')!;
    Object.defineProperty(scroller, 'scrollWidth', { configurable: true, value: 1200 });
    Object.defineProperty(scroller, 'clientWidth', { configurable: true, value: 800 });
    act(() => observers.forEach((o) => o.cb([], o as unknown as ResizeObserver)));
    expect(wrap).toHaveAttribute('data-scrollable', 'true');
    expect(wrap).toHaveAttribute('data-scroll-end', 'false');
    expect(screen.getByText('Scroll for more')).toBeInTheDocument();

    Object.defineProperty(scroller, 'scrollLeft', { configurable: true, value: 400 });
    fireEvent.scroll(scroller);
    expect(wrap).toHaveAttribute('data-scroll-end', 'true');
    expect(screen.queryByText('Scroll for more')).toBeNull();
  });
});

describe('AdminDataLoadError on kit classes', () => {
  it('is an alert card with one h1 and two real next steps', () => {
    const { container } = render(<AdminDataLoadError title="Roster unavailable" message="Try again shortly." />);
    const card = within(container).getByRole('alert');
    expect(card).toHaveAttribute('data-portal-error-state', 'admin-data-load');
    expect(card).toHaveClass('wa-kit-card', 'wa-kit-load-error');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Roster unavailable');
    expect(screen.getByText('Try again shortly.')).toHaveClass('wa-kit-lede');
    expect(screen.getByRole('link', { name: 'Admin home' })).toHaveAttribute('href', '/admin');
    expect(screen.getByRole('link', { name: 'Admin home' })).toHaveClass('wa-kit-cta');
    expect(screen.getByRole('link', { name: 'Jobs' })).toHaveAttribute('href', '/admin/jobs');
    expect(card.querySelector('.btn')).toBeNull();
    expect(card.innerHTML).not.toContain('--color-');
  });
});
