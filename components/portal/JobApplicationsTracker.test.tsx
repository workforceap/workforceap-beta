import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import messages from '@/messages/en.json';
import { JOB_APPLICATIONS_EMPTY } from '@/lib/member/jobApplicationsEmptyState';
import JobApplicationsTracker from './JobApplicationsTracker';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/dashboard/job-applications',
  useSearchParams: () => new URLSearchParams(),
}));

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function show() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <JobApplicationsTracker userId="user-1" />
    </NextIntlClientProvider>,
  );
}

/**
 * Formerly asserted by reading the component source in
 * lib/member/jobApplicationsEmptyState.test.ts: the empty tracker is a kit
 * empty state carrying the shared copy and kit CTAs, with no legacy
 * `--color-*` tokens in the rendered output.
 */
describe('JobApplicationsTracker empty state', () => {
  it('renders the shared empty copy through KitEmptyState with kit CTAs', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify([]), { status: 200, headers: { 'content-type': 'application/json' } }));

    const { container } = show();
    const heading = await screen.findByRole('heading', { name: JOB_APPLICATIONS_EMPTY.title });
    expect(fetchMock).toHaveBeenCalledWith('/api/member/job-applications');

    const shell = heading.parentElement as HTMLElement;
    expect(shell.closest('.wa-kit-card')).not.toBeNull();
    expect(within(shell).getByText(JOB_APPLICATIONS_EMPTY.description).className).toContain('wa-kit-lede');

    const add = within(shell).getByRole('button', { name: JOB_APPLICATIONS_EMPTY.primaryCta.label });
    expect(add.className).toContain('wa-kit-cta');
    const browse = within(shell).getByRole('link', { name: messages.dashboard.browseJobs });
    expect(browse.getAttribute('href')).toBe(JOB_APPLICATIONS_EMPTY.secondaryCta.href);
    expect(browse.className).toContain('wa-kit-cta--ghost');

    expect(container.innerHTML).not.toMatch(/--color-on-surface|--color-accent/);
  });

  it('surfaces a load failure as an alert instead of silently showing an empty tracker', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: 'nope' }), { status: 500, headers: { 'content-type': 'application/json' } }));

    show();
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBeTruthy();
    expect(alert.style.color).toBe('var(--wa-danger)');
  });
});
