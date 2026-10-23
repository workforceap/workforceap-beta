import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import JobsListingClient from '@/app/(portal)/dashboard/jobs/JobsListingClient';
import en from '@/messages/en.json';

const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => '/dashboard/jobs',
  useSearchParams: () => new URLSearchParams('jobType=contract'),
}));

let desktop = false;
const listeners = new Set<() => void>();
const dialogDescriptors = new Map(['showModal', 'close'].map((method) => [method, Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, method)]));
const jobs = [{ id: 'synthetic-job', title: 'Sample support role', location: 'Remote', locationType: 'remote', jobType: 'contract', salaryMin: null, salaryMax: null, employer: { companyName: 'Sample employer', logoUrl: null } }];

beforeEach(() => {
  desktop = false;
  listeners.clear();
  router.push.mockClear();
  window.history.replaceState(null, '', '/dashboard/jobs?jobType=contract');
  vi.stubGlobal('matchMedia', () => ({
    get matches() { return desktop; },
    addEventListener: (_event: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_event: string, listener: () => void) => listeners.delete(listener),
  }));
  vi.stubGlobal('scrollTo', vi.fn());
  // jsdom has no native modal implementation; real focus/inertness is browser-verified.
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: function (this: HTMLDialogElement) { this.setAttribute('open', ''); } });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: function (this: HTMLDialogElement) { this.removeAttribute('open'); } });
});
afterEach(() => {
  cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals();
  for (const [method, descriptor] of dialogDescriptors) {
    if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, method, descriptor);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, method);
  }
});

function mount() {
  return render(<NextIntlClientProvider locale="en" messages={en}><JobsListingClient preview initialJobs={jobs} isAuthenticated /></NextIntlClientProvider>);
}

function openFilters() {
  const trigger = screen.getByRole('button', { name: /^Filters/ });
  trigger.focus();
  fireEvent.click(trigger);
  return { trigger, dialog: screen.getByRole('dialog', { name: 'Job filters' }) };
}

describe('member Jobs responsive filter dialog', () => {
  it('opens with a labeled search, preserves query parameters and input state across close/reopen', async () => {
    mount();
    const { dialog } = openFilters();
    expect(screen.getByLabelText('Search jobs')).toHaveFocus();
    fireEvent.change(screen.getByLabelText('Location type'), { target: { value: 'remote' } });
    expect(window.location.search).toBe('?jobType=contract&locationType=remote');
    expect(router.push).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Filters (2)' })).toHaveFocus();
    openFilters();
    expect(screen.getByLabelText('Job type')).toHaveValue('contract');
    expect(screen.getAllByLabelText('Search jobs')).toHaveLength(1);
    expect(screen.getByRole('link', { name: /Sample support role/ })).toBeInTheDocument();
    await waitFor(() => expect(document.body.style.position).toBe('fixed'));
  });

  it('ignores an IME Escape, then closes on ordinary Escape and restores the trigger', () => {
    mount();
    const { trigger, dialog } = openFilters();
    fireEvent.keyDown(dialog, { key: 'Escape', isComposing: true });
    expect(dialog).toHaveAttribute('open');
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(document.body.style.position).toBe('');
  });

  it('backdrop dismisses while a pointer inside the filter content leaves it open', () => {
    mount();
    const { dialog } = openFilters();
    fireEvent.click(screen.getByLabelText('Search jobs'));
    expect(dialog).toHaveAttribute('open');
    fireEvent.click(dialog);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('moving to desktop unlocks scrolling and restores one inline control set without reopening on return', () => {
    mount();
    openFilters();
    act(() => { desktop = true; listeners.forEach((listener) => listener()); });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Job filters' })).toBeInTheDocument();
    expect(screen.getAllByLabelText('Search jobs')).toHaveLength(1);
    expect(document.body.style.position).toBe('');
    act(() => { desktop = false; listeners.forEach((listener) => listener()); });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Filters (1)' })).toHaveAttribute('aria-expanded', 'false');
  });
});
