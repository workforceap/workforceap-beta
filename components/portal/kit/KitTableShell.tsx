'use client';

import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type ReactNode, type Ref } from 'react';
import { ChevronDown } from 'lucide-react';
import { Pagination } from '@astryxdesign/core/Pagination';
import { cx, type KitDataAttrs } from './base';
import { KitEmptyState } from './KitEmptyState';

export type KitTableShellColumn = {
  key: string;
  header: ReactNode;
  align?: 'left' | 'right';
  /** Numeric column: right-aligned tabular numerals via `.wa-kit-table-cell--num`. */
  numeric?: boolean;
  /** Pin column on horizontal scroll (typically the row label). */
  stickyLeft?: boolean;
  /** Minimum width for this column so badges/tokens are not clipped. */
  minWidth?: number | string;
  ariaSort?: 'ascending' | 'descending' | 'none';
};

export type KitTableShellRow = {
  key: string;
  cells: ReactNode[];
  /** Pre-rendered detail row; when present the row gets an expand toggle. */
  subRow?: ReactNode | null;
  /** Human label used in the row's select / expand control names. */
  label?: string;
};

export type KitTablePagination = {
  page: number;
  pageSize: number;
  totalItems: number;
  onChange: (page: number) => void;
  label?: string;
  isDisabled?: boolean;
};

export type KitTableBulkBarContext = {
  selectedKeys: string[];
  clear: () => void;
};

interface KitTableShellProps extends KitDataAttrs {
  columns: KitTableShellColumn[];
  rows: KitTableShellRow[];
  minWidth?: number;
  emptyTitle: string;
  emptyDescription?: string;
  onRowKeyClick?: (key: string) => void;
  /** Override surface-driven density. Warm → balanced, dense → compact. */
  density?: 'compact' | 'balanced' | 'spacious';
  /** Pin the header row while the body scrolls inside `stickyMaxHeight`. */
  stickyHeader?: boolean;
  /** Body scroll height used with `stickyHeader`. Default `70vh`. */
  stickyMaxHeight?: number | string;
  /** Leading checkbox column; selection is keyed by `row.key`. */
  selectable?: boolean;
  /** Controlled selection. Omit for internal state. */
  selectedKeys?: string[];
  onSelectionChange?: (keys: string[]) => void;
  /** Rendered above the table while at least one row is selected. */
  bulkBar?: (ctx: KitTableBulkBarContext) => ReactNode;
  /** Footer pager; rendered only when `totalItems > pageSize`. */
  pagination?: KitTablePagination;
  /** Edge fade + "Scroll for more" when the table is wider than its box. */
  scrollCue?: boolean;
  /** `aria-busy` plus skeleton rows while the first page loads. */
  loading?: boolean;
  /** Skeleton rows drawn while `loading` and there are no rows yet. */
  loadingRows?: number;
  /** Soft-failure notice shown above the rows (a partial load, a stale feed). */
  errorNotice?: ReactNode;
  className?: string;
  style?: CSSProperties;
  ref?: Ref<HTMLDivElement>;
}

function nextSelection(current: string[], key: string, checked: boolean): string[] {
  if (checked) return current.includes(key) ? current : [...current, key];
  return current.filter((k) => k !== key);
}

/**
 * Native table chrome for kit DataTable — `.wa-kit-table` on `--wa-*`.
 * Accepts pre-rendered cell ReactNodes from server parents so column `render`
 * functions stay RSC-safe. Density follows the nearest DesignSurface via
 * `[data-surface]`; pass `density` to override. Every extra behaviour
 * (sticky header, selection, pager, sub-rows, scroll cue, loading, notice)
 * is opt-in and leaves the default render unchanged.
 */
export function KitTableShell({
  columns,
  rows,
  minWidth = 600,
  emptyTitle,
  emptyDescription,
  onRowKeyClick,
  density,
  stickyHeader = false,
  stickyMaxHeight = '70vh',
  selectable = false,
  selectedKeys,
  onSelectionChange,
  bulkBar,
  pagination,
  scrollCue = false,
  loading = false,
  loadingRows = 5,
  errorNotice,
  className,
  style,
  ref,
  ...rest
}: KitTableShellProps) {
  const clickable = Boolean(onRowKeyClick);
  const shellId = useId();

  // --- selection -----------------------------------------------------------
  const [internalSelected, setInternalSelected] = useState<string[]>([]);
  const selected = selectedKeys ?? internalSelected;
  const setSelected = useCallback(
    (keys: string[]) => {
      if (selectedKeys === undefined) setInternalSelected(keys);
      onSelectionChange?.(keys);
    },
    [selectedKeys, onSelectionChange],
  );
  const rowKeys = rows.map((r) => r.key);
  const selectedOnPage = selected.filter((k) => rowKeys.includes(k));
  const allOnPageSelected = rows.length > 0 && selectedOnPage.length === rows.length;
  const someOnPageSelected = selectedOnPage.length > 0 && !allOnPageSelected;
  const selectAllRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someOnPageSelected;
  }, [someOnPageSelected]);
  const clearSelection = useCallback(() => setSelected([]), [setSelected]);

  // --- sub-rows ------------------------------------------------------------
  const hasSubRows = rows.some((r) => r.subRow != null);
  const [expanded, setExpanded] = useState<string[]>([]);
  const toggleExpanded = (key: string) =>
    setExpanded((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  // --- scroll cue ----------------------------------------------------------
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [scrollable, setScrollable] = useState(false);
  const [atEnd, setAtEnd] = useState(false);
  useEffect(() => {
    if (!scrollCue) return;
    const el = scrollerRef.current;
    if (!el) return;
    const measure = () => {
      const overflow = el.scrollWidth - el.clientWidth > 1;
      setScrollable(overflow);
      setAtEnd(!overflow || el.scrollLeft + el.clientWidth >= el.scrollWidth - 1);
    };
    measure();
    el.addEventListener('scroll', measure, { passive: true });
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    observer?.observe(el);
    return () => {
      el.removeEventListener('scroll', measure);
      observer?.disconnect();
    };
  }, [scrollCue, rows.length, columns.length]);

  const leadingColumns = (selectable ? 1 : 0) + (hasSubRows ? 1 : 0);
  const colSpan = columns.length + leadingColumns || 1;
  const showPager = pagination != null && pagination.totalItems > pagination.pageSize;
  const showSkeleton = loading && rows.length === 0;
  const showCue = scrollCue && scrollable && !atEnd;

  const cellStyle = (c: KitTableShellColumn): CSSProperties | undefined => ({
    ...(c.align === 'right' || c.numeric ? { textAlign: 'right' } : undefined),
    ...(c.minWidth != null ? { minWidth: c.minWidth } : undefined),
  });

  return (
    <div
      ref={ref}
      className={cx(
        'wa-kit-table-wrap',
        stickyHeader && 'wa-kit-table-wrap--sticky',
        scrollCue && 'wa-kit-table-wrap--cue',
        className,
      )}
      style={style}
      aria-busy={loading || undefined}
      data-scrollable={scrollCue ? String(scrollable) : undefined}
      data-scroll-end={scrollCue && scrollable ? String(atEnd) : undefined}
      {...rest}
    >
      {bulkBar && selected.length > 0 ? (
        <div className="wa-kit-table-bulk" role="region" aria-label="Bulk actions">
          <span className="wa-kit-table-bulk__count" role="status">
            {selected.length} selected
          </span>
          <div className="wa-kit-table-bulk__actions">{bulkBar({ selectedKeys: selected, clear: clearSelection })}</div>
          <button type="button" className="wa-kit-table-bulk__clear wa-kit-focus" onClick={clearSelection}>
            Clear
          </button>
        </div>
      ) : null}
      {errorNotice ? (
        <div className="wa-kit-table-notice" role="alert">
          {errorNotice}
        </div>
      ) : null}
      <div
        ref={scrollerRef}
        className="wa-overflow-x-auto"
        style={stickyHeader ? { maxHeight: stickyMaxHeight, overflowY: 'auto' } : undefined}
      >
        <table
          className={cx('wa-kit-table', clickable && 'wa-kit-table--clickable')}
          data-density={density}
          style={{ minWidth }}
        >
          <thead>
            <tr>
              {selectable ? (
                <th scope="col" className={cx('wa-kit-table-select', stickyHeader && 'wa-kit-table-th--sticky')}>
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    className="wa-kit-table-checkbox wa-kit-focus"
                    aria-label="Select all rows on this page"
                    checked={allOnPageSelected}
                    disabled={rows.length === 0}
                    onChange={(e) => {
                      const others = selected.filter((k) => !rowKeys.includes(k));
                      setSelected(e.target.checked ? [...others, ...rowKeys] : others);
                    }}
                  />
                </th>
              ) : null}
              {hasSubRows ? (
                <th scope="col" className={cx('wa-kit-table-expand', stickyHeader && 'wa-kit-table-th--sticky')}>
                  <span className="wa-sr-only">Details</span>
                </th>
              ) : null}
              {columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  aria-sort={c.ariaSort}
                  className={cx(c.stickyLeft && 'wa-kit-table-sticky-left', c.numeric && 'wa-kit-table-cell--num', stickyHeader && 'wa-kit-table-th--sticky')}
                  style={cellStyle(c)}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {showSkeleton ? (
              Array.from({ length: loadingRows }, (_, i) => (
                <tr key={`skeleton-${i}`} className="wa-kit-table-skeleton-row" aria-hidden="true">
                  {Array.from({ length: colSpan }, (_, j) => (
                    <td key={j}>
                      <span className="wa-kit-table-skeleton" />
                    </td>
                  ))}
                </tr>
              ))
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={colSpan}>
                  <KitEmptyState title={emptyTitle} description={emptyDescription} />
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const isSelected = selected.includes(row.key);
                const isExpanded = expanded.includes(row.key);
                const subRowId = `${shellId}-sub-${row.key}`;
                const rowLabel = row.label ?? `row ${row.key}`;
                return [
                  <tr
                    key={row.key}
                    onClick={clickable ? () => onRowKeyClick?.(row.key) : undefined}
                    onKeyDown={
                      clickable
                        ? (e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              onRowKeyClick?.(row.key);
                            }
                          }
                        : undefined
                    }
                    role={clickable ? 'button' : undefined}
                    tabIndex={clickable ? 0 : undefined}
                    className={cx(clickable && 'wa-kit-focus', isSelected && 'wa-kit-table-row--selected')}
                    // `aria-selected` is not permitted on role="button"; clickable rows
                    // keep the selected state on the class and the checkbox only.
                    aria-selected={selectable && !clickable ? isSelected : undefined}
                    data-selected={selectable ? String(isSelected) : undefined}
                  >
                    {selectable ? (
                      <td className="wa-kit-table-select" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          className="wa-kit-table-checkbox wa-kit-focus"
                          aria-label={`Select ${rowLabel}`}
                          checked={isSelected}
                          onChange={(e) => setSelected(nextSelection(selected, row.key, e.target.checked))}
                        />
                      </td>
                    ) : null}
                    {hasSubRows ? (
                      <td className="wa-kit-table-expand" onClick={(e) => e.stopPropagation()}>
                        {row.subRow != null ? (
                          <button
                            type="button"
                            className="wa-kit-table-expand__button wa-kit-focus"
                            aria-expanded={isExpanded}
                            aria-controls={subRowId}
                            aria-label={`${isExpanded ? 'Hide' : 'Show'} details for ${rowLabel}`}
                            onClick={() => toggleExpanded(row.key)}
                          >
                            <ChevronDown size={16} aria-hidden />
                          </button>
                        ) : null}
                      </td>
                    ) : null}
                    {columns.map((c, i) => (
                      <td key={c.key} className={cx(c.stickyLeft && 'wa-kit-table-sticky-left', c.numeric && 'wa-kit-table-cell--num')} style={cellStyle(c)}>
                        {row.cells[i]}
                      </td>
                    ))}
                  </tr>,
                  row.subRow != null && isExpanded ? (
                    <tr key={`${row.key}-sub`} id={subRowId} className="wa-kit-table-subrow">
                      <td colSpan={colSpan}>{row.subRow}</td>
                    </tr>
                  ) : null,
                ];
              })
            )}
          </tbody>
        </table>
      </div>
      {scrollCue ? (
        <p className={cx('wa-kit-table-scroll-cue', !showCue && 'wa-sr-only')} aria-live="polite">
          {showCue ? 'Scroll for more' : ''}
        </p>
      ) : null}
      {showPager && pagination ? <KitTablePager pagination={pagination} /> : null}
    </div>
  );
}

/** Footer pager shared by the table and the stacked-card mobile branch. */
export function KitTablePager({ pagination, className }: { pagination: KitTablePagination; className?: string }) {
  if (pagination.totalItems <= pagination.pageSize) return null;
  return (
    <div className={cx('wa-kit-table-footer', className)}>
      <Pagination
        page={pagination.page}
        totalItems={pagination.totalItems}
        pageSize={pagination.pageSize}
        onChange={pagination.onChange}
        isDisabled={pagination.isDisabled}
        variant="compact"
        label={pagination.label ?? 'Table pagination'}
      />
    </div>
  );
}
