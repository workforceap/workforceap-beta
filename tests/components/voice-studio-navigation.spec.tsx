import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import Link from 'next/link';
import { RouterContext } from 'next/dist/shared/lib/router-context.shared-runtime';
import type { NextRouter } from 'next/router';
import en from '@/messages/en.json';
import { pickPortalClientMessages } from '@/lib/i18n/pickRootClientMessages';
import { readCss, loadRootTokens, colorOf, contrast, splitTopLevel } from '@/lib/ui/cssTokenContrast.test-helpers';
import {
  VoiceStudioKit,
  type VoiceStudioAgentKey,
  type VoiceStudioKitProps,
} from '@/components/portal/kit/pages/VoiceStudioKit';

const { navigation, startSession } = vi.hoisted(() => ({
  navigation: { router: { replace: vi.fn() }, params: new URLSearchParams() },
  startSession: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => navigation.router,
  usePathname: () => '/dashboard/ai-tools',
  useSearchParams: () => navigation.params,
}));
vi.mock('@elevenlabs/client', () => ({ Conversation: { startSession } }));

// Vitest resolves next/link's installed client entry, which uses RouterContext.
// Exercise that real Link's onNavigate/click guards rather than calling callbacks.
const linkRouter: NextRouter = {
  basePath: '', pathname: '/dashboard/ai-tools', route: '/dashboard/ai-tools', asPath: '/dashboard/ai-tools', query: {},
  push: vi.fn().mockResolvedValue(true), replace: vi.fn().mockResolvedValue(true),
  reload: vi.fn(), back: vi.fn(), forward: vi.fn(), beforePopState: vi.fn(), prefetch: vi.fn().mockResolvedValue(undefined),
  events: { on: vi.fn(), off: vi.fn(), emit: vi.fn() }, isFallback: false, isReady: true, isPreview: false, isLocaleDomain: false,
};

beforeEach(() => {
  navigation.params = new URLSearchParams('source=dashboard');
  window.history.replaceState(null, '', '/dashboard/ai-tools?source=dashboard');
  startSession.mockReset();
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ signedUrl: 'wss://voice.example.test/session' })));
  vi.stubGlobal('navigator', {
    mediaDevices: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] }) },
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

function hub(props: VoiceStudioKitProps = {}) {
  return <RouterContext.Provider value={linkRouter}>
    <NextIntlClientProvider locale="en" messages={pickPortalClientMessages(en)}>
      <Link href="#main-content" prefetch={false}>Skip to content</Link>
      <VoiceStudioKit {...props} />
    </NextIntlClientProvider>
  </RouterContext.Provider>;
}

function mount(props: VoiceStudioKitProps = {}, query = 'source=dashboard') {
  navigation.params = new URLSearchParams(query);
  window.history.replaceState(null, '', `/dashboard/ai-tools?${query}`);
  linkRouter.asPath = `/dashboard/ai-tools?${query}`;
  return render(hub(props));
}

function navigate(view: ReturnType<typeof mount>, query: string, props: VoiceStudioKitProps = {}) {
  navigation.params = new URLSearchParams(query);
  window.history.replaceState(null, '', `/dashboard/ai-tools?${query}`);
  linkRouter.asPath = `/dashboard/ai-tools?${query}`;
  view.rerender(hub(props));
}

function expectPracticeCoach(label: string) {
  expect(screen.getByRole('radio', { name: 'Practice' })).toBeChecked();
  expect(within(screen.getByRole('region', { name: 'Practice' }))
    .getByRole('heading', { name: label })).toBeInTheDocument();
}

function conversation() {
  return { endSession: vi.fn().mockResolvedValue(undefined), setMicMuted: vi.fn(), getInputVolume: () => 0, getOutputVolume: () => 0 };
}

async function startActiveConversation() {
  const client = conversation();
  startSession.mockImplementationOnce(async (options) => {
    options.onConnect();
    return client;
  });
  fireEvent.click(screen.getByRole('button', { name: /^start session$/i }));
  await screen.findByRole('button', { name: /^end session$/i });
  return client;
}

describe('same-page AI Tools navigation', () => {
  it('keeps Resume Studio banner and coach text readable across their gradients in either theme', () => {
    mount({ initialTab: 'studio', resumeStudio: { hasResume: true, structuralScore: 76, issues: [] } }, 'tab=studio');
    const region = screen.getByRole('region', { name: 'Resume' });
    const banner = within(region).getByRole('heading', { name: 'Resume Studio' }).parentElement!.parentElement!;
    const coach = within(region).getByRole('link', { name: /resume coach.*start voice session/i });
    const palette = loadRootTokens(readCss('css/wa-brand-tokens.css'), readCss('css/portal-tokens.css'));

    for (const panel of [banner, coach]) {
      const background = panel.style.background;
      const stops = splitTopLevel(background.slice(background.indexOf('(') + 1, -1)).slice(1);
      expect(stops).toHaveLength(2);
      const foregrounds = [panel, ...panel.querySelectorAll<HTMLElement>('[style]')]
        .map((element) => element.style.color).filter(Boolean);
      for (const scheme of ['light', 'dark'] as const) {
        const [start, end] = stops.map((stop) => colorOf(stop, palette, scheme));
        for (let step = 0; step <= 10; step++) {
          const t = step / 10;
          const sample = { r: start.r * (1 - t) + end.r * t, g: start.g * (1 - t) + end.g * t, b: start.b * (1 - t) + end.b * t, a: 1 };
          for (const foreground of foregrounds) {
            expect(contrast(colorOf(foreground, palette, scheme), sample), `${scheme} ${foreground} at ${step * 10}%`).toBeGreaterThanOrEqual(4.5);
          }
        }
      }
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it('opens the real Resume coach destination without remounting the hub', () => {
    const resumeStudio = { hasResume: true, structuralScore: 76, issues: [] };
    const view = mount({ initialTab: 'studio', initialAgent: 'mock', resumeStudio }, 'tab=studio&agent=mock&source=dashboard');
    const link = within(screen.getByRole('region', { name: 'Resume' }))
      .getByRole('link', { name: /resume coach.*start voice session/i });
    expect(link).toHaveAttribute('href', '/dashboard/ai-tools/studio?tab=session&agent=resume');

    // The legacy route redirects here; Next retains this client component.
    navigate(view, 'tab=session&agent=resume&source=dashboard', { initialTab: 'session', initialAgent: 'resume', resumeStudio });
    expectPracticeCoach('Resume Coach');
    expect(navigation.router.replace).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    ['readiness', 'Readiness Coach'],
    ['resume', 'Resume Coach'],
    ['mock', 'Mock Interview'],
    ['counselor', 'Lilley · AI career coach'],
    ['business', 'Career & Business Coach'],
  ] as [VoiceStudioAgentKey, string][])('applies an incoming %s deep link to the existing component', (key, label) => {
    const view = mount();
    navigate(view, `tab=session&agent=${key}&source=dashboard`, { initialTab: 'session', initialAgent: key });
    expectPracticeCoach(label);
    expect(navigation.router.replace).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('follows tab and coach changes through back and forward navigation without replacing history', () => {
    const view = mount({ initialTab: 'session', initialAgent: 'resume' }, 'tab=session&agent=resume&source=dashboard');
    navigate(view, 'tab=toolkit&agent=counselor&source=dashboard', { initialTab: 'toolkit', initialAgent: 'counselor' });
    expect(screen.getByRole('region', { name: 'All Tools' })).toBeInTheDocument();
    navigate(view, 'tab=studio&agent=counselor&source=dashboard', { initialTab: 'studio', initialAgent: 'counselor' });
    expect(screen.getByRole('region', { name: 'Resume' })).toBeInTheDocument();
    navigate(view, 'tab=session&agent=resume&source=dashboard', { initialTab: 'session', initialAgent: 'resume' });
    expectPracticeCoach('Resume Coach');
    navigate(view, 'tab=session&agent=business&source=dashboard', { initialTab: 'session', initialAgent: 'business' });
    expectPracticeCoach('Career & Business Coach');
    navigate(view, 'tab=session&agent=resume&source=dashboard', { initialTab: 'session', initialAgent: 'resume' });
    expectPracticeCoach('Resume Coach');
    expect(navigation.router.replace).not.toHaveBeenCalled();
  });

  it('uses the configured fallback after navigation removes an explicit coach', async () => {
    const fallback = { sessionEndpoint: '/api/test/custom-voice', sessionPayload: { context: 'synthetic' } };
    const view = mount({ ...fallback, initialTab: 'session', initialAgent: 'resume' }, 'tab=session&agent=resume&source=dashboard');
    navigate(view, 'tab=session&source=dashboard', { ...fallback, initialTab: 'session' });
    expectPracticeCoach('Mock Interview');
    fireEvent.change(screen.getByRole('textbox', { name: /target role/i }), { target: { value: 'Support specialist' } });
    await startActiveConversation();
    expect(fetch).toHaveBeenCalledWith('/api/test/custom-voice', expect.objectContaining({
      body: JSON.stringify({ context: 'synthetic', role: 'Support specialist', interviewType: 'behavioral' }),
    }));
    fireEvent.click(screen.getByRole('radio', { name: 'All Tools' }));
    const url = new URL(navigation.router.replace.mock.lastCall![0], 'https://workforceap.org');
    expect(url.searchParams.has('agent')).toBe(false);
    expect(url.searchParams.get('source')).toBe('dashboard');
  });

  it('keeps the newest local tab and coach while earlier router acknowledgements arrive', () => {
    const view = mount();
    fireEvent.click(screen.getByRole('button', { name: /Resume Coach/ }));
    const practiceQuery = new URL(navigation.router.replace.mock.lastCall![0], 'https://workforceap.org').search.slice(1);
    fireEvent.click(screen.getByRole('radio', { name: 'All Tools' }));
    const toolkitQuery = new URL(navigation.router.replace.mock.lastCall![0], 'https://workforceap.org').search.slice(1);

    navigate(view, practiceQuery, { initialTab: 'session', initialAgent: 'resume' });
    expect(screen.getByRole('region', { name: 'All Tools' })).toBeInTheDocument();
    navigate(view, toolkitQuery, { initialTab: 'toolkit', initialAgent: 'resume' });
    expect(screen.getByRole('region', { name: 'All Tools' })).toBeInTheDocument();
    expect(navigation.router.replace).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole('radio', { name: 'Practice' }));
    expectPracticeCoach('Resume Coach');
    const url = new URL(navigation.router.replace.mock.lastCall![0], 'https://workforceap.org');
    expect(url.searchParams.get('agent')).toBe('resume');
    expect(url.searchParams.get('source')).toBe('dashboard');
  });

  it('accepts route props before search params without writing the URL back', () => {
    const view = mount();
    view.rerender(hub({ initialTab: 'session', initialAgent: 'resume' }));
    expectPracticeCoach('Resume Coach');
    navigate(view, 'tab=session&agent=resume&source=dashboard', { initialTab: 'session', initialAgent: 'resume' });
    expectPracticeCoach('Resume Coach');
    expect(navigation.router.replace).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('preserves the newest local choice when search params and older props arrive separately', () => {
    const view = mount();
    fireEvent.click(screen.getByRole('button', { name: /Resume Coach/ }));
    fireEvent.click(screen.getByRole('radio', { name: 'All Tools' }));
    const toolkitQuery = new URL(navigation.router.replace.mock.lastCall![0], 'https://workforceap.org').search.slice(1);

    navigate(view, toolkitQuery);
    expect(screen.getByRole('region', { name: 'All Tools' })).toBeInTheDocument();
    view.rerender(hub({ initialTab: 'session', initialAgent: 'resume' }));
    expect(screen.getByRole('region', { name: 'All Tools' })).toBeInTheDocument();
    view.rerender(hub({ initialTab: 'toolkit', initialAgent: 'resume' }));
    expect(screen.getByRole('region', { name: 'All Tools' })).toBeInTheDocument();
    expect(navigation.router.replace).toHaveBeenCalledTimes(2);
  });

  it('follows an older coach deep link after the latest local navigation has settled', () => {
    const view = mount();
    fireEvent.click(screen.getByRole('button', { name: /Resume Coach/ }));
    fireEvent.click(screen.getByRole('radio', { name: 'Coaches' }));
    fireEvent.click(screen.getByRole('button', { name: /Lilley · AI career coach/ }));
    expectPracticeCoach('Lilley · AI career coach');

    navigate(view, 'tab=session&agent=resume&source=dashboard', { initialTab: 'session', initialAgent: 'resume' });
    expectPracticeCoach('Lilley · AI career coach');
    navigate(view, 'agent=resume&source=dashboard', { initialTab: 'coaches', initialAgent: 'resume' });
    expectPracticeCoach('Lilley · AI career coach');
    navigate(view, 'tab=session&agent=counselor&source=dashboard', { initialTab: 'session', initialAgent: 'counselor' });
    expectPracticeCoach('Lilley · AI career coach');

    navigate(view, 'tab=session&agent=resume&source=dashboard', { initialTab: 'session', initialAgent: 'resume' });
    expectPracticeCoach('Resume Coach');
    expect(navigation.router.replace).toHaveBeenCalledTimes(3);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('allows Back to the received route even when the newest local request never acknowledges', () => {
    const view = mount();
    fireEvent.click(screen.getByRole('button', { name: /Resume Coach/ }));
    fireEvent.click(screen.getByRole('radio', { name: 'All Tools' }));
    expect(screen.getByRole('region', { name: 'All Tools' })).toBeInTheDocument();

    // Neither local replace reaches the router; Back cancels them both.
    act(() => window.dispatchEvent(new PopStateEvent('popstate')));
    navigate(view, 'source=dashboard');
    expect(screen.getByRole('radio', { name: 'Coaches' })).toBeChecked();
    expect(screen.getByRole('region', { name: 'Coaches' })).toBeInTheDocument();
    expect(navigation.router.replace).toHaveBeenCalledTimes(2);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('lets a new Resume coach link interrupt earlier pending choices', () => {
    const resumeStudio = { hasResume: true, structuralScore: 76, issues: [] };
    const view = mount({ resumeStudio });
    fireEvent.click(screen.getByRole('button', { name: /Resume Coach/ }));
    fireEvent.click(screen.getByRole('radio', { name: 'Resume' }));
    const link = within(screen.getByRole('region', { name: 'Resume' }))
      .getByRole('link', { name: /resume coach.*start voice session/i });
    fireEvent.click(link);
    expect(linkRouter.push).toHaveBeenCalledOnce();
    expect(vi.mocked(linkRouter.push).mock.calls[0][0]).toBe('/dashboard/ai-tools/studio?tab=session&agent=resume');
    navigate(view, 'tab=session&agent=resume', { initialTab: 'session', initialAgent: 'resume', resumeStudio });

    expectPracticeCoach('Resume Coach');
    expect(navigation.router.replace).toHaveBeenCalledTimes(2);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('applies Resume link intent when its destination matches an earlier received route exactly', () => {
    const resumeStudio = { hasResume: true, structuralScore: 76, issues: [] };
    const view = mount({ resumeStudio }, '');
    fireEvent.click(screen.getByRole('button', { name: /Resume Coach/ }));
    const practiceQuery = new URL(navigation.router.replace.mock.lastCall![0], 'https://workforceap.org').search.slice(1);
    fireEvent.click(screen.getByRole('radio', { name: 'Resume' }));
    navigate(view, practiceQuery, { initialTab: 'session', initialAgent: 'resume', resumeStudio });
    expect(screen.getByRole('region', { name: 'Resume' })).toBeInTheDocument();

    fireEvent.click(within(screen.getByRole('region', { name: 'Resume' }))
      .getByRole('link', { name: /resume coach.*start voice session/i }));
    expect(linkRouter.push).toHaveBeenCalledOnce();
    expectPracticeCoach('Resume Coach');
    navigate(view, practiceQuery, { initialTab: 'session', initialAgent: 'resume', resumeStudio });
    expectPracticeCoach('Resume Coach');
    expect(navigation.router.replace).toHaveBeenCalledTimes(2);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('allows Back to an earlier acknowledged coach when the newest local tab request is canceled', () => {
    const view = mount();
    fireEvent.click(screen.getByRole('button', { name: /Resume Coach/ }));
    const practiceQuery = new URL(navigation.router.replace.mock.lastCall![0], 'https://workforceap.org').search.slice(1);
    fireEvent.click(screen.getByRole('radio', { name: 'All Tools' }));
    navigate(view, practiceQuery, { initialTab: 'session', initialAgent: 'resume' });
    expect(screen.getByRole('region', { name: 'All Tools' })).toBeInTheDocument();

    act(() => window.dispatchEvent(new PopStateEvent('popstate')));
    view.rerender(hub({ initialTab: 'session', initialAgent: 'resume' }));
    expectPracticeCoach('Resume Coach');
    expect(navigation.router.replace).toHaveBeenCalledTimes(2);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('keeps an optimistic live session when a hash-only link is activated', async () => {
    const view = mount();
    fireEvent.click(screen.getByRole('button', { name: /Resume Coach/ }));
    const client = await startActiveConversation();
    fireEvent.click(screen.getByRole('link', { name: 'Skip to content' }));
    expect(linkRouter.push).toHaveBeenCalledOnce();
    view.rerender(hub());

    expectPracticeCoach('Resume Coach');
    expect(screen.getByRole('button', { name: /^end session$/i })).toBeEnabled();
    expect(client.endSession).not.toHaveBeenCalled();
    expect(navigation.router.replace).toHaveBeenCalledOnce();
  });

  it('keeps pending choices when a Resume coach link click is canceled', () => {
    const resumeStudio = { hasResume: true, structuralScore: 76, issues: [] };
    const view = mount({ resumeStudio });
    fireEvent.click(screen.getByRole('button', { name: /Resume Coach/ }));
    const practiceQuery = new URL(navigation.router.replace.mock.lastCall![0], 'https://workforceap.org').search.slice(1);
    fireEvent.click(screen.getByRole('radio', { name: 'Resume' }));
    const link = within(screen.getByRole('region', { name: 'Resume' }))
      .getByRole('link', { name: /resume coach.*start voice session/i });
    link.addEventListener('click', (event) => event.preventDefault(), { once: true });
    fireEvent.click(link);
    expect(linkRouter.push).not.toHaveBeenCalled();
    navigate(view, practiceQuery, { initialTab: 'session', initialAgent: 'resume', resumeStudio });

    expect(screen.getByRole('region', { name: 'Resume' })).toBeInTheDocument();
    expect(navigation.router.replace).toHaveBeenCalledTimes(2);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(['modified', 'new window', 'download'])('keeps pending choices for a %s Resume coach link click', (kind) => {
    const resumeStudio = { hasResume: true, structuralScore: 76, issues: [] };
    const view = mount({ resumeStudio });
    fireEvent.click(screen.getByRole('button', { name: /Resume Coach/ }));
    const practiceQuery = new URL(navigation.router.replace.mock.lastCall![0], 'https://workforceap.org').search.slice(1);
    fireEvent.click(screen.getByRole('radio', { name: 'Resume' }));
    const link = within(screen.getByRole('region', { name: 'Resume' }))
      .getByRole('link', { name: /resume coach.*start voice session/i });
    if (kind === 'new window') link.setAttribute('target', '_blank');
    if (kind === 'download') link.setAttribute('download', 'synthetic-resume.txt');
    // Cancel jsdom's browser default after the real Next Link has handled the click.
    document.addEventListener('click', (event) => event.preventDefault(), { once: true });
    fireEvent.click(link, { ctrlKey: kind === 'modified' });
    expect(linkRouter.push).not.toHaveBeenCalled();
    navigate(view, practiceQuery, { initialTab: 'session', initialAgent: 'resume', resumeStudio });

    expect(screen.getByRole('region', { name: 'Resume' })).toBeInTheDocument();
    expect(navigation.router.replace).toHaveBeenCalledTimes(2);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('preserves a same-coach live session when Back interrupts a pending local request', async () => {
    const view = mount();
    fireEvent.click(screen.getByRole('button', { name: /Resume Coach/ }));
    const practiceQuery = new URL(navigation.router.replace.mock.lastCall![0], 'https://workforceap.org').search.slice(1);
    const client = await startActiveConversation();
    window.history.replaceState(null, '', `/dashboard/ai-tools?${practiceQuery}`);
    act(() => window.dispatchEvent(new PopStateEvent('popstate')));
    navigate(view, practiceQuery, { initialTab: 'session', initialAgent: 'resume' });

    expectPracticeCoach('Resume Coach');
    expect(screen.getByRole('button', { name: /^end session$/i })).toBeEnabled();
    expect(client.endSession).not.toHaveBeenCalled();
    expect(startSession).toHaveBeenCalledOnce();
    expect(navigation.router.replace).toHaveBeenCalledOnce();
  });

  it('preserves the target-role draft on same-coach route updates', () => {
    const view = mount({ initialTab: 'session', initialAgent: 'mock' }, 'tab=session&agent=mock&source=dashboard');
    fireEvent.change(screen.getByRole('textbox', { name: /target role/i }), { target: { value: 'Cloud support associate' } });
    fireEvent.change(screen.getByRole('combobox', { name: /interview type/i }), { target: { value: 'technical' } });
    navigate(view, 'tab=session&agent=mock&source=refresh', { initialTab: 'session', initialAgent: 'mock' });
    expect(screen.getByRole('textbox', { name: /target role/i })).toHaveValue('Cloud support associate');
    expect(screen.getByRole('combobox', { name: /interview type/i })).toHaveValue('technical');
    expect(navigation.router.replace).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('preserves a same-coach live conversation, transcript and mute state', async () => {
    const view = mount({ initialTab: 'session', initialAgent: 'mock' }, 'tab=session&agent=mock&source=dashboard');
    const client = await startActiveConversation();
    act(() => startSession.mock.calls[0][0].onMessage({ role: 'user', message: 'Synthetic practice answer' }));
    fireEvent.click(screen.getByRole('button', { name: /mute microphone/i }));

    navigate(view, 'tab=session&agent=mock&source=refresh', { initialTab: 'session', initialAgent: 'mock' });
    expectPracticeCoach('Mock Interview');
    expect(screen.getByRole('button', { name: /^end session$/i })).toBeEnabled();
    expect(screen.getByText('Synthetic practice answer')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^unmute microphone$/i })).toHaveAttribute('aria-pressed', 'true');
    expect(client.endSession).not.toHaveBeenCalled();
    expect(startSession).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledOnce();
    expect(navigation.router.replace).not.toHaveBeenCalled();
  });

  it('ends the old conversation and starts the incoming coach at its own endpoint', async () => {
    const view = mount({ initialTab: 'session', initialAgent: 'mock' }, 'tab=session&agent=mock&source=dashboard');
    const client = await startActiveConversation();
    act(() => startSession.mock.calls[0][0].onMessage({ role: 'user', message: 'Old coach transcript' }));
    navigate(view, 'tab=session&agent=resume&source=dashboard', { initialTab: 'session', initialAgent: 'resume' });

    expect(client.endSession).toHaveBeenCalledOnce();
    expectPracticeCoach('Resume Coach');
    expect(screen.queryByText('Old coach transcript')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^start session$/i })).toBeEnabled();
    // Late old-coach callbacks cannot relabel or populate the new session.
    act(() => startSession.mock.calls[0][0].onMessage({ role: 'user', message: 'Late old coach message' }));
    expect(screen.queryByText('Late old coach message')).not.toBeInTheDocument();
    await startActiveConversation();
    expect(vi.mocked(fetch).mock.calls.map(([url]) => url)).toEqual(['/api/interview/session', '/api/member/resume-coach/session']);
  });

  it('resets only the session when its configured fallback endpoint changes', async () => {
    const view = mount({ initialTab: 'session', sessionEndpoint: '/api/test/first-voice' }, 'tab=session&source=dashboard');
    const client = await startActiveConversation();
    view.rerender(hub({ initialTab: 'session', sessionEndpoint: '/api/test/second-voice' }));
    expect(client.endSession).toHaveBeenCalledOnce();
    expectPracticeCoach('Mock Interview');
    expect(screen.getByRole('button', { name: /^start session$/i })).toBeEnabled();
    await startActiveConversation();
    expect(vi.mocked(fetch).mock.calls.map(([url]) => url)).toEqual(['/api/test/first-voice', '/api/test/second-voice']);
    expect(navigation.router.replace).not.toHaveBeenCalled();
  });

  it('aborts the pending old-coach request when the incoming coach changes', async () => {
    let requestSignal: AbortSignal | undefined;
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      requestSignal = init.signal as AbortSignal;
      requestSignal.addEventListener('abort', () => reject(requestSignal?.reason), { once: true });
    })));
    const view = mount({ initialTab: 'session', initialAgent: 'resume' }, 'tab=session&agent=resume&source=dashboard');
    fireEvent.click(screen.getByRole('button', { name: /^start session$/i }));
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    navigate(view, 'tab=session&agent=counselor&source=dashboard', { initialTab: 'session', initialAgent: 'counselor' });

    expect(requestSignal?.aborted).toBe(true);
    expectPracticeCoach('Lilley · AI career coach');
    expect(screen.getByRole('button', { name: /^start session$/i })).toBeEnabled();
    expect(startSession).not.toHaveBeenCalled();
  });

  it('ends an old client connection that resolves after the incoming coach changes', async () => {
    const client = conversation();
    let fulfill: (value: ReturnType<typeof conversation>) => void = () => {};
    startSession.mockImplementationOnce(() => new Promise((resolve) => { fulfill = resolve; }));
    const view = mount({ initialTab: 'session', initialAgent: 'resume' }, 'tab=session&agent=resume&source=dashboard');
    fireEvent.click(screen.getByRole('button', { name: /^start session$/i }));
    await waitFor(() => expect(startSession).toHaveBeenCalledOnce());
    navigate(view, 'tab=session&agent=business&source=dashboard', { initialTab: 'session', initialAgent: 'business' });
    await act(async () => { fulfill(client); });

    expect(client.endSession).toHaveBeenCalledOnce();
    expectPracticeCoach('Career & Business Coach');
    expect(screen.getByRole('button', { name: /^start session$/i })).toBeEnabled();
    expect(fetch).toHaveBeenCalledOnce();
  });
});
