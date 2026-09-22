import type { ReactNode } from 'react';
import { type KitBaseProps, type KitDataAttrs } from './base';
import { KitEmptyState } from './KitEmptyState';
import {
  KitTablePager,
  KitTableShell,
  type KitTableBulkBarContext,
  type KitTablePagination,
} from './KitTableShell';

export type { KitTableBulkBarContext, KitTablePagination };

export interface Column<T> {
  /** Stable key for React. */
  key: string;
  header: ReactNode;
  /** Cell renderer; defaults to String(row[key]) when omitted. */
  render?: (row: T) => ReactNode;
  align?: 'left' | 'right';
  /** Numeric column: right-aligned tabular numerals (`.wa-kit-table-cell--num`, guide §6a). */
  numeric?: boolean;
  /** Pin this column while the table scrolls sideways (the first column, usually). */
  stickyLeft?: boolean;
  minWidth?: number | string;
  ariaSort?: 'ascending' | 'descending' | 'none';
}

interface DataTableProps<T> extends KitBaseProps<HTMLDivElement>, KitDataAttrs {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /**
   * Mobile strategy:
   *  - 'cards'  → below lg, render `cardRender(row)` as a stacked card (no squish)
   *  - 'scroll' → keep the table, allow horizontal scroll
   */
  mobile?: 'cards' | 'scroll';
  cardRender?: (row: T) => ReactNode;
  minWidth?: number;
  onRowClick?: (row: T) => void;
  emptyTitle?: string;
  emptyDescription?: string;
  /** Override surface-driven density. */
  density?: 'compact' | 'balanced' | 'spacious';
  /** Pin the header row while the body scrolls inside `stickyMaxHeight`. */
  stickyHeader?: boolean;
  stickyMaxHeight?: number | string;
  /** Leading checkbox column keyed by `rowKey`. */
  selectable?: boolean;
  selectedKeys?: string[];
  onSelectionChange?: (keys: string[]) => void;
  /** Rendered above the table while at least one row is selected. */
  bulkBar?: (ctx: KitTableBulkBarContext) => ReactNode;
  /** Footer pager (Astryx `Pagination`), shown when `totalItems > pageSize`. */
  pagination?: KitTablePagination;
  /** Full-width detail row under a row; `null` for rows without one. */
  renderSubRow?: (row: T) => ReactNode | null | undefined;
  /** Name used in the row's select / expand control labels. */
  rowLabel?: (row: T) => string;
  /** Edge fade + "Scroll for more" when the table overflows sideways. */
  scrollCue?: boolean;
  /** `aria-busy` plus skeleton rows while the first page loads. */
  loading?: boolean;
  loadingRows?: number;
  /** Soft-failure notice above the rows (partial load, stale feed). */
  errorNotice?: ReactNode;
}

/**
 * Dense roster table — native `.wa-kit-table` chrome via `KitTableShell`
 * (pre-rendered cells keep server `render` columns RSC-safe). Mobile: scroll
 * or stacked cards. Row density is surface-driven (see KitTableShell). The
 * table standard (columns, density, states) is in docs/KIT_GUIDE.md §6a.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  mobile = 'scroll',
  cardRender,
  minWidth = 600,
  onRowClick,
  emptyTitle = 'No rows yet',
  emptyDescription,
  density,
  stickyHeader,
  stickyMaxHeight,
  selectable,
  selectedKeys,
  onSelectionChange,
  bulkBar,
  pagination,
  renderSubRow,
  rowLabel,
  scrollCue,
  loading,
  loadingRows,
  errorNotice,
  className,
  style,
  ref,
  ...rest
}: DataTableProps<T>) {
  const cell = (col: Column<T>, row: T): ReactNode =>
    col.render ? col.render(row) : String((row as Record<string, unknown>)[col.key] ?? '');

  const shellColumns = columns.map((c) => ({
    key: c.key,
    header: c.header,
    align: c.align,
    numeric: c.numeric,
    stickyLeft: c.stickyLeft,
    minWidth: c.minWidth,
    ariaSort: c.ariaSort,
  }));
  const shellRows = rows.map((row) => ({
    key: rowKey(row),
    cells: columns.map((c) => cell(c, row)),
    subRow: renderSubRow ? renderSubRow(row) : undefined,
    label: rowLabel ? rowLabel(row) : undefined,
  }));

  const onRowKeyClick = onRowClick
    ? (key: string) => {
        const row = rows.find((r) => rowKey(r) === key);
        if (row) onRowClick(row);
      }
    : undefined;

  const single = mobile === 'scroll' || !cardRender;

  const tableEl = (
    <KitTableShell
      columns={shellColumns}
      rows={shellRows}
      minWidth={minWidth}
      emptyTitle={emptyTitle}
      emptyDescription={emptyDescription}
      onRowKeyClick={onRowKeyClick}
      density={density}
      stickyHeader={stickyHeader}
      stickyMaxHeight={stickyMaxHeight}
      selectable={selectable}
      selectedKeys={selectedKeys}
      onSelectionChange={onSelectionChange}
      bulkBar={bulkBar}
      pagination={pagination}
      scrollCue={scrollCue}
      loading={loading}
      loadingRows={loadingRows}
      errorNotice={errorNotice}
      ref={single ? ref : undefined}
      className={single ? className : 'wa-kit-table-wrap'}
      style={single ? style : undefined}
      {...(single ? rest : {})}
    />
  );

  if (single || !cardRender) {
    return tableEl;
  }

  return (
    <div ref={ref} className={className} style={style} {...rest}>
      <div className="wa-hidden lg:wa-block">{tableEl}</div>
      <div className="lg:wa-hidden wa-space-y-2" aria-busy={loading || undefined}>
        {errorNotice ? (
          <div className="wa-kit-table-notice" role="alert">
            {errorNotice}
          </div>
        ) : null}
        {rows.length === 0 ? (
          <KitEmptyState title={emptyTitle} description={emptyDescription} />
        ) : (
          rows.map((row) => (
            <div
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              onKeyDown={
                onRowClick
                  ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onRowClick(row);
                      }
                    }
                  : undefined
              }
              role={onRowClick ? 'button' : undefined}
              tabIndex={onRowClick ? 0 : undefined}
              className={onRowClick ? 'wa-kit-focus' : undefined}
              style={onRowClick ? { cursor: 'pointer' } : undefined}
            >
              {cardRender(row)}
            </div>
          ))
        )}
        {pagination ? <KitTablePager pagination={pagination} className="wa-kit-table-footer--cards" /> : null}
      </div>
    </div>
  );
}
