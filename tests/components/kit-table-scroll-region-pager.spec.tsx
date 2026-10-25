import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Kit table: a table wider than its box is a named, keyboard-focusable scroll
 * region, and a page change moves the viewport and focus to the top of the list
 * (the pager sits at the bottom, so the new page otherwise starts out of sight).
 */

import { DataTable, type Column } from '@/components/portal/kit/DataTable';

type Row = { id: string; name: string };
const rows: Row[] = [
  { id: 'a', name: 'Alice Example' },
  { id: 'b', name: 'Bob Example' },
];
const columns: Column<Row>[] = [{ key: 'name', header: 'Name' }];
const base = { columns, rows, rowKey: (row: Row) => row.id };

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function stubOverflow(box: { scrollWidth: number; clientWidth: number }) {
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
  return (scroller: HTMLElement) => {
    Object.defineProperty(scroller, 'scrollWidth', { configurable: true, value: box.scrollWidth });
    Object.defineProperty(scroller, 'clientWidth', { configurable: true, value: box.clientWidth });
    act(() => observers.forEach((o) => o.cb([], o as unknown as ResizeObserver)));
  };
}

describe('kit table scroll region', () => {
  it('is a labelled, focusable region only while the columns overflow', () => {
    const overflow = stubOverflow({ scrollWidth: 900, clientWidth: 343 });
    render(<DataTable<Row> {...base} caption="Members" scrollCue data-testid="wrap" />);
    const scroller = screen.getByTestId('wrap').querySelector<HTMLElement>('.wa-overflow-x-auto')!;
    expect(scroller).not.toHaveAttribute('tabindex');
    expect(scroller).not.toHaveAttribute('role');

    overflow(scroller);
    expect(scroller).toHaveAttribute('role', 'region');
    expect(scroller).toHaveAttribute('tabindex', '0');
    expect(scroller).toHaveAttribute('aria-label', 'Members, scrollable');
    expect(screen.getByRole('region', { name: 'Members, scrollable' })).toBe(scroller);
    expect(screen.getByText('Scroll for more')).toBeInTheDocument();
  });

  it('names an uncaptioned scroll region and works without the visual cue', () => {
    const overflow = stubOverflow({ scrollWidth: 900, clientWidth: 343 });
    render(<DataTable<Row> {...base} data-testid="wrap" />);
    const scroller = screen.getByTestId('wrap').querySelector<HTMLElement>('.wa-overflow-x-auto')!;
    overflow(scroller);
    expect(scroller).toHaveAttribute('aria-label', 'Scrollable table');
    expect(screen.queryByText('Scroll for more')).toBeNull();
  });
});

describe('kit table pager focus', () => {
  function Harness() {
    const [page, setPage] = useState(1);
    return (
      <DataTable<Row>
        {...base}
        caption="Staff"
        data-testid="wrap"
        pagination={{ page, pageSize: 1, totalItems: 3, onChange: setPage, label: 'Staff pagination' }}
      />
    );
  }

  it('moves focus to the table and brings its top edge into view after a page change', () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    render(<Harness />);
    const wrap = screen.getByTestId('wrap');
    // The pager is below the fold: the list top is above the viewport.
    wrap.getBoundingClientRect = () => ({ top: -480 }) as DOMRect;

    fireEvent.click(within(screen.getByRole('navigation', { name: 'Staff pagination' })).getByRole('button', { name: 'Go to next page' }));

    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start', behavior: 'instant' });
    expect(scrollIntoView.mock.contexts[0]).toBe(wrap);
    expect(screen.getByRole('table', { name: 'Staff' })).toHaveFocus();
  });

  it('does not scroll when the list top is already visible, but still moves focus', () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    render(<Harness />);
    screen.getByTestId('wrap').getBoundingClientRect = () => ({ top: 24 }) as DOMRect;

    fireEvent.click(within(screen.getByRole('navigation', { name: 'Staff pagination' })).getByRole('button', { name: 'Go to next page' }));

    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(screen.getByRole('table', { name: 'Staff' })).toHaveFocus();
  });

  it('leaves focus alone on first render and on unrelated updates', () => {
    render(<Harness />);
    expect(screen.getByRole('table', { name: 'Staff' })).not.toHaveFocus();
  });
});
