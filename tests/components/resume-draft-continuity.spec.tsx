import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import en from '@/messages/en.json';
import { ResumeDraftProvider, ResumeDraftStatus, ResumeDraftReturnAction } from '@/components/portal/ResumeDraftContinuity';
import ResumeStrengthForm from '@/components/portal/tools/ResumeStrengthForm';
import ResumeRewriterForm from '@/components/portal/tools/ResumeRewriterForm';
import ResumeRewriterClient from '@/app/(portal)/dashboard/ai-tools/resume-rewriter/ResumeRewriterClient';
import { parseStudioDraft, studioDraftKey, STUDIO_DRAFT_MAX_AGE_MS } from '@/lib/resume/studioDraft';
import { purgePendingResumeDrafts } from '@/lib/resume/pendingResumeDraft';
import { SignOutButton } from '@/components/portal/SignOutButton';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

const wrap = (children: ReactNode, owner = 'member-a') => <NextIntlClientProvider locale="en" messages={en}><ResumeDraftProvider key={owner} ownerToken={owner}>{children}<ResumeDraftStatus /></ResumeDraftProvider></NextIntlClientProvider>;
const editors = <><ResumeStrengthForm preview /><ResumeRewriterForm preview initialResume="Original fixture resume" /></>;
const scoreInput = () => document.getElementById('resume-strength-body') as HTMLTextAreaElement;
const rewriteInput = () => document.getElementById('resume') as HTMLTextAreaElement;
beforeEach(() => sessionStorage.clear());
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('Resume workspace input recovery', () => {
  it('recovers separate inputs and every rewrite option after remount, without sending a request', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const first = render(wrap(editors));
    fireEvent.change(scoreInput(), { target: { value: 'Independent score draft' } });
    fireEvent.change(rewriteInput(), { target: { value: 'Independent rewrite draft' } });
    fireEvent.change(screen.getByLabelText('Target job title'), { target: { value: 'Network analyst' } });
    fireEvent.click(screen.getByText('Customize rewrite'));
    fireEvent.click(screen.getByRole('button', { name: 'Français' }));
    fireEvent.click(screen.getByRole('button', { name: 'executive' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'ATS keywords' }));
    fireEvent.change(screen.getByLabelText('Salary range (optional)'), { target: { value: '$80,000 - $100,000' } });
    fireEvent.change(screen.getByLabelText('City / location (optional)'), { target: { value: 'Atlanta' } });
    expect(screen.getByText(en.memberWorkspace.resume.design.draft.saved)).toBeInTheDocument();
    first.unmount();
    render(wrap(editors));
    await waitFor(() => expect(scoreInput()).toHaveValue('Independent score draft'));
    expect(rewriteInput()).toHaveValue('Independent rewrite draft');
    expect(screen.getByLabelText('Target job title')).toHaveValue('Network analyst');
    fireEvent.click(screen.getByText('Customize rewrite'));
    expect(screen.getByRole('button', { name: 'Français' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'executive' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('checkbox', { name: 'ATS keywords' })).not.toBeChecked();
    expect(screen.getByLabelText('Salary range (optional)')).toHaveValue('$80,000 - $100,000');
    expect(screen.getByLabelText('City / location (optional)')).toHaveValue('Atlanta');
    expect(screen.getByText(en.memberWorkspace.resume.design.draft.restored)).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('clears the saved copy while retaining current editor text, then restarts saving on the next edit', () => {
    const view = render(wrap(editors));
    fireEvent.change(scoreInput(), { target: { value: 'Keep this on screen' } });
    fireEvent.click(screen.getByRole('button', { name: 'Clear saved copy' }));
    expect(scoreInput()).toHaveValue('Keep this on screen');
    expect(sessionStorage.getItem(studioDraftKey('member-a'))).toBeNull();
    expect(screen.getByText(en.memberWorkspace.resume.design.draft.cleared)).toBeInTheDocument();
    fireEvent.change(scoreInput(), { target: { value: 'A new saved edit' } });
    view.unmount();
    render(wrap(editors));
    expect(scoreInput()).toHaveValue('A new saved edit');
  });

  it('does not cross accounts or preview scopes, and logout purges studio and coach drafts only', () => {
    const view = render(wrap(editors));
    fireEvent.change(scoreInput(), { target: { value: 'Private member A input' } });
    view.rerender(wrap(editors, 'member-b'));
    expect(scoreInput()).toHaveValue('');
    fireEvent.change(scoreInput(), { target: { value: 'Private member B input' } });
    view.rerender(wrap(editors, 'preview-member'));
    expect(scoreInput()).toHaveValue('');
    sessionStorage.setItem('wap:resume-coach:pending-draft:member-a', 'pending');
    sessionStorage.setItem('theme', 'dark');
    purgePendingResumeDrafts(sessionStorage);
    expect(sessionStorage.length).toBe(1);
    expect(sessionStorage.getItem('theme')).toBe('dark');
  });

  it.each(['{bad-json', JSON.stringify({ version: 1, ownerToken: 'member-a', savedAt: Date.now() - STUDIO_DRAFT_MAX_AGE_MS - 1, lastView: 'score', score: { resume: 'Expired private text' } })])('discards corrupt or expired recovery without displaying it', (raw) => {
    sessionStorage.setItem(studioDraftKey('member-a'), raw);
    render(wrap(editors));
    expect(scoreInput()).toHaveValue('');
    expect(sessionStorage.getItem(studioDraftKey('member-a'))).toBeNull();
    expect(screen.getByText(en.memberWorkspace.resume.design.draft.ready)).toBeInTheDocument();
  });

  it('reports blocked storage truthfully while keeping the editor usable', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Quota exceeded'); });
    render(wrap(editors));
    fireEvent.change(scoreInput(), { target: { value: 'Unsaved text still editable' } });
    expect(scoreInput()).toHaveValue('Unsaved text still editable');
    expect(screen.getByText(en.memberWorkspace.resume.design.draft.unavailable)).toBeInTheDocument();
    expect(screen.queryByText(en.memberWorkspace.resume.design.draft.saved)).not.toBeInTheDocument();
  });

  it('keeps Home continuation content-free and points to the last edited view', () => {
    const view = render(wrap(editors));
    fireEvent.change(rewriteInput(), { target: { value: 'Never expose this work history on Home' } });
    view.unmount();
    render(wrap(<ResumeDraftReturnAction ownerToken="member-a" resumeHref="/es/dashboard/resume?source=home#editor" />));
    expect(screen.getByRole('link', { name: 'Continue draft' })).toHaveAttribute('href', '/es/dashboard/resume?source=home&view=rewrite#editor');
    expect(screen.queryByText('Never expose this work history on Home')).not.toBeInTheDocument();
  });

  it('never fills over a user edit, even an intentional empty field, when the original arrives late', async () => {
    let resolve!: (value: unknown) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise(value => { resolve = value; })));
    render(wrap(<ResumeRewriterClient />));
    fireEvent.change(rewriteInput(), { target: { value: 'User started typing' } });
    fireEvent.change(rewriteInput(), { target: { value: '' } });
    await act(async () => resolve({ ok: true, json: async () => ({ hasOriginal: true, resumePlainText: 'Original on file' }) }));
    expect(rewriteInput()).toHaveValue('');
    expect(screen.queryByText(/Resume on file loaded/)).not.toBeInTheDocument();
  });

  it('merges late original prefill with target/options already edited and recovers the complete visible form', async () => {
    let resolve!: (value: unknown) => void;
    const fetchSpy = vi.fn(() => new Promise(value => { resolve = value; }));
    vi.stubGlobal('fetch', fetchSpy);
    const first = render(wrap(<ResumeRewriterClient />));
    fireEvent.change(screen.getByLabelText('Target job title'), { target: { value: 'Security analyst' } });
    fireEvent.click(screen.getByText('Customize rewrite'));
    fireEvent.click(screen.getByRole('button', { name: 'executive' }));
    await act(async () => resolve({ ok: true, json: async () => ({ hasOriginal: true, resumePlainText: 'Original accepted after the target edit' }) }));
    expect(rewriteInput()).toHaveValue('Original accepted after the target edit');
    first.unmount();
    render(wrap(<ResumeRewriterClient />));
    expect(rewriteInput()).toHaveValue('Original accepted after the target edit');
    expect(screen.getByLabelText('Target job title')).toHaveValue('Security analyst');
    fireEvent.click(screen.getByText('Customize rewrite'));
    expect(screen.getByRole('button', { name: 'executive' })).toHaveAttribute('aria-pressed', 'true');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it.each(['clear', 'unmount', 'logout'] as const)('a late extraction cannot recreate a saved copy after %s', async (boundary) => {
    let resolveExtraction!: (value: unknown) => void;
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (url === '/api/ai/extract-resume-text') return new Promise(value => { resolveExtraction = value; });
      return Promise.resolve({ ok: true, json: async () => ({}) });
    }));
    const view = render(wrap(<><ResumeStrengthForm /><SignOutButton /></>));
    fireEvent.change(scoreInput(), { target: { value: 'Keep on screen' } });
    const input = document.getElementById('resume-strength-file') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['private text'], 'resume.txt', { type: 'text/plain' })] } });
    if (boundary === 'clear') fireEvent.click(screen.getByRole('button', { name: 'Clear saved copy' }));
    if (boundary === 'unmount') { view.unmount(); purgePendingResumeDrafts(sessionStorage); }
    if (boundary === 'logout') {
      fireEvent.click(screen.getByRole('button', { name: /Sign out/i }));
      await waitFor(() => expect(sessionStorage.getItem(studioDraftKey('member-a'))).toBeNull());
    }
    await act(async () => resolveExtraction({ ok: true, json: async () => ({ text: 'Late private extraction result' }) }));
    expect(sessionStorage.getItem(studioDraftKey('member-a'))).toBeNull();
    if (boundary !== 'unmount') expect(scoreInput()).toHaveValue('Keep on screen');
  });

  it('allows editing with recovery disabled when reading storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('Blocked'); });
    render(wrap(editors));
    expect(scoreInput()).toBeEnabled();
    expect(screen.getByText(en.memberWorkspace.resume.design.draft.unavailable)).toBeInTheDocument();
  });

  it('keeps newer typing when an earlier extraction finishes', async () => {
    let resolveExtraction!: (value: unknown) => void;
    vi.stubGlobal('fetch', vi.fn((url: string) => url === '/api/ai/extract-resume-text'
      ? new Promise(value => { resolveExtraction = value; })
      : Promise.resolve({ ok: true, json: async () => ({}) })));
    render(wrap(<ResumeStrengthForm />));
    fireEvent.change(document.getElementById('resume-strength-file') as HTMLInputElement, { target: { files: [new File(['original'], 'resume.txt', { type: 'text/plain' })] } });
    fireEvent.change(scoreInput(), { target: { value: 'Newer typed input' } });
    await act(async () => resolveExtraction({ ok: true, json: async () => ({ text: 'Older extraction result' }) }));
    expect(scoreInput()).toHaveValue('Newer typed input');
  });

  it('keeps a pending rewrite extraction when its target or a different tool is edited', async () => {
    let resolveExtraction!: (value: unknown) => void;
    vi.stubGlobal('fetch', vi.fn((url: string) => url === '/api/ai/extract-resume-text'
      ? new Promise(value => { resolveExtraction = value; })
      : Promise.resolve({ ok: true, json: async () => ({}) })));
    const first = render(wrap(<><ResumeStrengthForm preview /><ResumeRewriterForm /></>));
    fireEvent.change(document.getElementById('resume-file') as HTMLInputElement, { target: { files: [new File(['original'], 'resume.txt', { type: 'text/plain' })] } });
    fireEvent.change(screen.getByLabelText('Target job title'), { target: { value: 'Updated target during extraction' } });
    fireEvent.change(scoreInput(), { target: { value: 'Independent score edit' } });
    await act(async () => resolveExtraction({ ok: true, json: async () => ({ text: 'Accepted extracted text' }) }));
    expect(rewriteInput()).toHaveValue('Accepted extracted text');
    expect(screen.getByLabelText('Target job title')).toHaveValue('Updated target during extraction');
    first.unmount();
    render(wrap(editors));
    expect(rewriteInput()).toHaveValue('Accepted extracted text');
    expect(screen.getByLabelText('Target job title')).toHaveValue('Updated target during extraction');
    expect(scoreInput()).toHaveValue('Independent score edit');
  });

  it('recovers an intentionally empty rewrite without fetching over it', () => {
    const first = render(wrap(editors));
    fireEvent.change(rewriteInput(), { target: { value: '' } });
    first.unmount();
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    render(wrap(<ResumeRewriterClient />));
    expect(rewriteInput()).toHaveValue('');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('validates owner, future timestamps, input lengths and all enum values', () => {
    const valid = { version: 1, ownerToken: 'member-a', savedAt: Date.now(), lastView: 'rewrite', rewrite: { resume: '', jobTarget: '', targetSalary: '', targetLocation: '', language: 'en', tone: 'professional', atsOptimize: true } };
    expect(parseStudioDraft(JSON.stringify(valid), 'member-a')).not.toBeNull();
    expect(parseStudioDraft(JSON.stringify(valid), 'member-b')).toBeNull();
    expect(parseStudioDraft(JSON.stringify({ ...valid, savedAt: Date.now() + 120_000 }), 'member-a')).toBeNull();
    expect(parseStudioDraft(JSON.stringify({ ...valid, rewrite: { ...valid.rewrite, tone: 'unknown' } }), 'member-a')).toBeNull();
    expect(parseStudioDraft(JSON.stringify({ ...valid, rewrite: { ...valid.rewrite, resume: 'x'.repeat(100_001) } }), 'member-a')).toBeNull();
  });
});
