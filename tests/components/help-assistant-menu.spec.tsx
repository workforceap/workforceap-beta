import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/counselor/today',
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const start = vi.fn(() => true);
vi.mock('@/components/onboarding/TourContext', () => ({
  useTour: () => ({ start, isOpen: false }),
}));

import PortalHelpMenu from '@/components/portal/PortalHelpMenu';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

const ON = {
  enabled: true,
  persona: 'counselor',
  homeRoute: '/counselor/today',
  guideHref: '/counselor/guide',
  tourKey: 'counselor.home',
  starters: ['whereAmI', 'howToMessage', 'whatCanIDo'],
};

describe('PortalHelpMenu with help_assistant_v1', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    start.mockClear();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('hides "Ask for help" when the availability check is 404 (flag off)', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'Not found' }, 404));
    render(<PortalHelpMenu tourKey="counselor.home" guideHref="/counselor/guide" />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(String(fetchMock.mock.calls[0][0])).toBe('/api/help/chat?pathname=%2Fcounselor%2Ftoday');

    fireEvent.click(screen.getByTestId('portal-help-trigger'));
    expect(screen.getByTestId('portal-help-take-tour')).toBeInTheDocument();
    expect(screen.queryByTestId('portal-help-ask-assistant')).toBeNull();
  });

  it('hides the entry when the availability request fails', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    render(<PortalHelpMenu tourKey="counselor.home" />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByTestId('portal-help-trigger'));
    expect(screen.queryByTestId('portal-help-ask-assistant')).toBeNull();
  });

  it('shows the entry when the flag is on, opens the drawer, and posts the question with route and locale', async () => {
    fetchMock.mockImplementation(async (input, init) => {
      if (init?.method === 'POST') {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        expect(body).toMatchObject({ question: 'Where is my roster?', pathname: '/counselor/today', language: 'en', history: [] });
        return jsonResponse({
          persona: 'counselor',
          answer: 'Open My members (/counselor/students).',
          links: [{ label: 'My members', href: '/counselor/students' }],
          source: 'model',
        });
      }
      expect(String(input)).toContain('/api/help/chat');
      return jsonResponse(ON);
    });

    render(<PortalHelpMenu tourKey="counselor.home" guideHref="/counselor/guide" />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByTestId('portal-help-trigger'));
    const entry = await screen.findByTestId('portal-help-ask-assistant');
    expect(entry).toHaveTextContent('help.askAssistant');

    fireEvent.click(entry);
    const panel = await screen.findByTestId('help-assistant-panel');
    expect(panel).toHaveAttribute('role', 'dialog');
    expect(screen.queryByTestId('portal-help-panel')).toBeNull();
    expect(screen.getByTestId('help-assistant-starters')).toBeInTheDocument();

    fireEvent.change(screen.getByTestId('help-assistant-input'), { target: { value: 'Where is my roster?' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('help-assistant-send'));
    });

    await screen.findByText('Open My members (/counselor/students).');
    expect(screen.getByRole('link', { name: 'My members' })).toHaveAttribute('href', '/counselor/students');
    expect(fetchMock).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByTestId('help-assistant-close'));
    expect(screen.queryByTestId('help-assistant-panel')).toBeNull();
  });

  it('portals the drawer onto document.body so the header backdrop-filter cannot clip it', async () => {
    fetchMock.mockResolvedValue(jsonResponse(ON));
    // The real shell renders the menu inside `header.workspace-shell-header`,
    // whose `backdrop-filter` makes it the containing block for fixed descendants.
    render(
      <header className="workspace-shell-header" data-testid="shell-header">
        <PortalHelpMenu tourKey="counselor.home" guideHref="/counselor/guide" />
      </header>,
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const header = screen.getByTestId('shell-header');
    const trigger = screen.getByTestId('portal-help-trigger');
    // The `tour-help` anchor stays in the header for the tour engine.
    expect(trigger).toHaveAttribute('data-tour', 'tour-help');
    expect(header.contains(trigger)).toBe(true);

    fireEvent.click(trigger);
    fireEvent.click(await screen.findByTestId('portal-help-ask-assistant'));
    const panel = await screen.findByTestId('help-assistant-panel');

    expect(document.body.contains(panel)).toBe(true);
    expect(header.contains(panel)).toBe(false);
    expect(panel.parentElement).toBe(document.body);
    expect(panel).toHaveAttribute('aria-modal', 'true');
    expect(panel).toHaveAttribute('aria-labelledby', panel.querySelector('h2')?.id);
    expect(panel.style.position).toBe('fixed');

    // Escape still closes the drawer and hands focus back to the header trigger.
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByTestId('help-assistant-panel')).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });

  it('keeps the draft and shows an alert when the server answers 429', async () => {
    fetchMock.mockImplementation(async (_input, init) =>
      init?.method === 'POST' ? jsonResponse({ error: 'Too many' }, 429) : jsonResponse(ON),
    );
    render(<PortalHelpMenu tourKey="counselor.home" />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByTestId('portal-help-trigger'));
    fireEvent.click(await screen.findByTestId('portal-help-ask-assistant'));

    const input = screen.getByTestId('help-assistant-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'How do I reply?' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('help-assistant-send'));
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('assistant.tooMany');
    expect((screen.getByTestId('help-assistant-input') as HTMLInputElement).value).toBe('How do I reply?');
  });
});
