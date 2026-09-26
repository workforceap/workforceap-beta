import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { UsersKit } from '@/components/portal/kit/pages/admin-subviews/UsersKit';

/**
 * WAP-193: quick-creating an account (POST /api/admin/users) used to exist
 * only on /admin/users?ui=legacy. The default staff roster now carries the
 * same form.
 */

const nav = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => nav,
  usePathname: () => '/admin/users',
  useSearchParams: () => new URLSearchParams(),
}));

const fetchMock = vi.fn();
beforeEach(() => {
  nav.refresh.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('UsersKit quick create', () => {
  it('creates an account from the default roster and refreshes it', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({ user: { id: 'u9', fullName: 'Ana Ruiz', email: 'ana@workforceap.org', role: 'admin' } }),
    } as Response);
    render(<UsersKit users={[]} total={0} canManageRoles quickCreate />);
    const section = screen.getByRole('region', { name: 'Create an account' });
    fireEvent.change(within(section).getByLabelText('Full name'), { target: { value: 'Ana Ruiz' } });
    fireEvent.change(within(section).getByLabelText('Email'), { target: { value: 'ana@workforceap.org' } });
    fireEvent.click(within(section).getByRole('button', { name: 'Create user' }));
    await waitFor(() => expect(within(section).getByRole('status')).toHaveTextContent('User created.'));
    expect(nav.refresh).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toEqual({
      fullName: 'Ana Ruiz',
      email: 'ana@workforceap.org',
      role: 'admin',
      sendResetEmail: true,
    });
  });

  it('validates required fields before calling the API', () => {
    render(<UsersKit users={[]} total={0} quickCreate />);
    const section = screen.getByRole('region', { name: 'Create an account' });
    fireEvent.click(within(section).getByRole('button', { name: 'Create user' }));
    expect(within(section).getByRole('alert')).toHaveTextContent('Full name');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('offers only the member role to non-super admins and no form without the prop', () => {
    render(<UsersKit users={[]} total={0} quickCreate />);
    const roles = within(screen.getByRole('region', { name: 'Create an account' })).getByLabelText('Role');
    expect(Array.from((roles as HTMLSelectElement).options).map((o) => o.value)).toEqual(['member']);
    cleanup();
    render(<UsersKit users={[]} total={0} />);
    expect(screen.queryByRole('region', { name: 'Create an account' })).toBeNull();
  });
});
