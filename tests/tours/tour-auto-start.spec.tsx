import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import en from '@/messages/en.json';
import TourProviderWrapper from '@/components/onboarding/TourProviderWrapper';
import { TOUR_DEEP_LINK_DELAY_MS, TOUR_QUERY_PARAM } from '@/components/onboarding/TourAutoStart';

let search = '';
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/employer',
  useSearchParams: () => new URLSearchParams(search),
}));

const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));

function Page() {
  return (
    <NextIntlClientProvider locale="en" messages={{ tours: en.tours }}>
      <TourProviderWrapper>
        <div data-tour="tour-overview">overview</div>
        <div data-tour="tour-jobs">jobs</div>
      </TourProviderWrapper>
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockClear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  search = '';
});

describe('TourAutoStart (?tour=<key>)', () => {
  it('exposes the documented query parameter', () => {
    expect(TOUR_QUERY_PARAM).toBe('tour');
    expect(TOUR_DEEP_LINK_DELAY_MS).toBeGreaterThan(0);
  });

  it('starts the registered tour named in the URL once anchors have had time to mount', async () => {
    search = 'tour=employer.home';
    render(<Page />);
    expect(screen.queryByRole('dialog')).toBeNull();
    const dialog = await screen.findByRole('dialog', {}, { timeout: TOUR_DEEP_LINK_DELAY_MS + 1500 });
    expect(dialog).toHaveTextContent('Your dashboard');
    expect(dialog).toHaveTextContent('Step 1 of 8');
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/tours/employer.home');
    expect(JSON.parse(String(init.body))).toMatchObject({ status: 'STARTED', version: 2 });
  });

  it('ignores unknown keys and never writes state', async () => {
    search = 'tour=admin.home';
    render(<Page />);
    await new Promise((r) => setTimeout(r, TOUR_DEEP_LINK_DELAY_MS + 100));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does nothing without the parameter (existing auto-start behaviour untouched)', async () => {
    render(<Page />);
    await new Promise((r) => setTimeout(r, TOUR_DEEP_LINK_DELAY_MS + 100));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
