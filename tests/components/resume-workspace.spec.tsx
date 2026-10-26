import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import en from '@/messages/en.json';
import es from '@/messages/es.json';

const nav = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock('next/navigation', async () => {
  const { useSyncExternalStore } = await import('react');
  return {
    useRouter: () => ({ replace: nav.replace }),
    useSearchParams: () => new URLSearchParams(useSyncExternalStore(
      listener => {
        window.addEventListener('popstate', listener);
        return () => window.removeEventListener('popstate', listener);
      },
      () => window.location.search,
    )),
  };
});
vi.mock('next/dynamic', () => ({ default: () => () => <p>Full coach workspace</p> }));
vi.mock('@/components/portal/tools/ResumeStrengthForm', () => ({ default: () => <textarea aria-label="Scored text" defaultValue="Saved revised resume" /> }));
vi.mock('@/components/portal/tools/ResumeRewriterForm', () => ({ default: () => <textarea aria-label="Rewrite text" defaultValue="Original resume" /> }));
vi.mock('@/app/(portal)/dashboard/ai-tools/resume-rewriter/ResumeRewriterClient', () => ({ default: () => <textarea aria-label="Rewrite text" defaultValue="Original resume" /> }));
vi.mock('@/lib/analytics/events', () => ({ trackFunnelEvent: vi.fn() }));
import ResumeStudioClient from '@/components/portal/ResumeStudioClient';
import ResumeClient from '@/app/(portal)/dashboard/resume/ResumeClient';

function Files({ active }: { active?: boolean }) {
  const [name, setName] = useState('Original file');
  return <div data-testid="file-manager" data-active={active}><input aria-label="Original file label" value={name} onChange={event => setName(event.target.value)} /><a href="/original.pdf">Download original</a><a href="/revised.pdf">Download revised</a></div>;
}
const workspace = (locale: 'en' | 'es' = 'en') => <NextIntlClientProvider locale={locale} messages={locale === 'es' ? es : en}><ResumeStudioClient hasResume filesSlot={<Files />} basePath="/dashboard/resume" scoreHistorySlot={<p>Score history</p>} rewriteHistorySlot={<p>Rewrite history</p>} /></NextIntlClientProvider>;
beforeEach(() => {
  window.history.replaceState(null, '', '/dashboard/resume?source=history&regenerateFrom=run-old');
  nav.replace.mockReset();
  const pushState = window.history.pushState.bind(window.history);
  // Model Next's native-history subscription with jsdom's real history stack.
  vi.spyOn(window.history, 'pushState').mockImplementation((data, unused, url) => {
    pushState(data, unused, url);
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function navigate(name: string) {
  fireEvent.click(screen.getByRole('tab', { name }));
}

describe('one Resume workspace', () => {
  it('updates file availability after a first upload and later empty status without remounting drafts', async () => {
    let storedResume = false;
    const onAvailability = vi.fn();
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url === '/api/member/resume/upload') {
        storedResume = true;
        return Response.json({});
      }
      return Response.json({
        hasOriginal: storedResume,
        hasEnhanced: false,
        originalUrl: storedResume ? 'https://example.test/original.txt' : null,
        originalExt: storedResume ? 'txt' : null,
      });
    }));
    render(<NextIntlClientProvider locale="en" messages={en}>
      <ResumeStudioClient hasResume={false} filesSlot={<ResumeClient
        completeness={20}
        witData={{ name: 'Synthetic Member', email: 'member@example.test', phone: '', recentEmployer: '', targetJob: '', skills: '' }}
        hasOriginal={false}
        hasEnhanced={false}
        onResumeAvailabilityChange={onAvailability}
      />} />
    </NextIntlClientProvider>);
    await screen.findByText(/Drag and drop your resume here/);
    navigate('Score');
    expect(screen.getByText(en.resumeStudio.emptyTitle)).toBeVisible();
    const scoreDraft = screen.getByRole('textbox', { name: 'Scored text' });
    fireEvent.change(scoreDraft, { target: { value: 'Independent score edits' } });
    navigate('Rewrite');
    const rewriteDraft = screen.getByRole('textbox', { name: 'Rewrite text' });
    fireEvent.change(rewriteDraft, { target: { value: 'Independent rewrite edits' } });
    navigate('My resume');
    const beforeUploadUrl = window.location.href;
    const beforeUploadEntries = vi.mocked(window.history.pushState).mock.calls.length;
    const input = document.getElementById('resume-upload-input') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['Synthetic resume'], 'resume.txt', { type: 'text/plain' })] } });
    // The already-mounted, hidden Score panel updates immediately; no tab switch
    // or server navigation is needed to clear its stale no-resume warning.
    await waitFor(() => expect(screen.queryByText(en.resumeStudio.emptyTitle)).not.toBeInTheDocument());
    await waitFor(() => expect(input).toBeEnabled());
    expect(onAvailability).toHaveBeenCalledWith(true);
    expect(window.location.href).toBe(beforeUploadUrl);
    expect(window.history.pushState).toHaveBeenCalledTimes(beforeUploadEntries);
    expect(nav.replace).not.toHaveBeenCalled();
    expect(scoreDraft).toBeInTheDocument();
    expect(scoreDraft).toHaveValue('Independent score edits');
    expect(rewriteDraft).toBeInTheDocument();
    expect(rewriteDraft).toHaveValue('Independent rewrite edits');

    // There is no removal control here. A later authoritative empty status read
    // must still propagate if files were removed elsewhere.
    storedResume = false;
    navigate('Score');
    navigate('My resume');
    await waitFor(() => expect(screen.getByText(en.resumeStudio.emptyTitle)).toBeInTheDocument());
    expect(onAvailability).toHaveBeenLastCalledWith(false);
    expect(scoreDraft).toBeInTheDocument();
    expect(scoreDraft).toHaveValue('Independent score edits');
    expect(rewriteDraft).toHaveValue('Independent rewrite edits');
  });

  it('mounts one file manager, preserves both files and separate Score/Rewrite drafts across views', () => {
    render(workspace());
    expect(screen.getAllByTestId('file-manager')).toHaveLength(1);
    fireEvent.change(screen.getByRole('textbox', { name: 'Original file label' }), { target: { value: 'My original' } });
    navigate('Score');
    fireEvent.change(screen.getByRole('textbox', { name: 'Scored text' }), { target: { value: 'Edited score context' } });
    expect(screen.getByText('Score history')).toBeVisible();
    navigate('Rewrite');
    fireEvent.change(screen.getByRole('textbox', { name: 'Rewrite text' }), { target: { value: 'Independent rewrite draft' } });
    expect(screen.getByText('Rewrite history')).toBeVisible();
    navigate('Score');
    expect(screen.getByRole('textbox', { name: 'Scored text' })).toHaveValue('Edited score context');
    navigate('Rewrite');
    expect(screen.getByRole('textbox', { name: 'Rewrite text' })).toHaveValue('Independent rewrite draft');
    navigate('My resume');
    expect(screen.getAllByTestId('file-manager')).toHaveLength(1);
    expect(screen.getByRole('textbox', { name: 'Original file label' })).toHaveValue('My original');
    expect(screen.getByRole('link', { name: 'Download original' })).toHaveAttribute('href', '/original.pdf');
    expect(screen.getByRole('link', { name: 'Download revised' })).toHaveAttribute('href', '/revised.pdf');
    expect(new URLSearchParams(window.location.search).get('regenerateFrom')).toBe('run-old');
    expect(new URLSearchParams(window.location.search).get('source')).toBe('history');
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
  });
  it('supports arrow-key tab navigation and retains the full coach destination', () => {
    render(workspace());
    const files = screen.getByRole('tab', { name: 'My resume' });
    files.focus();
    fireEvent.keyDown(files, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Score' })).toHaveFocus();
    expect(screen.getByRole('tab', { name: 'Score' })).toHaveAttribute('aria-selected', 'true');
    expect(window.location.search).toContain('view=score');
    expect(nav.replace).not.toHaveBeenCalled();
    navigate('Coach');
    expect(within(screen.getByRole('tabpanel')).getByText('Full coach workspace')).toBeVisible();
    expect(screen.getByTestId('file-manager')).toHaveAttribute('data-active', 'false');
  });

  it('coalesces pointer focus and click, ignores the selected tab, and preserves the Spanish URL context', () => {
    window.history.replaceState(null, '', '/es/dashboard/resume?source=history&regenerateFrom=run-old#editor');
    render(workspace('es'));
    const rewrite = screen.getByRole('tab', { name: 'Reescribir' });
    act(() => { rewrite.focus(); fireEvent.click(rewrite); });
    expect(window.history.pushState).toHaveBeenCalledTimes(1);
    expect(window.location.pathname).toBe('/es/dashboard/resume');
    expect(window.location.hash).toBe('#editor');
    expect(new URLSearchParams(window.location.search)).toEqual(new URLSearchParams('source=history&regenerateFrom=run-old&view=rewrite'));
    fireEvent.click(rewrite);
    expect(window.history.pushState).toHaveBeenCalledTimes(1);
    expect(window.history.pushState).toHaveBeenCalledWith(null, '', expect.any(String));
    expect(nav.replace).not.toHaveBeenCalled();
    expect(screen.getByText(es.memberWorkspace.resume.design.draftNotice)).toBeVisible();
  });

  it('restores the selected view and independent drafts through browser Back and Forward', async () => {
    render(workspace());
    navigate('Score');
    fireEvent.change(screen.getByRole('textbox', { name: 'Scored text' }), { target: { value: 'Score draft retained' } });
    navigate('Rewrite');
    fireEvent.change(screen.getByRole('textbox', { name: 'Rewrite text' }), { target: { value: 'Rewrite draft retained' } });
    navigate('Coach');
    act(() => window.history.back());
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Rewrite' })).toHaveAttribute('aria-selected', 'true'));
    expect(screen.getByRole('textbox', { name: 'Rewrite text' })).toHaveValue('Rewrite draft retained');
    act(() => window.history.back());
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Score' })).toHaveAttribute('aria-selected', 'true'));
    expect(screen.getByRole('textbox', { name: 'Scored text' })).toHaveValue('Score draft retained');
    act(() => window.history.forward());
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Rewrite' })).toHaveAttribute('aria-selected', 'true'));
    expect(screen.getByRole('textbox', { name: 'Rewrite text' })).toHaveValue('Rewrite draft retained');
    expect(window.history.pushState).toHaveBeenCalledTimes(3);
    expect(screen.getByText(en.memberWorkspace.resume.design.draftNotice)).toBeVisible();
  });
});
