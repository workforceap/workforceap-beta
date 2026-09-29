import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EmailCronsKit, type EmailCronRow } from '@/components/portal/kit/pages/admin-subviews/EmailCronsKit';

/**
 * WAP-193: enabling/disabling, dry-running and manually sending an email cron
 * used to exist only on /admin/email-crons?ui=legacy. The default roster now
 * carries them; Send now always confirms with the recipient count.
 */

const nav = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => nav }));
vi.mock('@/components/admin/ConfirmDialog', () => ({
  default: ({ open, body, confirmLabel, onConfirm }: { open: boolean; body: string; confirmLabel: string; onConfirm: () => void }) =>
    open ? (
      <div role="dialog" aria-label="Confirm">
        <p>{body}</p>
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

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;
const JOB: EmailCronRow = { id: 'weekly-recap', job: 'Weekly recap', schedule: 'Sun 6PM', lastRun: '3h ago', status: 'Success', enabled: true };
const props = { totalJobs: 1, enabled: 1, failing: 0, lastRun: '3h ago' };
const first = (name: string) => screen.getAllByRole('button', { name })[0];

describe('EmailCronsKit manageable', () => {
  it('disables a job through the toggle route', async () => {
    fetchMock.mockResolvedValueOnce(ok({ ok: true }));
    render(<EmailCronsKit jobs={[JOB]} {...props} manageable />);
    fireEvent.click(first('Disable Weekly recap'));
    await waitFor(() => expect(nav.refresh).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/email-crons/weekly-recap/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ enabled: false }),
    });
  });

  it('shows a dry run without sending anything', async () => {
    fetchMock.mockResolvedValueOnce(ok({ recipientCount: 12, subject: 'Your week', sampleRecipient: { email: 'a@example.org', name: null } }));
    render(<EmailCronsKit jobs={[JOB]} {...props} manageable />);
    fireEvent.click(first('Dry run Weekly recap'));
    expect(await screen.findByText(/Dry run: 12 recipients/)).toHaveTextContent('a@example.org');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/admin/email-crons/weekly-recap/dry-run');
  });

  it('confirms Send now with the recipient count before triggering', async () => {
    fetchMock.mockResolvedValueOnce(ok({ count: 12 })).mockResolvedValueOnce(ok({ ok: true, result: {} }));
    render(<EmailCronsKit jobs={[JOB]} {...props} manageable />);
    fireEvent.click(first('Send Weekly recap now'));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('12 recipients');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send now' }));
    await waitFor(() => expect(nav.refresh).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[1]).toEqual([
      '/api/admin/email-crons/weekly-recap/trigger',
      { method: 'POST', credentials: 'include' },
    ]);
  });

  it('shows a failed manual run', async () => {
    fetchMock.mockResolvedValueOnce(ok({ count: 1 })).mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({ ok: false, error: 'Unauthorized' }) } as Response);
    render(<EmailCronsKit jobs={[JOB]} {...props} manageable />);
    fireEvent.click(first('Send Weekly recap now'));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Send now' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Unauthorized');
    expect(nav.refresh).not.toHaveBeenCalled();
  });

  it('is read-only without the prop', () => {
    render(<EmailCronsKit jobs={[JOB]} {...props} />);
    expect(screen.queryByRole('button', { name: /Disable|Dry run|Send/ })).toBeNull();
  });
});
