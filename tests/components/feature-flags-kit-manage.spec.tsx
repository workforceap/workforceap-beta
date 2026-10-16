import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FeatureFlagsKit, type FeatureFlagRow } from '@/components/portal/kit/pages/admin-subviews/FeatureFlagsKit';

/**
 * WAP-193: rollout %, role gating, delete and create for feature flags used
 * to exist only on /admin/feature-flags?ui=legacy. The default registry now
 * carries them.
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
  // jsdom lacks <dialog> showModal/close; Astryx Dialog needs both when open.
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function showModal() {
      this.setAttribute('open', '');
    };
  }
  if (!HTMLDialogElement.prototype.close) {
    HTMLDialogElement.prototype.close = function close() {
      this.removeAttribute('open');
    };
  }
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const ok = (body: unknown = {}) => ({ ok: true, status: 200, json: async () => body }) as Response;
const FLAG: FeatureFlagRow = {
  id: 'f1',
  name: 'Coursera v2',
  key: 'coursera-v2',
  description: '—',
  enabled: true,
  rolloutPercentage: 25,
  allowedRoles: ['admin'],
  updated: 'Sep 24',
};
const props = { total: 1, on: 1, off: 0, recentlyChanged: 0 };
const first = (name: string) => screen.getAllByRole('button', { name })[0];

describe('FeatureFlagsKit manageable', () => {
  it('saves rollout % and roles through the PATCH route', async () => {
    fetchMock.mockResolvedValueOnce(ok({ flag: {} }));
    render(<FeatureFlagsKit flags={[FLAG]} {...props} manageable />);
    fireEvent.change(screen.getAllByLabelText('Rollout %')[0], { target: { value: '60' } });
    fireEvent.click(screen.getAllByRole('checkbox', { name: 'counselor' })[0]);
    fireEvent.click(first('Save Coursera v2'));
    await waitFor(() => expect(nav.refresh).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/feature-flags/f1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rolloutPercentage: 60, allowedRoles: ['admin', 'counselor'] }),
    });
  });

  it('rejects an out-of-range rollout without calling the API', () => {
    render(<FeatureFlagsKit flags={[FLAG]} {...props} manageable />);
    fireEvent.change(screen.getAllByLabelText('Rollout %')[0], { target: { value: '140' } });
    fireEvent.click(first('Save Coursera v2'));
    expect(screen.getAllByRole('alert')[0]).toHaveTextContent('0 to 100');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('deletes only after confirmation', async () => {
    fetchMock.mockResolvedValueOnce(ok());
    render(<FeatureFlagsKit flags={[FLAG]} {...props} manageable />);
    fireEvent.click(first('Delete Coursera v2'));
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete flag' }));
    await waitFor(() => expect(nav.refresh).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/feature-flags/f1', { method: 'DELETE' });
  });

  it('creates a flag from the New flag modal and shows the route error on failure', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 409, json: async () => ({ error: 'Key already exists' }) } as Response);
    render(<FeatureFlagsKit flags={[]} {...{ ...props, total: 0, on: 0 }} manageable />);
    // One opener CTA — empty state no longer duplicates "Create a flag" (UI-23).
    expect(screen.queryByRole('link', { name: 'Create a flag' })).toBeNull();
    fireEvent.click(screen.getAllByRole('button', { name: 'New flag' })[0]);
    const dialog = await screen.findByRole('dialog', { name: 'New feature flag' });
    const form = within(dialog).getByRole('button', { name: 'Create flag' }).closest('form')!;
    fireEvent.change(within(form).getByLabelText('Key'), { target: { value: ' new-nav ' } });
    fireEvent.change(within(form).getByLabelText('Name'), { target: { value: 'New nav' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Create flag' }));
    expect(await within(form).findByRole('alert')).toHaveTextContent('Key already exists');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toEqual({
      key: 'new-nav',
      name: 'New nav',
      enabled: false,
      rolloutPercentage: 0,
      allowedRoles: [],
    });
  });

  it('keeps the legacy links without the prop', () => {
    render(<FeatureFlagsKit flags={[FLAG]} {...props} />);
    expect(screen.queryByRole('button', { name: /Save|Delete|Create flag|New flag/ })).toBeNull();
    expect(screen.getByRole('link', { name: 'Manage' })).toHaveAttribute('href', '/admin/feature-flags?ui=legacy');
  });
});
