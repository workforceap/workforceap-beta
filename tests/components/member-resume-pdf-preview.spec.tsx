import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement, ReactNode } from 'react';
import en from '@/messages/en.json';
import { act, cleanup, fireEvent, render as renderPlain, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import ResumeClient from '@/app/(portal)/dashboard/resume/ResumeClient';
import DevMemberResumeStudioPage from '@/app/dev/member/resume-studio/page';

vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('@/lib/analytics/events', () => ({ trackFunnelEvent: vi.fn() }));
vi.mock('@/components/portal/kit/pages/member/ResumeStudioKit', () => ({
  ResumeStudioKit: ({ filesSlot }: { filesSlot: ReactElement }) => filesSlot,
}));

const resumeStatus = {
  originalUrl: 'https://example.invalid/original.pdf',
  enhancedUrl: 'https://example.invalid/enhanced.pdf',
  enhancedText: null,
  hasOriginal: true,
  hasEnhanced: true,
  enhancedUnavailable: false,
  originalExt: 'pdf',
  enhancedExt: 'pdf',
  previewOriginalPath: '/api/member/resume/preview?variant=original',
  previewEnhancedPath: '/api/member/resume/preview?variant=enhanced',
};

function renderWithPdfPreviews() {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json(resumeStatus)));
  return render(
    <ResumeClient
      completeness={60}
      witData={{ name: 'Jordan Example', email: 'jordan@example.invalid', phone: '', recentEmployer: '', targetJob: '', skills: '' }}
      hasOriginal
      hasEnhanced
    />,
  );
}

function loadAs(frame: HTMLElement, doc: Document | null) {
  Object.defineProperty(frame, 'contentDocument', { configurable: true, value: doc });
  fireEvent.load(frame);
}

describe('synthetic Resume file proof', () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
  it('keeps separate original and revised files while disabling account/provider side effects', () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    render(<ResumeClient completeness={75} witData={{ name: 'Fixture', email: 'fixture@example.test', phone: '', recentEmployer: '', targetJob: '', skills: '' }} hasOriginal hasEnhanced layout="side-by-side" previewData={{ originalText: 'ORIGINAL SAMPLE', enhancedText: 'REVISED SAMPLE' }} />);
    expect(screen.getByRole('button', { name: 'Refresh from Profile' })).toBeDisabled();
    const file = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    expect(file).toBeDisabled();
    fireEvent.change(file, { target: { files: [new File(['fixture'], 'fixture.txt', { type: 'text/plain' })] } });
    const downloads = screen.getAllByRole('link').filter(link => link.hasAttribute('download'));
    expect(downloads).toHaveLength(2);
    expect(downloads.some(link => link.getAttribute('href')?.includes('ORIGINAL%20SAMPLE'))).toBe(true);
    expect(downloads.some(link => link.getAttribute('href')?.includes('REVISED%20SAMPLE'))).toBe(true);
    expect(screen.getByRole('link', { name: 'Download original resume' })).toHaveAttribute('download', 'sample-original-resume.txt');
    expect(screen.getByRole('link', { name: 'Download updated resume' })).toHaveAttribute('download', 'sample-revised-resume.txt');
    expect(screen.getByRole('link', { name: /^Resume Rewriter/ })).toHaveAttribute('href', '/dashboard/resume?view=rewrite');
    expect(screen.getByRole('link', { name: /^Job Match Scorer/ })).toHaveAttribute('href', '/dashboard/ai-tools/job-match-scorer');
    expect(screen.getByRole('link', { name: /^Resume Analysis/ })).toHaveAttribute('href', '/dashboard/resume?view=score');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('keeps all three fixture-owned shortcuts in the sample flow without account reads', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    render(await DevMemberResumeStudioPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByRole('link', { name: /^Resume Rewriter/ })).toHaveAttribute('href', '/dev/member/resume-studio?view=rewrite');
    expect(screen.getByRole('link', { name: /^Job Match Scorer/ })).toHaveAttribute('href', '/dev/member/job-match');
    expect(screen.getByRole('link', { name: /^Resume Analysis/ })).toHaveAttribute('href', '/dev/member/resume-studio?view=score');
    expect(screen.getByRole('link', { name: 'Download original resume' })).toHaveAttribute('download', 'sample-original-resume.txt');
    expect(screen.getByRole('link', { name: 'Download updated resume' })).toHaveAttribute('download', 'sample-revised-resume.txt');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('uses a supplied destination unchanged while retaining defaults for the other tools', () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    render(<ResumeClient completeness={75} witData={{ name: 'Fixture', email: 'fixture@example.test', phone: '', recentEmployer: '', targetJob: '', skills: '' }} hasOriginal hasEnhanced previewData={{ originalText: 'ORIGINAL SAMPLE', enhancedText: 'REVISED SAMPLE' }} toolHrefs={{ rewrite: '/dev/member/resume-studio?view=rewrite&source=files#editor' }} />);

    expect(screen.getByRole('link', { name: /^Resume Rewriter/ })).toHaveAttribute('href', '/dev/member/resume-studio?view=rewrite&source=files#editor');
    expect(screen.getByRole('link', { name: /^Job Match Scorer/ })).toHaveAttribute('href', '/dashboard/ai-tools/job-match-scorer');
    expect(screen.getByRole('link', { name: /^Resume Analysis/ })).toHaveAttribute('href', '/dashboard/resume?view=score');
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe('member PDF preview fallback', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('offers one download per stored file when neither file has a renderable preview', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({
      ...resumeStatus,
      originalExt: 'txt',
      enhancedExt: 'txt',
      previewOriginalPath: null,
      previewEnhancedPath: null,
    })));
    render(<ResumeClient completeness={60} witData={{ name: 'Jordan Example', email: 'jordan@example.invalid', phone: '', recentEmployer: '', targetJob: '', skills: '' }} hasOriginal hasEnhanced />);

    const original = await screen.findByRole('link', { name: 'Download original resume (opens in a new tab)' });
    const updated = screen.getByRole('link', { name: 'Download updated resume (opens in a new tab)' });
    expect(original).toHaveAttribute('href', resumeStatus.originalUrl);
    expect(updated).toHaveAttribute('href', resumeStatus.enhancedUrl);
    expect(screen.getAllByRole('link').filter(link => link.getAttribute('href') === resumeStatus.originalUrl)).toEqual([original]);
    expect(screen.getAllByRole('link').filter(link => link.getAttribute('href') === resumeStatus.enhancedUrl)).toEqual([updated]);
  });

  it('replaces a nonempty JSON API error with the download fallback for only that preview', async () => {
    renderWithPdfPreviews();
    const original = await screen.findByTitle('Original resume preview');
    // ResumeClient.tsx:88-90 resets the failure flag in a passive effect once
    // previewOriginalPath is set; findByTitle can see the iframe before that
    // effect flushes, so flush it before the synthetic load.
    await act(async () => {});
    const jsonError = document.implementation.createHTMLDocument('');
    jsonError.body.textContent = '{"error":"Unauthorized"}';
    Object.defineProperty(jsonError, 'contentType', { value: 'application/json' });

    loadAs(original, jsonError);

    expect(screen.queryByTitle('Original resume preview')).toBeNull();
    expect(screen.getByTitle('Enhanced resume preview')).toBeInTheDocument();
    expect(screen.getByText("PDF preview isn't available in this browser.")).toBeInTheDocument();
    // The fallback link names the document it opens (the arrow is decorative), so
    // the two fallbacks on this page are not both announced as "Download to view".
    expect(screen.getByRole('link', { name: /^Download to view original resume/ })).toHaveAttribute('href', resumeStatus.originalUrl);
  });

  it('keeps the native PDF viewer mounted when its document is opaque or empty', async () => {
    renderWithPdfPreviews();
    const enhanced = await screen.findByTitle('Enhanced resume preview');

    loadAs(enhanced, null);
    expect(screen.getByTitle('Enhanced resume preview')).toBeInTheDocument();

    const emptyViewerShell = document.implementation.createHTMLDocument('');
    loadAs(enhanced, emptyViewerShell);
    expect(screen.getByTitle('Enhanced resume preview')).toBeInTheDocument();
    expect(screen.queryByText("PDF preview isn't available in this browser.")).toBeNull();
  });

  it('detects a JSON error shown as plain text in the enhanced iframe', async () => {
    renderWithPdfPreviews();
    const enhanced = await screen.findByTitle('Enhanced resume preview');
    // Same ordering for ResumeClient.tsx:92-94 (previewEnhancedPath): flush
    // the reset effect before the synthetic load.
    await act(async () => {});
    const textError = document.implementation.createHTMLDocument('');
    textError.body.textContent = '{"error":"This enhanced resume is not readable"}';

    loadAs(enhanced, textError);

    expect(screen.queryByTitle('Enhanced resume preview')).toBeNull();
    expect(screen.getByTitle('Original resume preview')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^Download to view updated resume/ })).toHaveAttribute('href', resumeStatus.enhancedUrl);
  });
});

function render(ui: ReactElement) {
  return renderPlain(ui, { wrapper: ({ children }: { children: ReactNode }) => <NextIntlClientProvider locale="en" messages={en}>{children}</NextIntlClientProvider> });
}
