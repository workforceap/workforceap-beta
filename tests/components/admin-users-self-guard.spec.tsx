import type { ComponentProps } from 'react';
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Admin audit §4.7 (WAP-182): the legacy Users manager never offers Delete or
 * a role change on the signed-in admin's own row — the controls stay visible
 * but disabled, with a title that says why — and Save on that row sends name
 * and email only. Other rows keep the full toolset. Rows are labelled by the
 * role the server resolved (partner / employer), never a blanket "Member".
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/admin/users',
  useSearchParams: () => new URLSearchParams('ui=legacy'),
}));
vi.mock('@astryxdesign/core/TextInput', () => ({
  TextInput: ({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) => (
    <label>{label}<input type="search" value={value} onChange={(event) => onChange(event.target.value)} /></label>
  ),
}));
vi.mock('@astryxdesign/core/Selector', () => ({
  Selector: ({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) => (
    <label>{label}<select value={value} onChange={(event) => onChange(event.target.value)}>
      {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select></label>
  ),
}));

import AdminUsersManager, {
  SELF_DELETE_BLOCKED_TITLE,
  SELF_ROLE_CHANGE_BLOCKED_TITLE,
} from '@/components/admin/AdminUsersManager';

const me = {
  id: 'me', fullName: 'Signed In Admin', email: 'me@example.com', role: 'super_admin',
  createdAt: '2026-09-01T12:00:00.000Z', memberHref: null,
};
const other = {
  id: 'other', fullName: 'Other Admin', email: 'other@example.com', role: 'admin',
  createdAt: '2026-09-02T12:00:00.000Z', memberHref: null,
};
const partner = {
  id: 'partner', fullName: 'Angela Davis', email: 'demo-partner@example.com', role: 'partner',
  createdAt: '2026-09-03T12:00:00.000Z', memberHref: null,
};
const employer = {
  id: 'employer', fullName: 'Sarah Chen', email: 'demo-employer@example.com', role: 'employer',
  createdAt: '2026-09-03T12:00:00.000Z', memberHref: null,
};

const props: ComponentProps<typeof AdminUsersManager> = {
  initialUsers: [me, other, partner, employer],
  canManageRoles: true,
  currentUserId: 'me',
  totalCount: 4,
  currentPage: 1,
  pageSize: 50,
};

function rowFor(container: HTMLElement, email: string): HTMLElement {
  const table = container.querySelector<HTMLElement>('.admin-users-desktop');
  if (!table) throw new Error('missing desktop table');
  const cell = within(table).getByText(email);
  const row = cell.closest('tr');
  if (!row) throw new Error(`missing row for ${email}`);
  return row;
}

function cardFor(container: HTMLElement, email: string): HTMLElement {
  const list = container.querySelector<HTMLElement>('.admin-users-cards');
  if (!list) throw new Error('missing mobile list');
  const card = within(list).getByText(email).closest('li');
  if (!card) throw new Error(`missing card for ${email}`);
  return card;
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ user: {} }) });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('AdminUsersManager self-row guard', () => {
  it('disables Delete on the signed-in admin row, in the table and the card, with a reason', () => {
    const { container } = render(<AdminUsersManager {...props} />);

    const myDelete = within(rowFor(container, me.email)).getByRole('button', { name: 'Delete' });
    expect(myDelete).toBeDisabled();
    expect(myDelete).toHaveAttribute('title', SELF_DELETE_BLOCKED_TITLE);
    fireEvent.click(myDelete);
    expect(within(rowFor(container, me.email)).queryByRole('dialog')).toBeNull();

    const myCardDelete = within(cardFor(container, me.email)).getByRole('button', { name: 'Delete' });
    expect(myCardDelete).toBeDisabled();
    expect(myCardDelete).toHaveAttribute('title', SELF_DELETE_BLOCKED_TITLE);

    const otherDelete = within(rowFor(container, other.email)).getByRole('button', { name: 'Delete' });
    expect(otherDelete).toBeEnabled();
    expect(otherDelete).not.toHaveAttribute('title');
    fireEvent.click(otherDelete);
    expect(within(rowFor(container, other.email)).getByRole('dialog')).toBeInTheDocument();
  });

  it('disables the role control on the own row and saves name and email only', async () => {
    const { container } = render(<AdminUsersManager {...props} />);

    const myRow = rowFor(container, me.email);
    fireEvent.click(within(myRow).getByRole('button', { name: 'Edit' }));
    const myRole = within(myRow).getByLabelText('Account role');
    expect(myRole).toBeDisabled();
    expect(myRole).toHaveAttribute('title', SELF_ROLE_CHANGE_BLOCKED_TITLE);
    const myCardRole = within(cardFor(container, me.email)).getByLabelText('Account role');
    expect(myCardRole).toBeDisabled();
    expect(myCardRole).toHaveAttribute('title', SELF_ROLE_CHANGE_BLOCKED_TITLE);

    fireEvent.click(within(myRow).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/admin/users/me');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(String(init.body))).toEqual({ fullName: me.fullName, email: me.email });
  });

  it('keeps the role control live on other rows and includes the role in Save', async () => {
    const { container } = render(<AdminUsersManager {...props} />);

    const otherRow = rowFor(container, other.email);
    fireEvent.click(within(otherRow).getByRole('button', { name: 'Edit' }));
    const role = within(otherRow).getByLabelText('Account role') as HTMLSelectElement;
    expect(role).toBeEnabled();
    expect(role).not.toHaveAttribute('title');
    fireEvent.change(role, { target: { value: 'case_manager' } });

    fireEvent.click(within(otherRow).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({ fullName: other.fullName, email: other.email, role: 'case_manager' });
  });

  it('offers the full toolset everywhere when no current user is known', () => {
    const { container } = render(<AdminUsersManager {...props} currentUserId={undefined} />);
    const del = within(rowFor(container, me.email)).getByRole('button', { name: 'Delete' });
    expect(del).toBeEnabled();
    expect(del).not.toHaveAttribute('title');
  });
});

describe('AdminUsersManager role labels', () => {
  it('labels partner and employer accounts by their real role, not Member', () => {
    const { container } = render(<AdminUsersManager {...props} />);
    expect(within(rowFor(container, partner.email)).getByText('Partner')).toBeInTheDocument();
    expect(within(rowFor(container, employer.email)).getByText('Employer')).toBeInTheDocument();
    expect(within(rowFor(container, partner.email)).queryByText('Member')).toBeNull();
    expect(within(rowFor(container, employer.email)).queryByText('Member')).toBeNull();
    expect(within(cardFor(container, partner.email)).getByText('Partner')).toBeInTheDocument();
  });
});
