import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ProgramChangeRequestsKit,
  type ProgramChangeRow,
} from '@/components/portal/kit/pages/admin-subviews/ProgramChangeRequestsKit';

/**
 * WAP-193: approving or denying a member's program change request used to
 * exist only on /admin/program-change-requests?ui=legacy. The default kit
 * table now carries both on pending rows; approve asks for confirmation
 * because it updates the member's enrollment.
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

const json = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body }) as Response;

const ROWS: ProgramChangeRow[] = [
  { id: 'r1', student: 'Devon Hill', current: 'Manufacturing', requested: 'Cloud & IT', reason: 'Cloud fits', status: 'Pending' },
  { id: 'r2', student: 'Lena Ortiz', current: 'Data & AI', requested: 'Healthcare', reason: 'Nursing', status: 'Approved' },
];

function firstButton(name: string) {
  return screen.getAllByRole('button', { name })[0];
}

describe('ProgramChangeRequestsKit reviewable', () => {
  it('shows Approve and Deny only on pending rows', () => {
    render(<ProgramChangeRequestsKit requests={ROWS} pendingCount={1} reviewable />);
    expect(screen.getAllByRole('button', { name: 'Approve Devon Hill' }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Approve Lena Ortiz' })).toBeNull();
  });

  it('renders no review controls without the prop', () => {
    render(<ProgramChangeRequestsKit requests={ROWS} pendingCount={1} />);
    expect(screen.queryByRole('button', { name: /Approve|Deny/ })).toBeNull();
  });

  it('approves only after confirmation and sends the admin note', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { request: { id: 'r1', status: 'APPROVED' } }));
    render(<ProgramChangeRequestsKit requests={[ROWS[0]]} pendingCount={1} reviewable />);
    fireEvent.change(screen.getAllByLabelText('Admin note (optional)')[0], { target: { value: 'OK per counselor' } });
    fireEvent.click(firstButton('Approve Devon Hill'));
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Approve & update enrollment' }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/program-change-requests/r1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'APPROVED', adminNote: 'OK per counselor' }),
    });
  });

  it('denies directly and shows a route error without refreshing', async () => {
    fetchMock.mockResolvedValueOnce(json(409, { error: 'Request already reviewed' }));
    render(<ProgramChangeRequestsKit requests={[ROWS[0]]} pendingCount={1} reviewable />);
    fireEvent.click(firstButton('Deny Devon Hill'));
    await waitFor(() => expect(screen.getAllByRole('alert')[0]).toHaveTextContent('Request already reviewed'));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toEqual({ status: 'DENIED', adminNote: null });
    expect(refresh).not.toHaveBeenCalled();
  });
});
