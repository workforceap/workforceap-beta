import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import en from '@/messages/en.json';
import es from '@/messages/es.json';
import { TourProvider, useTour } from '@/components/onboarding/TourContext';
import { GuidedTour } from '@/components/portal/kit/GuidedTour';
import LegacyPortalTour from '@/components/onboarding/PortalTour';
import { MEMBER_PORTAL_TOUR_STEPS } from '@/lib/onboarding/portalTourSteps';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh }),
  usePathname: () => '/dashboard',
  useSearchParams: () => new URLSearchParams(),
}));

// member.home v3 (tours wave 3): all seven anchors are member shell chrome.
const MEMBER_ANCHORS = ['tour-dashboard', 'tour-programs', 'tour-jobs', 'tour-ai-tools', 'tour-messages', 'tour-account', 'tour-help'];

function Trigger({ tourKey, legacy }: { tourKey: string; legacy?: boolean }) {
  const { start, startTour } = useTour();
  return (
    <button
      type="button"
      data-testid="trigger"
      onClick={() => (legacy ? startTour(MEMBER_PORTAL_TOUR_STEPS, 'member') : start(tourKey))}
    >
      Start
    </button>
  );
}

function Harness({
  tourKey = 'member.home',
  anchors = MEMBER_ANCHORS,
  locale = 'en',
  legacy = false,
  Engine = GuidedTour,
}: {
  tourKey?: string;
  anchors?: string[];
  locale?: 'en' | 'es';
  legacy?: boolean;
  Engine?: React.ComponentType;
}) {
  const messages = { tours: (locale === 'es' ? es : en).tours };
  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <TourProvider>
        <Trigger tourKey={tourKey} legacy={legacy} />
        {anchors.map((a) => (
          <div key={a} data-tour={a}>
            {a}
          </div>
        ))}
        <Engine />
      </TourProvider>
    </NextIntlClientProvider>
  );
}

type Posted = { url: string; body: Record<string, unknown> };
const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));

function posted(): Posted[] {
  return fetchMock.mock.calls.map((call) => {
    const [url, init] = call as unknown as [string, RequestInit | undefined];
    return { url: String(url), body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {} };
  });
}

function open(props: Parameters<typeof Harness>[0] = {}) {
  const utils = render(<Harness {...props} />);
  fireEvent.click(screen.getByTestId('trigger'));
  return utils;
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockClear();
  refresh.mockClear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('GuidedTour (kit engine)', () => {
  it('opens an aria-modal dialog on the first anchored step with i18n chrome and records STARTED', async () => {
    open();
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-labelledby', 'wa-guided-tour-title');
    expect(dialog).toHaveAttribute('aria-describedby', 'wa-guided-tour-body');
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Your home base');
    expect(dialog).toHaveTextContent('Step 1 of 7');
    expect(dialog).toHaveTextContent(/My program in the menu/);
    expect(screen.getByRole('button', { name: 'Skip tour' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Close tour' })).toBeInTheDocument();
    await waitFor(() => expect(posted()).toHaveLength(1));
    expect(posted()[0]).toEqual({
      url: '/api/tours/member.home',
      body: { version: 3, status: 'STARTED', lastStep: 0, sourcePage: '/' },
    });
    expect(screen.getByTestId('guided-tour-dialog')).toHaveAttribute('data-tour-step', '1');
  });

  it('renders Spanish chrome and step copy under the es catalogue', async () => {
    open({ locale: 'es' });
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Paso 1 de 7');
    expect(screen.getByRole('button', { name: 'Omitir el recorrido' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Tu punto de partida');
  });

  it('moves focus to the primary action and announces each step through the live region', async () => {
    open();
    const next = await screen.findByRole('button', { name: 'Next' });
    await waitFor(() => expect(document.activeElement).toBe(next));
    await waitFor(() =>
      expect(document.querySelector('[role="status"][aria-live="polite"]')).toHaveTextContent(
        'Tour step 1 of 7: Your home base',
      ),
    );
    fireEvent.click(next);
    await waitFor(() => expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Training progress'));
    await waitFor(() =>
      expect(document.querySelector('[role="status"][aria-live="polite"]')).toHaveTextContent(
        'Tour step 2 of 7: Training progress',
      ),
    );
  });

  it('Escape dismisses through the kit escape stack, persists DISMISSED and restores focus to the trigger', async () => {
    render(<Harness />);
    // A real click focuses the trigger on mousedown; jsdom's fireEvent.click does not.
    const trigger = screen.getByTestId('trigger');
    trigger.focus();
    fireEvent.click(trigger);
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(screen.getByRole('dialog')).toHaveTextContent('Step 2 of 7'));
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(posted().some((p) => p.body.status === 'DISMISSED')).toBe(true));
    const dismissed = posted().find((p) => p.body.status === 'DISMISSED')!;
    expect(dismissed.url).toBe('/api/tours/member.home');
    expect(dismissed.body).toMatchObject({ version: 3, lastStep: 1 });
    expect(document.activeElement).toBe(trigger);
    // Legacy tour-complete is NOT written on a dismissal.
    expect(posted().some((p) => p.url === '/api/onboarding/tour-complete')).toBe(false);
  });

  it('Skip tour persists DISMISSED instead of silently closing', async () => {
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Skip tour' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(posted().map((p) => p.body.status)).toEqual(['STARTED', 'DISMISSED']));
  });

  it('clicking the scrim dismisses like Escape', async () => {
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Close tour' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(posted().map((p) => p.body.status)).toEqual(['STARTED', 'DISMISSED']));
  });

  it('Done on the last step writes COMPLETED, the legacy per-portal timestamp, and refreshes', async () => {
    open();
    await screen.findByRole('dialog');
    for (let i = 0; i < 6; i++) {
      fireEvent.click(screen.getByRole('button', { name: 'Next' }));
      await waitFor(() => expect(screen.getByRole('dialog')).toHaveTextContent(`Step ${i + 2} of 7`));
    }
    const done = screen.getByRole('button', { name: 'Done' });
    expect(screen.getByRole('button', { name: 'Back' })).toBeEnabled();
    await act(async () => {
      fireEvent.click(done);
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() =>
      expect(posted().map((p) => [p.url, p.body.status ?? p.body.portal])).toEqual([
        ['/api/tours/member.home', 'STARTED'],
        ['/api/tours/member.home', 'COMPLETED'],
        ['/api/onboarding/tour-complete', 'member'],
      ]),
    );
    expect(posted()[1].body).toMatchObject({ version: 3, lastStep: 6 });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('keeps Tab inside the popover (focus trap) and Back returns a step', async () => {
    open();
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(screen.getByRole('dialog')).toHaveTextContent('Step 2 of 7'));
    const back = screen.getByRole('button', { name: 'Back' });
    const next = screen.getByRole('button', { name: 'Next' });
    next.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(back);
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(next);
    fireEvent.click(back);
    await waitFor(() => expect(screen.getByRole('dialog')).toHaveTextContent('Step 1 of 7'));
  });

  it('skips steps whose data-tour anchor is missing', async () => {
    open({ anchors: ['tour-jobs', 'tour-account'] });
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Find a job'));
    expect(dialog).toHaveTextContent('Step 3 of 7');
    const spotlight = screen.getByTestId('guided-tour-spotlight');
    expect(spotlight).toHaveAttribute('aria-hidden');
  });

  it('completes silently when no anchor on the page matches', async () => {
    open({ anchors: [] });
    await waitFor(() => expect(posted().some((p) => p.body.status === 'COMPLETED')).toBe(true));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('ignores unknown registry keys', () => {
    open({ tourKey: 'counselor.nope' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('legacy startTour(steps, portal) still opens the member tour and maps onto member.home', async () => {
    open({ legacy: true });
    await screen.findByRole('dialog');
    await waitFor(() => expect(posted()[0]).toMatchObject({ url: '/api/tours/member.home', body: { status: 'STARTED', version: 3 } }));
  });

  it('components/onboarding/PortalTour stays a working re-export of the kit engine', async () => {
    open({ Engine: LegacyPortalTour });
    expect(await screen.findByRole('dialog')).toHaveAttribute('aria-modal', 'true');
  });

  it('paints chrome with --wa-* tokens only, kit CTA classes and the --z-tour layer', async () => {
    open();
    await screen.findByRole('dialog');
    const root = document.querySelector('[data-kit="guided-tour"]') as HTMLElement;
    expect(root).not.toBeNull();
    const styled = [root, ...Array.from(root.querySelectorAll<HTMLElement>('[style]'))];
    const inline = styled.map((el) => el.getAttribute('style') ?? '').join('\n');
    expect(inline).toMatch(/var\(--wa-surface\)/);
    expect(inline).toMatch(/var\(--wa-text\)/);
    expect(inline).toMatch(/var\(--wa-accent\)/);
    expect(inline).not.toMatch(/--color-|--surface-container|rgba\(|#[0-9a-fA-F]{3,8}\b/);
    const classes = styled.map((el) => el.className).join(' ');
    expect(classes).toMatch(/wa-z-\[var\(--z-tour\)\]/);
    for (const name of ['Back', 'Skip tour', 'Next']) {
      expect(screen.getByRole('button', { name })).toHaveClass('wa-kit-cta');
    }
    expect(screen.getByRole('button', { name: 'Skip tour' })).toHaveClass('wa-kit-cta--ghost');
    const dialogStyle = screen.getByTestId('guided-tour-dialog').getAttribute('style') ?? '';
    const overlayStyle = screen.getByTestId('guided-tour-overlay').getAttribute('style') ?? '';
    expect(dialogStyle).toMatch(/var\(--wa-shadow-lg\)/);
    expect(overlayStyle).toMatch(/color-mix\(in srgb, var\(--wa-text\)/);
  });
});
