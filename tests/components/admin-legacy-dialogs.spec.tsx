import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import InviteForm from '@/components/admin/InviteForm';
import PartnerPayoutsPanel from '@/components/admin/PartnerPayoutsPanel';
import EmployerStatusButton from '@/app/admin/employers/EmployerStatusButton';
import { installNativeDialogStub } from '@/tests/helpers/nativeDialogStub';

// WAP-137 item 4: the remaining hand-rolled admin modals route through the
// Astryx Dialog (native <dialog>), so the scrim, focus trap, Escape and
// stacking order come from the design system instead of an inline rgba() div.

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/admin',
  useSearchParams: () => new URLSearchParams(),
}));

installNativeDialogStub();

const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function expectNativeModal(dialog: HTMLElement) {
  expect(dialog.tagName).toBe('DIALOG');
  expect(dialog).toHaveAttribute('aria-modal', 'true');
  expect(dialog).toHaveAttribute('open');
  // No hand-rolled scrim anywhere in the tree.
  expect(document.querySelector('[style*="rgba(0,0,0"]')).toBeNull();
  expect(document.querySelector('[role="dialog"]:not(dialog)')).toBeNull();
}

beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  // DataTable reads a media query for its dense/scroll layout.
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, media: '', onchange: null, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn() })));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('InviteForm', () => {
  it('is a native modal that closes on Escape and posts the invite as JSON', async () => {
    const onClose = vi.fn();
    const fetch = vi.fn().mockResolvedValue(response({ ok: true, emailSent: true }));
    vi.stubGlobal('fetch', fetch);
    render(<InviteForm subgroups={[]} programs={[{ slug: 'fixture', title: 'Fixture program' }]} partners={[]} onClose={onClose} />);

    const dialog = screen.getByRole('dialog', { name: 'Send Invite' });
    expectNativeModal(dialog);
    expect(within(dialog).getByRole('heading', { level: 2, name: 'Send Invite' })).toBeInTheDocument();

    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'New.Person@Example.com' } });
    fireEvent.change(screen.getByLabelText('Assign to program (for students)'), { target: { value: 'fixture' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send Invite' }));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/admin/invites');
    expect(JSON.parse(init.body as string)).toMatchObject({ email: 'new.person@example.com', role: 'member', programSlug: 'fixture' });
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(2));
  });

  it('keeps the manual-link fallback and blocks a second send while it is shown', async () => {
    const onClose = vi.fn();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ ok: true, emailSent: false, inviteUrl: 'https://example.test/invite/abc', warning: 'Email was not sent.' })));
    render(<InviteForm subgroups={[]} programs={[]} partners={[]} onClose={onClose} />);
    const dialog = screen.getByRole('dialog', { name: 'Send Invite' });
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'a@example.com' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send Invite' }));
    expect(await screen.findByText('Email was not sent.')).toBeInTheDocument();
    expect(screen.getByText('https://example.test/invite/abc')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Send Invite' })).toBeDisabled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Done' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('PartnerPayoutsPanel confirmation', () => {
  const row = { placementId: 'pl-1', memberName: 'Ada Lovelace', employerName: 'Acme', jobTitle: 'Technician', placedAt: null, paid: false, blockedReason: null };

  it('confirms through the shared native dialog and posts exactly one payout', async () => {
    const fetch = vi.fn().mockResolvedValue(response({ transferId: 'tr_1', amount: 50 }));
    vi.stubGlobal('fetch', fetch);
    render(<PartnerPayoutsPanel partnerId="p-1" rows={[row]} payoutAmountUsd={50} payoutsAvailable payoutsUnavailableReason={null} />);

    const trigger = screen.getByRole('button', { name: 'Send $50 payout' });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = screen.getByRole('dialog', { name: 'Send $50 payout?' });
    expectNativeModal(dialog);
    expect(dialog).toHaveTextContent("Ada Lovelace's placement at Acme");

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(dialog).not.toHaveAttribute('open');
    expect(trigger).toHaveFocus();
    expect(fetch).not.toHaveBeenCalled();

    fireEvent.click(trigger);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm payout' }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/partner/payout');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ partnerId: 'p-1', placementId: 'pl-1' });
    expect(await screen.findByRole('status')).toHaveTextContent('Sent $50 for Ada Lovelace');
    await act(async () => {});
    expect(dialog).not.toHaveAttribute('open');
  });
});

describe('EmployerStatusButton', () => {
  it('draws the approve action and its confirmation from the success token, not a hardcoded green', () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ ok: true })));
    render(<EmployerStatusButton employerId="e-1" status="pending_approval" />);
    const approve = screen.getByRole('button', { name: /approve/i });
    expect(approve.style.background).toBe('var(--wa-success-dark)');
    expect(approve.style.color).toBe('rgb(255, 255, 255)');
    expect(document.querySelector('[style*="#2d7a32"]')).toBeNull();
  });
});
