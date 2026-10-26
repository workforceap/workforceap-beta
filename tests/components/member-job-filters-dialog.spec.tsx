import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import JobsListingClient from '@/app/(portal)/dashboard/jobs/JobsListingClient';
import en from '@/messages/en.json';

const router = vi.hoisted(() => ({ push: vi.fn() }));
const nav = vi.hoisted(() => ({ pathname: '/dashboard/jobs', query: 'jobType=contract' }));
vi.mock('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(nav.query),
}));

let desktop = false;
const listeners = new Set<() => void>();
const dialogDescriptors = new Map(['showModal', 'close'].map((method) => [method, Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, method)]));
const jobs = [{ id: 'synthetic-job', title: 'Sample support role', location: 'Remote', locationType: 'remote', jobType: 'contract', salaryMin: null, salaryMax: null, employer: { companyName: 'Sample employer', logoUrl: null } }];

beforeEach(() => {
  desktop = false;
  listeners.clear();
  router.push.mockClear();
  nav.pathname = '/dashboard/jobs';
  nav.query = 'jobType=contract';
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
  it('does not let an older live search response overwrite the cleared inventory', async () => {
    nav.query = 'view=openings&q=old';
    window.history.replaceState(null, '', `/dashboard/jobs?${nav.query}`);
    let resolveSearch!: (response: { json: () => Promise<typeof jobs> }) => void;
    const delayedSearch = new Promise<{ json: () => Promise<typeof jobs> }>((resolve) => { resolveSearch = resolve; });
    vi.stubGlobal('fetch', vi.fn((url: string) => url.startsWith('/api/dashboard/jobs') ? delayedSearch : Promise.resolve({ ok: true, json: async () => ({ jobs: [], jobIds: [] }) })));
    const baseline = [...jobs, { ...jobs[0], id: 'second-job', title: 'Second sample role' }];
    const { rerender } = render(<NextIntlClientProvider locale="en" messages={en}><JobsListingClient initialJobs={baseline} /></NextIntlClientProvider>);
    const { dialog } = openFilters();
    fireEvent.click(within(dialog).getByRole('button', { name: en.jobs.clearAllFilters }));
    nav.query = 'view=openings';
    rerender(<NextIntlClientProvider locale="en" messages={en}><JobsListingClient initialJobs={baseline} /></NextIntlClientProvider>);
    expect(screen.getByRole('link', { name: /Second sample role/ })).toBeInTheDocument();
    await act(async () => { resolveSearch({ json: async () => jobs }); });
    expect(screen.getByText('2 jobs found')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Second sample role/ })).toBeInTheDocument();
  });

  it.each(['view=openings', 'ui=legacy'])('clears live filters without leaving %s or changing bookmark behavior', async (viewQuery) => {
    nav.pathname = '/es/dashboard/jobs';
    nav.query = `${viewQuery}&context=returning&q=support&jobType=contract&sort=title`;
    window.history.replaceState(null, '', `${nav.pathname}?${nav.query}#open-roles`);
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => ({
      ok: true,
      json: async () => url.startsWith('/api/member/saved-jobs') && !init ? { jobIds: ['synthetic-job'] }
        : url.startsWith('/api/member/matched-jobs') ? { jobs: [] } : jobs,
    }));
    vi.stubGlobal('fetch', fetchMock);
    const baseline = [...jobs, { ...jobs[0], id: 'second-job', title: 'Second sample role' }];
    const ui = <NextIntlClientProvider locale="es" messages={en}><JobsListingClient initialJobs={baseline} isAuthenticated /></NextIntlClientProvider>;
    const { rerender } = render(ui);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Saved' })).toHaveAttribute('aria-pressed', 'true'));
    expect(screen.queryByRole('link', { name: /Second sample role/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Saved' }));
    expect(fetchMock).toHaveBeenCalledWith('/api/member/saved-jobs?jobId=synthetic-job', { method: 'DELETE' });
    const { dialog, trigger } = openFilters();
    fireEvent.click(within(dialog).getByRole('button', { name: en.jobs.clearAllFilters }));
    expect(router.push).toHaveBeenLastCalledWith(`/es/dashboard/jobs?${viewQuery}&context=returning#open-roles`);
    expect(screen.getByRole('searchbox', { name: en.jobs.searchJobs })).toHaveValue('');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(trigger).toHaveFocus();
    nav.query = `${viewQuery}&context=returning`;
    rerender(<NextIntlClientProvider locale="es" messages={en}><JobsListingClient initialJobs={baseline} isAuthenticated /></NextIntlClientProvider>);
    await waitFor(() => expect(screen.getByRole('link', { name: /Second sample role/ })).toBeInTheDocument());
  });

  it('keeps search on the page and focuses the first refinement, preserving query parameters across close/reopen', async () => {
    mount();
    expect(screen.getByRole('searchbox', { name: 'Search jobs' })).toBeInTheDocument();
    const { dialog } = openFilters();
    expect(screen.getByLabelText('Program')).toHaveFocus();
    expect(within(dialog).queryByRole('searchbox')).toBeNull();
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
    fireEvent.click(screen.getByLabelText('Program'));
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
