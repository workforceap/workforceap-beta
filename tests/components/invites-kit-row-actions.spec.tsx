import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { InvitesKit, type InviteRow } from '@/components/portal/kit/pages/admin-subviews/InvitesKit';
import { InviteRowActions } from '@/components/admin/InviteRowActions';

/**
 * WAP-193: resending and revoking an invitation used to exist only in the
 * ?ui=legacy table. The default kit table now carries both on pending rows.
 */

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
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
  refresh.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const json = (status: number, body: unknown) =>
  ({ ok: status < 400, status, json: async () => body }) as Response;

const ROWS: InviteRow[] = [
  { id: 'p1', email: 'pending@example.org', type: 'Member', sent: '2d ago', status: 'pending' },
  { id: 'a1', email: 'accepted@example.org', type: 'Partner', sent: '5d ago', status: 'accepted' },
];

describe('InvitesKit rowActions', () => {
  it('adds an Actions column that renders the row controls', () => {
    render(
      <InvitesKit
        invites={ROWS}
        sent={2}
        accepted={1}
        pending={1}
        rate={50}
        rowActions={(row) =>
          row.status === 'pending' ? <InviteRowActions id={row.id} email={row.email} /> : null
        }
      />,
    );
    expect(screen.getAllByRole('columnheader', { name: 'Actions' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: 'Resend invite to pending@example.org' }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /accepted@example\.org/ })).toBeNull();
  });

  it('has no Actions column without rowActions', () => {
    render(<InvitesKit invites={ROWS} sent={2} accepted={1} pending={1} rate={50} />);
    expect(screen.queryByRole('columnheader', { name: 'Actions' })).toBeNull();
  });
});

describe('InviteRowActions', () => {
  it('resends through the tenant-scoped route and refreshes the page', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { ok: true }));
    render(<InviteRowActions id="p1" email="pending@example.org" />);
    fireEvent.click(screen.getByRole('button', { name: 'Resend invite to pending@example.org' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Invitation resent.'));
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/invites/p1/resend', { method: 'POST' });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('shows the route error and does not refresh when resend fails', async () => {
    fetchMock.mockResolvedValueOnce(json(429, { error: 'Rate limit exceeded.' }));
    render(<InviteRowActions id="p1" email="pending@example.org" />);
    fireEvent.click(screen.getByRole('button', { name: 'Resend invite to pending@example.org' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Rate limit exceeded.'));
    expect(refresh).not.toHaveBeenCalled();
  });

  it('revokes only after confirmation', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { ok: true }));
    render(<InviteRowActions id="p1" email="pending@example.org" />);
    fireEvent.click(screen.getByRole('button', { name: 'Revoke invite to pending@example.org' }));
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Revoke' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Invitation revoked.'));
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/invites/p1/revoke', { method: 'PATCH' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
