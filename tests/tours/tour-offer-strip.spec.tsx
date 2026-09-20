import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import en from '@/messages/en.json';
import es from '@/messages/es.json';
import { TourProvider } from '@/components/onboarding/TourContext';
import { GuidedTour } from '@/components/portal/kit/GuidedTour';
import TourOfferStrip from '@/components/onboarding/TourOfferStrip';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/counselor/today',
  useSearchParams: () => new URLSearchParams(),
}));

type Posted = { url: string; body: Record<string, unknown> };
const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
const posted = (): Posted[] =>
  fetchMock.mock.calls.map((call) => {
    const [url, init] = call as unknown as [string, RequestInit | undefined];
    return { url: String(url), body: init?.body ? JSON.parse(String(init.body)) : {} };
  });

function Page({ locale = 'en' }: { locale?: 'en' | 'es' }) {
  return (
    <NextIntlClientProvider locale={locale} messages={{ tours: (locale === 'es' ? es : en).tours }}>
      <TourProvider>
        <TourOfferStrip tourKey="counselor.home" />
        <div data-tour="tour-today-attention">tiles</div>
        <GuidedTour />
      </TourProvider>
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
});

describe('TourOfferStrip (first-login offer)', () => {
  it('renders the counselor offer as a labelled region with kit CTAs and no live region', () => {
    render(<Page />);
    const strip = screen.getByTestId('tour-offer-strip');
    expect(strip).toHaveAttribute('data-tour-key', 'counselor.home');
    expect(screen.getByRole('region', { name: /two-minute tour/ })).toBe(strip);
    expect(strip).toHaveTextContent(/what needs attention today, how to open a member, how to message them and where notes live/);
    expect(screen.getByRole('button', { name: 'Take the tour' })).toHaveClass('wa-kit-cta');
    expect(screen.getByRole('button', { name: 'Not now' })).toHaveClass('wa-kit-cta--ghost');
    expect(strip).not.toHaveAttribute('aria-live');
    const inline = [strip, ...Array.from(strip.querySelectorAll<HTMLElement>('[style]'))].map((el) => el.getAttribute('style') ?? '').join('\n');
    expect(inline).toMatch(/var\(--wa-accent-soft\)/);
    expect(inline).not.toMatch(/--color-|--surface-container|#[0-9a-fA-F]{3,8}\b/);
  });

  it('renders Spanish copy under the es catalogue', () => {
    render(<Page locale="es" />);
    expect(screen.getByRole('button', { name: 'Hacer el recorrido' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ahora no' })).toBeInTheDocument();
    expect(screen.getByTestId('tour-offer-strip')).toHaveTextContent(/recorrido de dos minutos/);
  });

  it('Take the tour starts counselor.home and hides the strip', async () => {
    render(<Page />);
    fireEvent.click(screen.getByRole('button', { name: 'Take the tour' }));
    expect(await screen.findByRole('dialog')).toHaveTextContent('What needs attention today');
    expect(screen.queryByTestId('tour-offer-strip')).toBeNull();
    await waitFor(() => expect(posted()[0]).toEqual({
      url: '/api/tours/counselor.home',
      body: { version: 1, status: 'STARTED', lastStep: 0, sourcePage: '/' },
    }));
  });

  it('Not now persists DISMISSED at step 0 so the strip never returns, and opens no tour', async () => {
    render(<Page />);
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(screen.queryByTestId('tour-offer-strip')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(posted()).toEqual([
      { url: '/api/tours/counselor.home', body: { version: 1, status: 'DISMISSED', lastStep: 0, sourcePage: '/' } },
    ]));
  });
});
