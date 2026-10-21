import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement } from 'react';
import messages from '@/messages/en.json';
import ResumeStudioClient from '@/components/portal/ResumeStudioClient';
import { VoiceStudioKit } from '@/components/portal/kit/pages/VoiceStudioKit';
import { ResumeLoadNotice } from '@/components/portal/ResumeLoadNotice';

const mocks = vi.hoisted(() => ({
  router: { refresh: vi.fn(), replace: vi.fn(), push: vi.fn(), prefetch: vi.fn() },
  params: new URLSearchParams(),
  startSession: vi.fn(),
  microphone: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => mocks.router,
  usePathname: () => '/dashboard/ai-tools',
  useSearchParams: () => mocks.params,
}));
vi.mock('@elevenlabs/client', () => ({ Conversation: { startSession: mocks.startSession } }));
vi.mock('@/lib/analytics/events', () => ({ trackAIToolRun: vi.fn(), trackToolLaunch: vi.fn() }));
vi.mock('@/app/(portal)/dashboard/ai-tools/resume-rewriter/ResumeRewriterClient', () => ({ default: () => <p>Rewrite workspace</p> }));

const notice = messages.empty.resumeLoad;
function wrapper(ui: ReactElement) {
  return <NextIntlClientProvider locale="en" messages={messages}>{ui}</NextIntlClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.params = new URLSearchParams('tab=studio&agent=resume&source=dashboard');
  vi.stubGlobal('fetch', vi.fn());
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: mocks.microphone } });
  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
    matches: false, media: query, onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(),
    addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
  })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Resume Studio recovery', () => {
  it('disables duplicate retries while the refresh transition is pending', async () => {
    let finish: () => void = () => {};
    const pending = new Promise<void>((resolve) => { finish = resolve; });
    mocks.router.refresh.mockImplementationOnce(() => pending);
    render(wrapper(<ResumeLoadNotice status="unavailable" />));
    fireEvent.click(screen.getByRole('button', { name: notice.retry }));
    const retry = screen.getByRole('button', { name: notice.retrying });
    expect(retry).toBeDisabled();
    fireEvent.click(retry);
    expect(mocks.router.refresh).toHaveBeenCalledOnce();
    await act(async () => { finish(); await pending; });
    expect(screen.getByRole('button', { name: notice.retry })).toBeEnabled();
  });

  it('renders a failed hub check as an alert rather than upload instructions and refreshes the same tab', () => {
    const view = render(wrapper(<VoiceStudioKit initialTab="studio" initialAgent="resume" resumeStudio={{ hasResume: false, loadStatus: 'unavailable' }} />));
    expect(screen.getByRole('alert')).toHaveTextContent(notice.unavailable.title);
    expect(screen.queryByText('No resume on file')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Add résumé' })).toBeNull();
    expect(screen.getByRole('radio', { name: 'Resume' })).toBeChecked();
    expect(screen.getByRole('link', { name: notice.openStudio })).toHaveAttribute('href', '/dashboard/ai-tools/resume-studio');

    fireEvent.click(screen.getByRole('button', { name: notice.retry }));
    expect(mocks.router.refresh).toHaveBeenCalledOnce();
    expect(mocks.router.replace).not.toHaveBeenCalled();
    expect(mocks.router.push).not.toHaveBeenCalled();
    expect(mocks.params.toString()).toBe('tab=studio&agent=resume&source=dashboard');

    view.rerender(wrapper(<VoiceStudioKit initialTab="studio" initialAgent="resume" resumeStudio={{ hasResume: true, loadStatus: 'available', structuralScore: 72 }} />));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('radio', { name: 'Resume' })).toBeChecked();
    expect(screen.getByRole('img', { name: 'Structure score 72 of 100' })).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.startSession).not.toHaveBeenCalled();
    expect(mocks.microphone).not.toHaveBeenCalled();
  });

  it('keeps a second failed retry honest and available without triggering a provider action', () => {
    const failed = <VoiceStudioKit initialTab="studio" resumeStudio={{ hasResume: false, loadStatus: 'unavailable' }} />;
    const view = render(wrapper(failed));
    fireEvent.click(screen.getByRole('button', { name: notice.retry }));
    view.rerender(wrapper(<VoiceStudioKit initialTab="studio" resumeStudio={{ hasResume: false, loadStatus: 'unavailable' }} />));
    expect(screen.getByRole('alert')).toHaveTextContent(notice.unavailable.title);
    expect(screen.getByRole('button', { name: notice.retry })).toBeEnabled();
    expect(screen.queryByText('No resume on file')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.startSession).not.toHaveBeenCalled();
  });

  it('preserves the actual score-editor node and draft across retry and recovered server props', () => {
    mocks.params = new URLSearchParams('view=score&source=member');
    const view = render(wrapper(<ResumeStudioClient hasResume={false} loadStatus="unavailable" preview />));
    const editor = screen.getByRole('textbox', { name: 'Resume' });
    expect(screen.getByRole('heading', { name: notice.unavailable.title, level: 2 })).toBeInTheDocument();
    fireEvent.change(editor, { target: { value: 'My unsaved résumé draft stays here while the saved-file check is retried.' } });
    expect(screen.queryByText(messages.resumeStudio.emptyTitle)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: notice.retry }));
    expect(mocks.router.refresh).toHaveBeenCalledOnce();
    expect(screen.getByRole('textbox', { name: 'Resume' })).toBe(editor);

    view.rerender(wrapper(<ResumeStudioClient hasResume loadStatus="available" preview initialResume="An older server value must not overwrite the draft." />));
    expect(screen.getByRole('textbox', { name: 'Resume' })).toBe(editor);
    expect(editor).toHaveValue('My unsaved résumé draft stays here while the saved-file check is retried.');
    expect(screen.getByRole('tab', { name: 'Score' })).toHaveAttribute('aria-selected', 'true');
    expect(mocks.params.toString()).toBe('view=score&source=member');
    expect(mocks.router.replace).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('keeps the Rewrite view selected when retrying its saved-file check', () => {
    mocks.params = new URLSearchParams('view=rewrite&source=member');
    render(wrapper(<ResumeStudioClient hasResume={false} loadStatus="unavailable" />));
    fireEvent.click(screen.getByRole('button', { name: notice.retry }));
    expect(screen.getByRole('tab', { name: 'Rewrite' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Rewrite workspace')).toBeInTheDocument();
    expect(mocks.router.replace).not.toHaveBeenCalled();
    expect(mocks.params.toString()).toBe('view=rewrite&source=member');
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(['hub', 'dedicated'] as const)('shows confirmed absence only for the %s absence state', (surface) => {
    render(wrapper(surface === 'hub'
      ? <VoiceStudioKit initialTab="studio" resumeStudio={{ hasResume: false, loadStatus: 'absent' }} />
      : <ResumeStudioClient hasResume={false} loadStatus="absent" preview />));
    expect(screen.getByRole('heading', { name: /No resume on file/ })).toBeInTheDocument();
    expect(screen.queryByText(notice.unavailable.title)).toBeNull();
    expect(screen.queryByRole('button', { name: notice.retry })).toBeNull();
  });

  it.each(['hub', 'dedicated'] as const)('does not retry storage or show an upload instruction in a %s audit', (surface) => {
    render(wrapper(surface === 'hub'
      ? <VoiceStudioKit initialTab="studio" resumeStudio={{ hasResume: false, loadStatus: 'audit-suppressed' }} />
      : <ResumeStudioClient hasResume={false} loadStatus="audit-suppressed" preview />));
    expect(screen.getByRole('heading', { name: notice.audit.title })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /No resume on file/ })).toBeNull();
    expect(screen.queryByRole('button', { name: notice.retry })).toBeNull();
    expect(mocks.router.refresh).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('shows a pending hub read without calling it absent or starting a second read', () => {
    render(wrapper(<VoiceStudioKit initialTab="studio" resumeStudio={{ hasResume: false, loadStatus: 'not-loaded' }} />));
    const region = screen.getByRole('region', { name: 'Resume' });
    expect(within(region).getByRole('heading', { name: notice.loading.title })).toBeInTheDocument();
    expect(region.querySelector('[data-resume-load-status="not-loaded"]')).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByRole('heading', { name: /No resume on file/ })).toBeNull();
    expect(mocks.router.refresh).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not create an error or retry surface for an available résumé', () => {
    const { container } = render(wrapper(<ResumeLoadNotice status="available" />));
    expect(container).toBeEmptyDOMElement();
    expect(mocks.router.refresh).not.toHaveBeenCalled();
  });
});
