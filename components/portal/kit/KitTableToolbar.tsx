'use client';

import Link from 'next/link';
import { useId, type ReactNode } from 'react';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { cx, type KitBaseProps, type KitDataAttrs } from './base';

export type KitTableViewChip = {
  key: string;
  label: string;
  /** Row count for this saved view; omitted when the page has not counted it. */
  count?: number;
  active?: boolean;
  /** Either a link target… */
  href?: string;
  /** …or a client handler. */
  onSelect?: () => void;
};

interface KitTableToolbarProps extends KitBaseProps<HTMLDivElement>, KitDataAttrs {
  /** Accessible name of the search box, e.g. `Search staff & admins`. */
  searchLabel: string;
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  /** True while the server is answering the last keystroke. */
  pending?: boolean;
  /** Saved-view chips with counts (`All · 8`, `At risk · 6`). */
  views?: KitTableViewChip[];
  viewsLabel?: string;
  /** Extra filter controls, collapsed behind “Filters · n on”. */
  filters?: ReactNode;
  /** How many of `filters` are set; drives the disclosure caption and default open state. */
  filtersOn?: number;
  onClearFilters?: () => void;
  /** Right-aligned actions (export, invite). */
  actions?: ReactNode;
}

/**
 * Table toolbar — search, saved-view chips, collapsed filter drawer, actions
 * — on `--wa-*`. URL state (`?search&sort&page`) lives with the caller via
 * `kitTableUrlState.ts`; this component only renders and reports changes.
 */
export function KitTableToolbar({
  searchLabel,
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Search',
  pending = false,
  views,
  viewsLabel = 'Views',
  filters,
  filtersOn = 0,
  onClearFilters,
  actions,
  className,
  style,
  ref,
  ...rest
}: KitTableToolbarProps) {
  const searchId = useId();
  const hasViews = Boolean(views && views.length > 0);

  return (
    <div ref={ref} className={cx('wa-kit-toolbar', className)} style={style} {...rest}>
      <div className="wa-kit-toolbar__row">
        <label className="wa-kit-toolbar__search" htmlFor={searchId}>
          <Search size={16} aria-hidden className="wa-kit-toolbar__search-icon" />
          <span className="wa-sr-only">{searchLabel}</span>
          <input
            id={searchId}
            type="search"
            className="wa-kit-toolbar__input wa-kit-focus"
            value={searchValue}
            placeholder={searchPlaceholder}
            onChange={(e) => onSearchChange(e.target.value)}
            aria-busy={pending || undefined}
            autoComplete="off"
          />
          {searchValue ? (
            <button
              type="button"
              className="wa-kit-toolbar__clear wa-kit-focus"
              aria-label="Clear search"
              onClick={() => onSearchChange('')}
            >
              <X size={14} aria-hidden />
            </button>
          ) : null}
        </label>
        {filters ? (
          <details className="wa-kit-toolbar__filters" open={filtersOn > 0 || undefined}>
            <summary className="wa-kit-toolbar__filters-summary wa-kit-focus">
              <SlidersHorizontal size={16} aria-hidden />
              <span>Filters</span>
              {filtersOn > 0 ? (
                <span className="wa-kit-toolbar__filters-count">
                  {filtersOn} on
                </span>
              ) : null}
            </summary>
            <div className="wa-kit-toolbar__filters-body">
              {filters}
              {onClearFilters && filtersOn > 0 ? (
                <button type="button" className="wa-kit-toolbar__link wa-kit-focus" onClick={onClearFilters}>
                  Clear filters
                </button>
              ) : null}
            </div>
          </details>
        ) : null}
        {actions ? <div className="wa-kit-toolbar__actions">{actions}</div> : null}
      </div>
      {hasViews ? (
        <div className="wa-kit-toolbar__views" role="group" aria-label={viewsLabel}>
          {views!.map((chip) => {
            const content = (
              <>
                <span>{chip.label}</span>
                {chip.count != null ? (
                  <>
                    {' '}
                    <span className="wa-kit-toolbar__chip-count">{chip.count.toLocaleString()}</span>
                  </>
                ) : null}
              </>
            );
            const chipClass = cx('wa-kit-toolbar__chip wa-kit-focus', chip.active && 'wa-kit-toolbar__chip--active');
            return chip.href ? (
              <Link key={chip.key} href={chip.href} className={chipClass} aria-current={chip.active ? 'page' : undefined}>
                {content}
              </Link>
            ) : (
              <button
                key={chip.key}
                type="button"
                className={chipClass}
                aria-pressed={chip.active ?? false}
                onClick={chip.onSelect}
              >
                {content}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
