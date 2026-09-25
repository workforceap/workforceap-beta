import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StaleApplicationsPanel } from '@/app/admin/pipeline/StaleApplicationsPanel';

/**
 * WAP-193: "Send reminder" for applications pending more than 3 days used to
 * exist only in the ?ui=legacy pipeline banner. The default pipeline view now
 * lists them with the same server action.
 */

const remind = vi.hoisted(() => vi.fn());
vi.mock('@/app/admin/pipeline/remindAction', () => ({ remindStaleApplication: remind }));

const fetchMock = vi.fn();
beforeEach(() => {
  remind.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;
const APP = { id: 'a1', userId: 'u1', createdAt: '2026-09-20T00:00:00.000Z', user: { fullName: 'Dana Diaz', email: 'dana@example.org' } };

describe('StaleApplicationsPanel', () => {
  it('sends a reminder for a stale application and marks it sent', async () => {
    fetchMock.mockResolvedValueOnce(ok({ staleApps: [APP] }));
    remind.mockResolvedValueOnce(undefined);
    render(<StaleApplicationsPanel />);

    fireEvent.click(await screen.findByRole('button', { name: 'Send reminder to Dana Diaz' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Reminder sent to Dana Diaz' })).toBeDisabled());
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/pipeline/stale');
    expect(remind).toHaveBeenCalledWith('a1', 'u1');
  });

  it('shows an error on the row when the reminder fails', async () => {
    fetchMock.mockResolvedValueOnce(ok({ staleApps: [APP] }));
    remind.mockRejectedValueOnce(new Error('boom'));
    render(<StaleApplicationsPanel />);
    fireEvent.click(await screen.findByRole('button', { name: 'Send reminder to Dana Diaz' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to send reminder');
    expect(screen.getByRole('button', { name: 'Send reminder to Dana Diaz' })).toBeEnabled();
  });

  it('says so when nothing is stale, and when the list fails to load', async () => {
    fetchMock.mockResolvedValueOnce(ok({ staleApps: [] }));
    render(<StaleApplicationsPanel />);
    expect(await screen.findByText('No applications have been pending for more than 3 days.')).toBeInTheDocument();
    cleanup();

    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) } as Response);
    render(<StaleApplicationsPanel />);
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load stale applications");
  });
});
