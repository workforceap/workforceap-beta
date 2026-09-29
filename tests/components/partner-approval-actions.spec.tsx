import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PartnerApprovalActions } from '@/components/admin/PartnerApprovalActions';

/**
 * WAP-193: approving or rejecting a pending partner used to exist only in the
 * ?ui=legacy partners table. The partner detail page (which the default
 * directory opens) now carries both.
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

const ok = () => ({ ok: true, status: 200, json: async () => ({ ok: true }) }) as Response;

describe('PartnerApprovalActions', () => {
  it('approves only after confirmation', async () => {
    fetchMock.mockResolvedValueOnce(ok());
    render(<PartnerApprovalActions partnerId="p1" partnerName="Goodwill" />);
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Approve partner' }));
    await waitFor(() => expect(nav.refresh).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/partners/p1/approve', { method: 'POST' });
  });

  it('rejects with an optional reason', async () => {
    fetchMock.mockResolvedValue(ok());
    render(<PartnerApprovalActions partnerId="p1" partnerName="Goodwill" />);
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    fireEvent.change(screen.getByLabelText('Rejection reason (optional)'), { target: { value: ' Outside service area ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm reject' }));
    await waitFor(() => expect(nav.refresh).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/partners/p1/reject', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: 'Outside service area' }),
    });
  });

  it('allows a reject with no reason and shows a route error', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({ error: 'Partner is not pending approval' }) } as Response);
    render(<PartnerApprovalActions partnerId="p1" partnerName="Goodwill" />);
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm reject' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Partner is not pending approval');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toEqual({ notes: '' });
    expect(nav.refresh).not.toHaveBeenCalled();
  });
});
