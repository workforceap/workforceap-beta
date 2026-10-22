import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import en from '@/messages/en.json';

const nav = vi.hoisted(() => ({ params: new URLSearchParams(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: nav.replace }), useSearchParams: () => nav.params }));
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
beforeEach(() => { nav.params = new URLSearchParams('source=history&regenerateFrom=run-old'); nav.replace.mockReset(); });
afterEach(cleanup);

function navigate(view: ReturnType<typeof render>, name: string) {
  fireEvent.click(screen.getByRole('tab', { name }));
  const href = nav.replace.mock.calls.at(-1)![0] as string;
  nav.params = new URL(href, 'https://example.test').searchParams;
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
    expect(nav.replace).toHaveBeenLastCalledWith(expect.stringContaining('view=score'), { scroll: false });
    navigate(view, 'Coach');
    expect(within(screen.getByRole('tabpanel')).getByText('Full coach workspace')).toBeVisible();
    expect(screen.getByTestId('file-manager')).toHaveAttribute('data-active', 'false');
  });
});
