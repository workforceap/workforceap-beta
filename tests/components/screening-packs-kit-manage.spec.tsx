import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ScreeningPacksKit, type ScreeningPackRow } from '@/components/portal/kit/pages/admin-subviews/ScreeningPacksKit';
import { NewScreeningPackForm } from '@/components/admin/NewScreeningPackForm';

/**
 * WAP-193: creating, activating/deactivating and deleting employer screening
 * packs used to exist only on /admin/employer-screening-packs?ui=legacy.
 */

const nav = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => nav }));
vi.mock('@/components/admin/ConfirmDialog', () => ({
  default: ({ open, confirmLabel, onConfirm }: { open: boolean; confirmLabel: string; onConfirm: () => void }) =>
    open ? (
      <div role="dialog" aria-label="Confirm">
        <button type="button" onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    ) : null,
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

const ok = () => ({ ok: true, status: 200, json: async () => ({}) }) as Response;
const PACK: ScreeningPackRow = { id: 'p1', employer: 'Dell', roleFamily: 'IT Support', checks: 'Skills', used: '2×', active: true };
const first = (name: string) => screen.getAllByRole('button', { name })[0];

describe('ScreeningPacksKit manageable', () => {
  it('deactivates a pack through the PATCH route and refreshes', async () => {
    fetchMock.mockResolvedValueOnce(ok());
    render(<ScreeningPacksKit packs={[PACK]} manageable />);
    fireEvent.click(first('Deactivate Dell · IT Support'));
    await waitFor(() => expect(nav.refresh).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/employer-screening-packs/p1', {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: false }),
    });
  });

  it('deletes only after confirmation, and shows a failed delete', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({ error: 'Not found' }) } as Response);
    render(<ScreeningPacksKit packs={[PACK]} manageable />);
    fireEvent.click(first('Delete Dell · IT Support'));
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete pack' }));
    await waitFor(() => expect(screen.getAllByRole('alert')[0]).toHaveTextContent('Not found'));
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/employer-screening-packs/p1', { method: 'DELETE', credentials: 'include' });
    expect(nav.refresh).not.toHaveBeenCalled();
  });

  it('renders the new-pack form and points the header button at it', () => {
    render(
      <ScreeningPacksKit
        packs={[PACK]}
        manageable
        createForm={<NewScreeningPackForm programOptions={[{ slug: 'it', title: 'IT Support' }]} />}
        createFormHref="#new-screening-pack"
      />,
    );
    expect(screen.getByRole('link', { name: 'New pack' })).toHaveAttribute('href', '#new-screening-pack');
    expect(screen.getByRole('button', { name: 'Create pack' })).toBeInTheDocument();
  });

  it('stays read-only without the props', () => {
    render(<ScreeningPacksKit packs={[PACK]} />);
    expect(screen.queryByRole('button', { name: /Deactivate|Delete|Create pack/ })).toBeNull();
    expect(screen.getByRole('link', { name: 'Manage packs' })).toHaveAttribute('href', '/admin/employer-screening-packs?ui=legacy');
  });
});
