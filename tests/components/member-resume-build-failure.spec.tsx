import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import ResumeClient from '@/app/(portal)/dashboard/resume/ResumeClient';

vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('@/lib/analytics/events', () => ({ trackFunnelEvent: vi.fn() }));

/**
 * /dashboard/resume after a PDF upload: a refused Build must show the server's
 * sentence instead of a blank or generic resume, and the original PDF must stay
 * reachable when the browser cannot render it inline. Fictional member only.
 */

const pdfOnFile = {
  originalUrl: 'https://storage.example.test/signed/original.pdf',
  enhancedUrl: null,
  enhancedText: null,
  hasOriginal: true,
  hasEnhanced: false,
  originalExt: 'pdf',
  enhancedExt: null,
  previewOriginalPath: '/api/member/resume/preview?variant=original&v=synthetic',
  previewEnhancedPath: null,
};

function stubFetch(generate: () => Response) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.includes('/api/member/resume/generate')) return generate();
    return Response.json(pdfOnFile, { status: 200 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderPage() {
  return render(
    <ResumeClient
      completeness={60}
      witData={{ name: 'Avery Quillfeather', email: 'avery@example.test', phone: '', recentEmployer: '', targetJob: '', skills: '' }}
      hasOriginal
      hasEnhanced={false}
    />,
  );
}

function statusRequests(fetchMock: ReturnType<typeof stubFetch>) {
  return fetchMock.mock.calls.filter(([input]) => String(input) === '/api/member/resume').length;
}

describe('ResumeClient Build refusal', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it.each([
    'We could not read enough text from your uploaded resume. Upload a PDF with selectable text, DOCX, or TXT file. Your existing files were kept.',
    'The generated draft included details that are not in your resume or profile, so your existing resume was kept. Try again, or add the missing details to your profile first.',
  ])('shows the server sentence and keeps the page on the original: %s', async (message) => {
    const fetchMock = stubFetch(() => Response.json({ error: message }, { status: 422 }));
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: /Build Resume/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    // No refresh after a refusal, so no new draft can appear in the preview.
    expect(statusRequests(fetchMock)).toBe(1);
    expect(screen.queryByTitle('Enhanced resume preview')).toBeNull();
    expect(screen.getByRole('button', { name: /Build Resume/ })).toBeEnabled();
  });
});

describe('ResumeClient PDF preview fallback', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('offers the original PDF as a download when the preview API returns JSON', async () => {
    stubFetch(() => Response.json({}, { status: 500 }));
    renderPage();

    const frame = await screen.findByTitle('Original resume preview');
    expect(frame).toHaveAttribute('src', pdfOnFile.previewOriginalPath);
    // ResumeClient.tsx:88-90 resets the failure flag in a passive effect once
    // previewOriginalPath is set; findByTitle can see the iframe before that
    // effect flushes, so flush it before the synthetic load.
    await act(async () => {});

    // jsdom never fetches the frame, so stand in for an API error document.
    // Native PDF viewers can expose an empty document and must stay mounted.
    const jsonError = document.implementation.createHTMLDocument('');
    jsonError.body.textContent = '{"error":"Preview unavailable"}';
    Object.defineProperty(jsonError, 'contentType', { value: 'application/json' });
    Object.defineProperty(frame, 'contentDocument', {
      configurable: true,
      value: jsonError,
    });
    fireEvent.load(frame);

    expect(await screen.findByText("PDF preview isn't available in this browser.")).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Download to view/ })).toHaveAttribute('href', pdfOnFile.originalUrl);
  });
});
