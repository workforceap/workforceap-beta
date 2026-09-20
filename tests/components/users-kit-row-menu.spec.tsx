import type { ComponentProps } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `/admin/users` (kit): the row menu wires Change role, Send password reset
 * and Delete account to the same `/api/admin/users/[id]` routes the legacy
 * manager uses, and keeps the self-row guard from admin audit §4.7 (WAP-182):
 * the signed-in admin's own row shows those two items disabled with a reason.
 */

const navigation = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => navigation,
  usePathname: () => '/admin/users',
  useSearchParams: () => new URLSearchParams(''),
}));
vi.mock('@astryxdesign/core/Selector', () => ({
  Selector: ({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) => (
    <label>{label}<select value={value} onChange={(event) => onChange(event.target.value)}>
      {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select></label>
  ),
}));

import { UsersKit } from '@/components/portal/kit/pages/admin-subviews/UsersKit';
import { SELF_DELETE_BLOCKED_TITLE, SELF_ROLE_CHANGE_BLOCKED_TITLE } from '@/lib/admin/usersSelfGuard';

const me = { id: 'me', name: 'Signed In Admin', initials: 'SA', email: 'me@example.com', role: 'Super Admin', roleCode: 'super_admin', lastLogin: 'Now', active: true };
const other = { id: 'other', name: 'Other Admin', initials: 'OA', email: 'other@example.com', role: 'Admin', roleCode: 'admin', lastLogin: '2d ago', active: true };

const props: ComponentProps<typeof UsersKit> = {
  users: [me, other],
  total: 2,
  currentPage: 1,
  pageSize: 50,
  currentUserId: 'me',
  canManageRoles: true,
};

function tableRowFor(email: string): HTMLElement {
  const table = screen.getByRole('table');
  const row = within(table).getByText(email).closest('tr');
  if (!row) throw new Error(`missing row for ${email}`);
  return row;
}

function openMenu(row: HTMLElement, name: string) {
  fireEvent.click(within(row).getByRole('button', { name: `Actions for ${name}` }));
  return within(row).getByRole('menu', { name: `Actions for ${name}` });
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ user: { role: 'case_manager' }, message: 'Reset sent.' }) });
  vi.stubGlobal('fetch', fetchMock);
  navigation.push.mockReset();
  navigation.refresh.mockReset();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('UsersKit row menu', () => {
  it('opens a menu per row with the three account actions and no ?ui=legacy hand-off for them', () => {
    render(<UsersKit {...props} />);
    const menu = openMenu(tableRowFor(other.email), other.name);
    const items = within(menu).getAllByRole('menuitem').map((item) => item.textContent);
    expect(items).toEqual(['Edit name & email', 'Change role', 'Send password reset', 'Delete account']);
    for (const item of within(menu).getAllByRole('menuitem')) expect(item).not.toHaveAttribute('aria-disabled');
    expect(screen.queryByRole('link', { name: 'Manage account' })).toBeNull();
  });

  it('keeps Change role and Delete visible but inert on the signed-in admin row, with the reason', () => {
    render(<UsersKit {...props} />);
    const menu = openMenu(tableRowFor(me.email), me.name);
    const role = within(menu).getByRole('menuitem', { name: 'Change role' });
    expect(role).toHaveAttribute('aria-disabled', 'true');
    expect(role).toHaveAttribute('title', SELF_ROLE_CHANGE_BLOCKED_TITLE);
    const del = within(menu).getByRole('menuitem', { name: 'Delete account' });
    expect(del).toHaveAttribute('aria-disabled', 'true');
    expect(del).toHaveAttribute('title', SELF_DELETE_BLOCKED_TITLE);
    expect(within(menu).getByRole('menuitem', { name: 'Send password reset' })).not.toHaveAttribute('aria-disabled');

    fireEvent.click(del);
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(role);
    expect(within(tableRowFor(me.email)).queryByLabelText('Account role')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends the password reset through the existing route', async () => {
    render(<UsersKit {...props} />);
    const menu = openMenu(tableRowFor(other.email), other.name);
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Send password reset' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/admin/users/other/reset-password');
    expect(init.method).toBe('POST');
    expect(await screen.findByTestId('users-feedback')).toHaveTextContent('Reset sent.');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('confirms before deleting, calls the existing DELETE route and drops the row', async () => {
    render(<UsersKit {...props} />);
    const menu = openMenu(tableRowFor(other.email), other.name);
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Delete account' }));
    expect(fetchMock).not.toHaveBeenCalled();
    const row = tableRowFor(other.email);
    const dialog = within(row).getByRole('dialog', { name: `Confirm delete user ${other.name}` });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Yes, delete' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/admin/users/other');
    expect(init.method).toBe('DELETE');
    await waitFor(() => expect(within(screen.getByRole('table')).queryByText(other.email)).toBeNull());
    expect(within(screen.getByRole('table')).getByText(me.email)).toBeInTheDocument();
    expect(navigation.refresh).toHaveBeenCalled();
  });

  it('lets Cancel close the delete confirmation without a request', () => {
    render(<UsersKit {...props} />);
    const menu = openMenu(tableRowFor(other.email), other.name);
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Delete account' }));
    fireEvent.click(within(tableRowFor(other.email)).getByRole('button', { name: 'Cancel' }));
    expect(within(tableRowFor(other.email)).queryByRole('dialog')).toBeNull();
    expect(within(tableRowFor(other.email)).getByRole('button', { name: `Actions for ${other.name}` })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('changes a role through PATCH with the same payload shape as the legacy Save', async () => {
    render(<UsersKit {...props} />);
    const menu = openMenu(tableRowFor(other.email), other.name);
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Change role' }));
    const row = tableRowFor(other.email);
    const select = within(row).getByLabelText('Account role') as HTMLSelectElement;
    expect(select.value).toBe('admin');
    expect(Array.from(select.options).map((option) => option.value)).toEqual(['member', 'admin', 'super_admin', 'case_manager']);
    fireEvent.change(select, { target: { value: 'case_manager' } });
    fireEvent.click(within(row).getByRole('button', { name: 'Save role' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/admin/users/other');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(String(init.body))).toEqual({ fullName: other.name, email: other.email, role: 'case_manager' });
    await waitFor(() => expect(within(tableRowFor(other.email)).getByText('Case manager')).toBeInTheDocument());
    expect(within(tableRowFor(other.email)).queryByLabelText('Account role')).toBeNull();
  });

  it('surfaces a failed request in the table notice and keeps the row', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: 'Cannot delete your own account.' }) });
    render(<UsersKit {...props} />);
    const menu = openMenu(tableRowFor(other.email), other.name);
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Delete account' }));
    fireEvent.click(within(tableRowFor(other.email)).getByRole('button', { name: 'Yes, delete' }));
    const wrap = screen.getByRole('table').closest<HTMLElement>('.wa-kit-table-wrap')!;
    expect(await within(wrap).findByRole('alert')).toHaveTextContent('Cannot delete your own account.');
    expect(within(screen.getByRole('table')).getByText(other.email)).toBeInTheDocument();
  });

  it('hides role and delete actions when the admin cannot manage roles', () => {
    render(<UsersKit {...props} canManageRoles={false} />);
    const menu = openMenu(tableRowFor(other.email), other.name);
    expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Edit name & email', 'Send password reset']);
  });

  it('hands name and email edits to the full manager for that account', () => {
    render(<UsersKit {...props} />);
    const menu = openMenu(tableRowFor(other.email), other.name);
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Edit name & email' }));
    expect(navigation.push).toHaveBeenCalledWith(`/admin/users?ui=legacy&search=${encodeURIComponent(other.email)}`);
  });

  it('closes the menu on Escape and returns focus to the trigger', () => {
    render(<UsersKit {...props} />);
    const row = tableRowFor(other.email);
    openMenu(row, other.name);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(within(row).queryByRole('menu')).toBeNull();
    const trigger = within(row).getByRole('button', { name: `Actions for ${other.name}` });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(document.activeElement).toBe(trigger);
  });

  it('keeps the page heading single and shows statuses as kit tags', () => {
    render(<UsersKit {...props} />);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(within(tableRowFor(other.email)).getByText('Recent login')).toHaveClass('wa-kit-tag', 'wa-kit-tag--ok');
    expect(screen.getByRole('searchbox', { name: 'Search staff & admins' })).toBeInTheDocument();
  });
});
