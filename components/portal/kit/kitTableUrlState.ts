/**
 * URL state for kit tables: `?search=&sort=&page=` (KIT_GUIDE §6a).
 *
 * `sort` is `<key>` for ascending and `-<key>` for descending. `page` is a
 * 1-based positive integer; anything else reads as page 1. Changing `search`
 * or `sort` resets `page` so a filter never lands on an empty last page.
 * Pure functions — usable in server pages, client hooks and specs alike.
 */

/** Rows per page for admin tables (matches `ADMIN_SSR_LIST_CAP` paging). */
export const KIT_TABLE_PAGE_SIZE = 50;

export type KitTableSortDirection = 'asc' | 'desc';

export type KitTableSort<K extends string = string> = { key: K; direction: KitTableSortDirection };

export type KitTableUrlState<K extends string = string> = {
  search: string;
  sort: KitTableSort<K> | null;
  page: number;
};

type ParamSource = URLSearchParams | Record<string, string | string[] | undefined>;

function readParam(source: ParamSource, name: string): string | null {
  if (source instanceof URLSearchParams) return source.get(name);
  const value = source[name];
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export function parseKitTableSort<K extends string = string>(
  value: string | null | undefined,
  allowedKeys?: readonly K[],
): KitTableSort<K> | null {
  if (!value) return null;
  const direction: KitTableSortDirection = value.startsWith('-') ? 'desc' : 'asc';
  const key = (direction === 'desc' ? value.slice(1) : value).trim();
  if (!key) return null;
  if (allowedKeys && !allowedKeys.includes(key as K)) return null;
  return { key: key as K, direction };
}

export function serializeKitTableSort(sort: KitTableSort | null | undefined): string | null {
  if (!sort) return null;
  return sort.direction === 'desc' ? `-${sort.key}` : sort.key;
}

function parseKitTablePage(value: string | null | undefined): number {
  const page = Number(value);
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

/** Read `?search&sort&page` from Next `searchParams` or a `URLSearchParams`. */
export function readKitTableUrlState<K extends string = string>(
  source: ParamSource,
  options: { sortKeys?: readonly K[] } = {},
): KitTableUrlState<K> {
  return {
    search: (readParam(source, 'search') ?? '').trim(),
    sort: parseKitTableSort<K>(readParam(source, 'sort'), options.sortKeys),
    page: parseKitTablePage(readParam(source, 'page')),
  };
}

export type KitTableUrlChanges = {
  search?: string;
  sort?: KitTableSort | null;
  page?: number;
  /** Any extra filters (`role`, `status`, …). Empty string deletes the key. */
  filters?: Record<string, string | null | undefined>;
};

/**
 * Apply changes to a copy of `current`. Search, sort and filter changes drop
 * `page`; an explicit `page` of 1 is written as no `page` param at all.
 */
export function writeKitTableUrlState(current: URLSearchParams | string, changes: KitTableUrlChanges): URLSearchParams {
  const params = new URLSearchParams(current);
  const resetsPage = changes.search !== undefined || changes.sort !== undefined || changes.filters !== undefined;
  if (changes.search !== undefined) {
    const search = changes.search.trim();
    if (search) params.set('search', search);
    else params.delete('search');
  }
  if (changes.sort !== undefined) {
    const sort = serializeKitTableSort(changes.sort);
    if (sort) params.set('sort', sort);
    else params.delete('sort');
  }
  if (changes.filters) {
    for (const [key, value] of Object.entries(changes.filters)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
  }
  if (resetsPage) params.delete('page');
  if (changes.page !== undefined) {
    if (changes.page > 1) params.set('page', String(changes.page));
    else params.delete('page');
  }
  return params;
}

/** `pathname?…` for a chip or pager link; a bare pathname when nothing is set. */
export function kitTableHref(pathname: string, current: URLSearchParams | string, changes: KitTableUrlChanges): string {
  const query = writeKitTableUrlState(current, changes).toString();
  return query ? `${pathname}?${query}` : pathname;
}
