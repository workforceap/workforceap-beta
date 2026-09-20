import { Fragment, isValidElement } from 'react';
import type { CSSProperties, ReactElement, ReactNode } from 'react';

/**
 * Data-table primitive for admin and portal pages.
 *
 * Replaces the repeated inline-style pattern:
 *
 *   <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
 *     <thead>
 *       <tr style={{ textAlign: 'left' }}>
 *         <th style={{ padding: '0.5rem 0.6rem', borderBottom: '1px solid var(--outline-variant)' }}>...</th>
 *         ...
 *       </tr>
 *     </thead>
 *     <tbody>
 *       {rows.map((row) => (
 *         <tr key={row.id}>
 *           <td style={{ padding: '0.5rem 0.6rem', borderBottom: '1px solid var(--outline-variant)' }}>...</td>
 *           ...
 *         </tr>
 *       ))}
 *     </tbody>
 *   </table>
 *
 * which currently appears in dozens of admin pages with subtly varying
 * paddings, font sizes, and overflow handling. By centralizing here, a
 * future style change (e.g. zebra striping, mobile card-collapse, sticky
 * headers) lives in one place.
 *
 * Generic over the row type so column `cell()` callbacks are properly
 * typed at the call site.
 */

export type DataTableColumn<TRow> = {
  /** Stable key for React reconciliation. */
  key: string;
  /** Header label. */
  header: ReactNode;
  /** Cell renderer. Receives the full row. */
  cell: (row: TRow, index: number) => ReactNode;
  /** Optional alignment for both header and cells. */
  align?: 'left' | 'right' | 'center';
  /** Optional `style.width` (use sparingly — flex is usually better). */
  width?: string | number;
  /** Hide the header and its cells below the shared md breakpoint. */
  hideOnMobile?: boolean;
  /** Applied to both `<th>` and `<td>` for this column (e.g. `members-col-md`). */
  columnClassName?: string;
  /** Pin column to the left on horizontal scroll (admin queues). */
  stickyLeft?: boolean;
  /**
   * When true, cells render as `<th scope="row">` instead of `<td>` (semantic row labels,
   * e.g. program comparison matrices).
   */
  rowHeader?: boolean;
  /** Mobile stacked-cell label. Required for rich headers; plain string/number headers are inferred. */
  cellDataLabel?: string;
  /**
   * Sets `aria-sort` on this column's `<th>` (e.g. `'ascending'` on the
   * currently-sorted column, `'none'` otherwise). Omit for non-sortable
   * columns — the attribute is left off entirely rather than defaulted.
   */
  ariaSort?: 'ascending' | 'descending' | 'none' | 'other';
};

export type DataTableProps<TRow> = {
  columns: DataTableColumn<TRow>[];
  rows: TRow[];
  rowKey: (row: TRow, index: number) => string;
  /** Rendered when `rows.length === 0`. */
  emptyState?: ReactNode;
  /** Compact = smaller font + padding. Default = standard. */
  density?: 'standard' | 'compact';
  /**
   * `portal` (default) — DataTable supplies cell padding and borders (inline).
   * `admin` — minimal inline cell chrome; use with `tableClassName` (`admin-table`, `dashboard-table`, coursera classes) so shared CSS controls padding, hover, and dark mode.
   */
  variant?: 'portal' | 'admin';
  /** Merged onto `<table>` (e.g. `admin-table`, `dashboard-table`). */
  tableClassName?: string;
  /** Per-row attributes for interactive rows (`data-clickable`, `onClick`, etc.). */
  getRowProps?: (row: TRow, index: number) => React.HTMLAttributes<HTMLTableRowElement>;
  /** Wraps the table in a scroll container. Default true. */
  scrollX?: boolean;
  /** Optional className passthrough on the outer wrapper. */
  className?: string;
  /**
   * Pins the `<thead>` to the top of the scroll container (`position: sticky`
   * on each header cell — more reliably supported than `position: sticky` on
   * `<thead>` itself). Uses `--surface-container-low` for the header
   * background so sticky header cells stay opaque over scrolling rows.
   * Default false (no layout change for existing tables).
   */
  stickyHeader?: boolean;
  /**
   * When defined and returns non-nullish content, renders a full-width row below the main row
   * (`<td colSpan={columns.length}>...</td>`). Use for expandable detail rows (e.g. assessments).
   */
  renderSubRow?: (row: TRow, index: number) => ReactNode | null | undefined;
  /** Merged onto the sub-row `<td>` when `renderSubRow` returns content. */
  subRowTdStyle?: CSSProperties;
  subRowTdClassName?: string;
  /**
   * When this returns a React element, it replaces the default `<tr>` (and optional sub-row)
   * for that index — use for category rows with `colSpan` or other non-uniform rows.
   * Custom rows own their cells' data-label values; category/colSpan rows must
   * not inherit a positional label from an unrelated column.
   */
  renderBodyRow?: (
    row: TRow,
    rowIndex: number,
    ctx: { columns: DataTableColumn<TRow>[]; columnCount: number }
  ) => ReactElement | null | undefined;
};

const PADDING_BY_DENSITY: Record<NonNullable<DataTableProps<unknown>['density']>, string> = {
  standard: '0.5rem 0.6rem',
  compact: '0.35rem 0.5rem',
};

const FONT_BY_DENSITY: Record<NonNullable<DataTableProps<unknown>['density']>, string> = {
  standard: '0.9rem',
  compact: '0.875rem',
};

/**
 * Visible text of a header node, for the stacked-row `data-label` caption.
 * Plain strings/numbers are returned as-is. Rich headers (sort buttons,
 * select-all controls) contribute their string `label` prop or their nested
 * text children — so the 28 `variant="admin"` tables keep their column labels
 * below 767px even when the header cell is a control (WAP-131).
 */
export function headerTextForDataLabel(header: ReactNode): string | undefined {
  if (typeof header === 'string') return header.trim() || undefined;
  if (typeof header === 'number') return String(header);
  if (header == null || typeof header === 'boolean') return undefined;
  if (Array.isArray(header)) {
    const text = header.map((part) => headerTextForDataLabel(part) ?? '').join(' ').replace(/\s+/g, ' ').trim();
    return text || undefined;
  }
  if (isValidElement(header)) {
    const props = header.props as { label?: unknown; children?: ReactNode };
    if (typeof props.label === 'string' && props.label.trim()) return props.label.trim();
    return headerTextForDataLabel(props.children);
  }
  return undefined;
}

/** Mobile stacked `.admin-table` / `.dashboard-table` rows use `data-label`; derive from the header when unset. */
function dataLabelForColumn(header: ReactNode, explicit?: string): string | undefined {
  if (explicit != null && explicit !== '') return explicit;
  return headerTextForDataLabel(header);
}

export default function DataTable<TRow>({
  columns,
  rows,
  rowKey,
  emptyState,
  density = 'standard',
  variant = 'portal',
  tableClassName,
  getRowProps,
  scrollX = true,
  className,
  stickyHeader = false,
  renderSubRow,
  subRowTdStyle,
  subRowTdClassName,
  renderBodyRow,
}: DataTableProps<TRow>) {
  if (rows.length === 0 && emptyState !== undefined) {
    return <>{emptyState}</>;
  }

  const padding = PADDING_BY_DENSITY[density];
  const fontSize = FONT_BY_DENSITY[density];
  const usePortalChrome = variant === 'portal';

  const tableElement = (
    <table
      className={[tableClassName, `wap-data-table--${variant}`].filter(Boolean).join(' ')}
      style={{
        width: '100%',
        borderCollapse: 'collapse',
        ...(usePortalChrome ? { fontSize } : {}),
      }}
    >
      <thead>
        <tr style={{ textAlign: 'left' }}>
          {columns.map((col) => (
            <th
              key={col.key}
              scope="col"
              aria-sort={col.ariaSort}
              style={
                {
                  ...(usePortalChrome
                    ? {
                        padding,
                        borderBottom: '1px solid var(--outline-variant)',
                        textAlign: col.align ?? 'left',
                        width: col.width,
                        whiteSpace: 'nowrap',
                      }
                    : {
                        textAlign: col.align ?? 'left',
                        width: col.width,
                        whiteSpace: 'nowrap',
                      }),
                  ...(col.stickyLeft
                    ? {
                        position: 'sticky' as const,
                        left: 0,
                        zIndex: 2,
                        background: 'var(--surface-container)',
                      }
                    : {}),
                  ...(stickyHeader
                    ? {
                        position: 'sticky' as const,
                        top: 0,
                        zIndex: 'var(--z-sticky, 10)',
                        background: 'var(--surface-container-low)',
                      }
                    : {}),
                }
              }
              className={
                [col.hideOnMobile ? 'wa-hidden md:wa-table-cell' : undefined, col.columnClassName].filter(Boolean).join(' ') || undefined
              }
            >
              {col.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, rowIndex) => {
          const rk = rowKey(row, rowIndex);
          const customRow = renderBodyRow?.(row, rowIndex, { columns, columnCount: columns.length });
          if (customRow) {
            return (
              <Fragment key={rk}>
                {customRow}
              </Fragment>
            );
          }
          const sub = renderSubRow?.(row, rowIndex);
          const showSub = sub != null && sub !== false;
          return (
            <Fragment key={rk}>
              <tr {...(getRowProps?.(row, rowIndex) ?? {})}>
                {columns.map((col) => {
                  const sharedStyle = {
                    ...(usePortalChrome
                      ? {
                          padding,
                          borderBottom: '1px solid var(--outline-variant)',
                          textAlign: col.align ?? 'left',
                          verticalAlign: 'top' as const,
                        }
                      : {
                          textAlign: col.align ?? 'left',
                          verticalAlign: 'top' as const,
                        }),
                    ...(col.stickyLeft
                      ? {
                          position: 'sticky' as const,
                          left: 0,
                          zIndex: 1,
                          background: 'var(--surface-container-low)',
                        }
                      : {}),
                  };
                  const sharedClass =
                    [col.hideOnMobile ? 'wa-hidden md:wa-table-cell' : undefined, col.columnClassName]
                      .filter(Boolean)
                      .join(' ') || undefined;
                  if (col.rowHeader) {
                    return (
                      <th
                        key={col.key}
                        scope="row"
                        style={sharedStyle}
                        className={sharedClass}
                        data-label={dataLabelForColumn(col.header, col.cellDataLabel)}
                      >
                        {col.cell(row, rowIndex)}
                      </th>
                    );
                  }
                  return (
                    <td
                      key={col.key}
                      style={sharedStyle}
                      className={sharedClass}
                      data-label={dataLabelForColumn(col.header, col.cellDataLabel)}
                    >
                      {col.cell(row, rowIndex)}
                    </td>
                  );
                })}
              </tr>
              {showSub ? (
                <tr className="data-table-subrow">
                  <td
                    colSpan={columns.length}
                    style={{
                      ...(usePortalChrome
                        ? {
                            padding,
                            borderBottom: '1px solid var(--outline-variant)',
                            verticalAlign: 'top',
                          }
                        : { verticalAlign: 'top' }),
                      ...subRowTdStyle,
                    }}
                    className={subRowTdClassName}
                  >
                    {sub}
                  </td>
                </tr>
              ) : null}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );

  if (scrollX) {
    return (
      // `maxWidth: 100%` + `minWidth: 0` make the scroll wrapper honor the
      // parent's content box even when the parent is a flex/grid item with the
      // default `min-width: auto` (which would otherwise let a wide table push
      // the parent past the viewport — the bug that caused horizontal bleed
      // on /admin/coursera). `overflowX: auto` then clips and scrolls cleanly.
      <div
        style={{ overflowX: 'auto', maxWidth: '100%', minWidth: 0 }}
        className={['wap-data-table-scroll', className].filter(Boolean).join(' ')}
      >
        {tableElement}
      </div>
    );
  }
  return <div className={className}>{tableElement}</div>;
}
