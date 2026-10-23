import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import en from '@/messages/en.json';

// No useRouter: a tab change is a client-side URL update (history.replaceState), never an RSC navigation.
const nav = vi.hoisted(() => ({ params: new URLSearchParams(), pathname: '/dashboard/resume' }));
vi.mock('next/navigation', () => ({ usePathname: () => nav.pathname, useSearchParams: () => nav.params }));
vi.mock('next/dynamic', () => ({ default: () => () => <p>Full coach workspace</p> }));
vi.mock('@/components/portal/tools/ResumeStrengthForm', () => ({ default: () => <textarea aria-label="Scored text" defaultValue="Saved revised resume" /> }));
vi.mock('@/components/portal/tools/ResumeRewriterForm', () => ({ default: () => <textarea aria-label="Rewrite text" defaultValue="Original resume" /> }));
vi.mock('@/app/(portal)/dashboard/ai-tools/resume-rewriter/ResumeRewriterClient', () => ({ default: () => <textarea aria-label="Rewrite text" defaultValue="Original resume" /> }));
import ResumeStudioClient from '@/components/portal/ResumeStudioClient';

function Files({ active }: { active?: boolean }) {
  const [name, setName] = useState('Original file');
  return <div data-testid="file-manager" data-active={active}><input aria-label="Original file label" value={name} onChange={event => setName(event.target.value)} /><a href="/original.pdf">Download original</a><a href="/revised.pdf">Download revised</a></div>;
}
const workspace = () => <NextIntlClientProvider locale="en" messages={en}><ResumeStudioClient hasResume filesSlot={<Files />} basePath="/dashboard/resume" scoreHistorySlot={<p>Score history</p>} rewriteHistorySlot={<p>Rewrite history</p>} /></NextIntlClientProvider>;
let replaceState: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  nav.params = new URLSearchParams('source=history&regenerateFrom=run-old');
  nav.pathname = '/dashboard/resume';
  replaceState = vi.spyOn(window.history, 'replaceState').mockImplementation(() => undefined);
});
afterEach(() => { cleanup(); replaceState.mockRestore(); });

const lastHref = () => replaceState.mock.calls.at(-1)![2] as string;

function navigate(view: ReturnType<typeof render>, name: string) {
  fireEvent.click(screen.getByRole('tab', { name }));
  nav.params = new URL(lastHref(), 'https://example.test').searchParams;
  view.rerender(workspace());
}

describe('one Resume workspace', () => {
  it('mounts one file manager, preserves both files and separate Score/Rewrite drafts across views', () => {
    const view = render(workspace());
    expect(screen.getAllByTestId('file-manager')).toHaveLength(1);
    fireEvent.change(screen.getByRole('textbox', { name: 'Original file label' }), { target: { value: 'My original' } });
    navigate(view, 'Score');
    fireEvent.change(screen.getByRole('textbox', { name: 'Scored text' }), { target: { value: 'Edited score context' } });
    expect(screen.getByText('Score history')).toBeVisible();
    navigate(view, 'Rewrite');
    fireEvent.change(screen.getByRole('textbox', { name: 'Rewrite text' }), { target: { value: 'Independent rewrite draft' } });
    expect(screen.getByText('Rewrite history')).toBeVisible();
    navigate(view, 'Score');
    expect(screen.getByRole('textbox', { name: 'Scored text' })).toHaveValue('Edited score context');
    navigate(view, 'Rewrite');
    expect(screen.getByRole('textbox', { name: 'Rewrite text' })).toHaveValue('Independent rewrite draft');
    navigate(view, 'My resume');
    expect(screen.getAllByTestId('file-manager')).toHaveLength(1);
    expect(screen.getByRole('textbox', { name: 'Original file label' })).toHaveValue('My original');
    expect(screen.getByRole('link', { name: 'Download original' })).toHaveAttribute('href', '/original.pdf');
    expect(screen.getByRole('link', { name: 'Download revised' })).toHaveAttribute('href', '/revised.pdf');
    expect(nav.params.get('regenerateFrom')).toBe('run-old');
    expect(nav.params.get('source')).toBe('history');
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
  });
  it('supports arrow-key tab navigation and retains the full coach destination', () => {
    const view = render(workspace());
    const files = screen.getByRole('tab', { name: 'My resume' });
    files.focus();
    fireEvent.keyDown(files, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Score' })).toHaveFocus();
    expect(replaceState).toHaveBeenLastCalledWith(null, '', expect.stringContaining('view=score'));
    navigate(view, 'Coach');
    expect(within(screen.getByRole('tabpanel')).getByText('Full coach workspace')).toBeVisible();
    expect(screen.getByTestId('file-manager')).toHaveAttribute('data-active', 'false');
  });

  it('updates the URL once per tab change: focus then click is one update, the selected tab is none', () => {
    render(workspace());
    fireEvent.click(screen.getByRole('tab', { name: 'My resume' }));
    expect(replaceState).not.toHaveBeenCalled();

    const score = screen.getByRole('tab', { name: 'Score' });
    fireEvent.focus(score);
    fireEvent.click(score);
    expect(replaceState).toHaveBeenCalledTimes(1);
    expect(replaceState).toHaveBeenCalledWith(null, '', '/dashboard/resume?source=history&regenerateFrom=run-old&view=score');
  });

  it('keeps the explicit locale prefix when switching tabs, and adds none when the URL has none', () => {
    nav.pathname = '/es/dashboard/resume';
    const view = render(workspace());
    fireEvent.click(screen.getByRole('tab', { name: 'Score' }));
    expect(lastHref()).toBe('/es/dashboard/resume?source=history&regenerateFrom=run-old&view=score');
    view.unmount();

    replaceState.mockClear();
    nav.pathname = '/dashboard/resume';
    render(workspace());
    fireEvent.click(screen.getByRole('tab', { name: 'Score' }));
    expect(lastHref()).toBe('/dashboard/resume?source=history&regenerateFrom=run-old&view=score');
  });

  it('gives each visible tab panel one h2 so the headings under it never skip a level', () => {
    const view = render(workspace());
    expect(screen.getAllByRole('heading', { level: 2 }).map(h => h.textContent)).toEqual(['My resume']);
    for (const [tab, heading] of [['Score', 'Score'], ['Rewrite', 'Rewrite'], ['Coach', 'Coach']] as const) {
      navigate(view, tab);
      expect(screen.getAllByRole('heading', { level: 2 }).map(h => h.textContent)).toEqual([heading]);
    }
  });
});
