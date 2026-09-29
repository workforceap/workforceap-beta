import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EmailCronsKit, type EmailCronRow } from '@/components/portal/kit/pages/admin-subviews/EmailCronsKit';
import { EmailCronActivateAll } from '@/components/portal/kit/pages/admin-subviews/EmailCronActivateAll';

/**
 * WAP-193: "Activate all cron jobs" used to exist only on
 * /admin/email-crons?ui=legacy. The default roster now carries it, behind a
 * confirmation.
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

const JOB: EmailCronRow = { id: 'weekly-recap', job: 'Weekly recap', schedule: 'Sun 6PM', lastRun: '3h ago', status: 'Success', enabled: false };
const props = { totalJobs: 3, enabled: 1, failing: 0, lastRun: '3h ago' };

function renderKit(total = 3, enabled = 1) {
  render(<EmailCronsKit jobs={[JOB]} {...props} manageable headerAction={<EmailCronActivateAll total={total} enabled={enabled} />} />);
}

describe('EmailCronsKit Activate all', () => {
  it('confirms, then posts to activate-all and refreshes', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ ok: true, activated: 3 }) } as Response);
    renderKit();
    fireEvent.click(screen.getByRole('button', { name: 'Activate all' }));
    expect(fetchMock).not.toHaveBeenCalled();
    const dialog = screen.getByRole('dialog', { name: 'Confirm' });
    expect(dialog.textContent).toContain('This enables all 3 jobs (2 currently disabled).');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Activate all' }));
    await waitFor(() => expect(nav.refresh).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/email-crons/activate-all', { method: 'POST', credentials: 'include' });
  });

  it('shows the route error inline and does not refresh', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 403, json: async () => ({ error: 'Forbidden' }) } as Response);
    renderKit();
    fireEvent.click(screen.getByRole('button', { name: 'Activate all' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Activate all' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Forbidden');
    expect(nav.refresh).not.toHaveBeenCalled();
  });

  it('is disabled when every job is already enabled', () => {
    renderKit(3, 3);
    expect((screen.getByRole('button', { name: 'Activate all' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
