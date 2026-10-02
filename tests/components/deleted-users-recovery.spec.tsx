import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DeletedUsersClient, { type DeletedUserRow } from '@/components/admin/DeletedUsersClient';

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
const fetchMock = vi.fn<typeof fetch>();
const row: DeletedUserRow = {
  id: 'synthetic-member', fullName: 'Synthetic Member', currentEmail: 'deleted@example.test',
  originalEmail: 'member@example.test', isFreed: true,
  deletedAt: '2026-09-30T12:00:00Z', createdAt: '2026-08-01T12:00:00Z',
};

beforeEach(() => {
  refresh.mockReset(); fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('deleted users recovery guidance', () => {
  it('does not promise recovery just because a deleted record is listed', () => {
    render(<DeletedUsersClient rows={[row]} totalDeletedCount={1} stillBoundCount={0} />);
    expect(screen.getByText(/Restore cannot recover erased files or anonymized data/)).toBeInTheDocument();
    expect(screen.getByText(/do not clear document safeguards/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'agreement archive' })).toHaveAttribute('href', '/admin/enrollment-agreements/archive');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows the server safeguard error without claiming restoration or refreshing', async () => {
    const error = 'Account erasure is in progress. Contact support to reconcile it.';
    fetchMock.mockResolvedValueOnce(Response.json({ error, code: 'ACCOUNT_DOCUMENT_OPERATION_PENDING' }, { status: 409 }));
    render(<DeletedUsersClient rows={[row]} totalDeletedCount={1} stillBoundCount={0} />);
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(error);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith('/api/admin/users/synthetic-member/restore', { method: 'POST' });
  });

  it('keeps the empty view conditional on restoration eligibility', () => {
    render(<DeletedUsersClient rows={[]} totalDeletedCount={0} stillBoundCount={0} />);
    expect(screen.getByText(/request restoration when eligible/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Restore' })).not.toBeInTheDocument();
  });
});
