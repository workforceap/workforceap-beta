import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Kit table toolbar + URL state (docs/KIT_GUIDE.md §6a): search, saved-view
 * chips with counts, a collapsed "Filters · n on" drawer, and the pure
 * `?search&sort&page` helpers pages use to read and write that state.
 */

import { KitTableToolbar } from '@/components/portal/kit/KitTableToolbar';
import {
  KIT_TABLE_PAGE_SIZE,
  kitTableHref,
  parseKitTableSort,
  readKitTableUrlState,
  serializeKitTableSort,
  writeKitTableUrlState,
} from '@/components/portal/kit/kitTableUrlState';

afterEach(() => cleanup());

describe('KitTableToolbar', () => {
  it('labels the search box, reports typing and clears it', () => {
    const onSearchChange = vi.fn();
    const { rerender } = render(<KitTableToolbar searchLabel="Search staff" searchValue="" onSearchChange={onSearchChange} searchPlaceholder="Name or email" />);
    const input = screen.getByRole('searchbox', { name: 'Search staff' });
    expect(input).toHaveAttribute('placeholder', 'Name or email');
    expect(screen.queryByRole('button', { name: 'Clear search' })).toBeNull();
    fireEvent.change(input, { target: { value: 'dana' } });
    expect(onSearchChange).toHaveBeenCalledWith('dana');

    rerender(<KitTableToolbar searchLabel="Search staff" searchValue="dana" onSearchChange={onSearchChange} pending />);
    expect(screen.getByRole('searchbox', { name: 'Search staff' })).toHaveAttribute('aria-busy', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(onSearchChange).toHaveBeenLastCalledWith('');
  });

  it('collapses filters behind a disclosure that opens and counts when filters are on', () => {
    const onClearFilters = vi.fn();
    const { container, rerender } = render(
      <KitTableToolbar searchLabel="Search" searchValue="" onSearchChange={vi.fn()} filters={<label>Role<select aria-label="Role" /></label>} filtersOn={0} onClearFilters={onClearFilters} />,
    );
    const details = container.querySelector<HTMLDetailsElement>('details.wa-kit-toolbar__filters')!;
    expect(details.open).toBe(false);
    expect(screen.getByText('Filters')).toBeInTheDocument();
    expect(screen.queryByText('1 on')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Clear filters' })).toBeNull();

    rerender(
      <KitTableToolbar searchLabel="Search" searchValue="" onSearchChange={vi.fn()} filters={<label>Role<select aria-label="Role" /></label>} filtersOn={1} onClearFilters={onClearFilters} />,
    );
    expect(container.querySelector<HTMLDetailsElement>('details.wa-kit-toolbar__filters')!.open).toBe(true);
    expect(screen.getByText('1 on')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(onClearFilters).toHaveBeenCalledOnce();
  });

  it('renders saved-view chips with counts as links or buttons and marks the active one', () => {
    const onSelect = vi.fn();
    render(
      <KitTableToolbar
        searchLabel="Search"
        searchValue=""
        onSearchChange={vi.fn()}
        viewsLabel="Roster views"
        views={[
          { key: 'all', label: 'All', count: 8, href: '/admin/students', active: true },
          { key: 'risk', label: 'At risk', count: 6, href: '/admin/students?view=at-risk' },
          { key: 'local', label: 'Unmatched', count: 0, onSelect },
        ]}
      />,
    );
    const group = screen.getByRole('group', { name: 'Roster views' });
    const all = within(group).getByRole('link', { name: 'All 8' });
    expect(all).toHaveAttribute('aria-current', 'page');
    expect(all).toHaveClass('wa-kit-toolbar__chip--active');
    const risk = within(group).getByRole('link', { name: 'At risk 6' });
    expect(risk).toHaveAttribute('href', '/admin/students?view=at-risk');
    expect(risk).not.toHaveAttribute('aria-current');
    const local = within(group).getByRole('button', { name: 'Unmatched 0' });
    expect(local).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(local);
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it('adds no heading so the page keeps its single h1', () => {
    render(<KitTableToolbar searchLabel="Search" searchValue="" onSearchChange={vi.fn()} views={[{ key: 'a', label: 'A', count: 1 }]} actions={<button type="button">Export</button>} />);
    expect(screen.queryByRole('heading')).toBeNull();
    expect(screen.getByRole('button', { name: 'Export' })).toBeInTheDocument();
  });
});

describe('kit table URL state', () => {
  it('reads search, sort and page from Next searchParams and URLSearchParams alike', () => {
    expect(KIT_TABLE_PAGE_SIZE).toBe(50);
    expect(readKitTableUrlState({ search: ' dana ', sort: '-lastLogin', page: '3' })).toEqual({
      search: 'dana',
      sort: { key: 'lastLogin', direction: 'desc' },
      page: 3,
    });
    expect(readKitTableUrlState(new URLSearchParams('sort=name&page=0'))).toEqual({ search: '', sort: { key: 'name', direction: 'asc' }, page: 1 });
    expect(readKitTableUrlState({ page: ['2', '9'], search: ['x'] })).toEqual({ search: 'x', sort: null, page: 2 });
    expect(readKitTableUrlState({ page: 'abc' }).page).toBe(1);
    expect(readKitTableUrlState({ page: '1e3' }).page).toBe(1000);
    expect(readKitTableUrlState({ page: '-4' }).page).toBe(1);
  });

  it('rejects sort keys outside the allow-list and round-trips the rest', () => {
    expect(parseKitTableSort('-role', ['name', 'role'])).toEqual({ key: 'role', direction: 'desc' });
    expect(parseKitTableSort('email', ['name', 'role'])).toBeNull();
    expect(parseKitTableSort('-', ['name'])).toBeNull();
    expect(parseKitTableSort('')).toBeNull();
    expect(serializeKitTableSort({ key: 'name', direction: 'asc' })).toBe('name');
    expect(serializeKitTableSort({ key: 'name', direction: 'desc' })).toBe('-name');
    expect(serializeKitTableSort(null)).toBeNull();
    expect(readKitTableUrlState({ sort: 'bogus' }, { sortKeys: ['name'] }).sort).toBeNull();
  });

  it('writes changes onto the current query and resets the page when the view changes', () => {
    const current = 'search=old&sort=-name&page=4&role=admin';
    expect(writeKitTableUrlState(current, { search: 'new' }).toString()).toBe('search=new&sort=-name&role=admin');
    expect(writeKitTableUrlState(current, { sort: { key: 'email', direction: 'asc' } }).toString()).toBe('search=old&sort=email&role=admin');
    expect(writeKitTableUrlState(current, { sort: null, search: '' }).toString()).toBe('role=admin');
    expect(writeKitTableUrlState(current, { filters: { role: '', status: 'active' } }).toString()).toBe('search=old&sort=-name&status=active');
    expect(writeKitTableUrlState(current, { page: 5 }).toString()).toBe('search=old&sort=-name&page=5&role=admin');
    expect(writeKitTableUrlState(current, { page: 1 }).toString()).toBe('search=old&sort=-name&role=admin');
    // The input is never mutated.
    const params = new URLSearchParams(current);
    writeKitTableUrlState(params, { page: 9 });
    expect(params.get('page')).toBe('4');
  });

  it('builds chip and pager hrefs, dropping the query when nothing is set', () => {
    expect(kitTableHref('/admin/students', 'view=at-risk&page=2', { page: 3 })).toBe('/admin/students?view=at-risk&page=3');
    expect(kitTableHref('/admin/students', 'page=2', { page: 1 })).toBe('/admin/students');
    expect(kitTableHref('/admin/users', '', { search: 'dana', filters: { role: 'admin' } })).toBe('/admin/users?search=dana&role=admin');
  });
});
