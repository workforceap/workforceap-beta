import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import ResumeClient from '@/app/(portal)/dashboard/resume/ResumeClient';

vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('@/lib/analytics/events', () => ({ trackFunnelEvent: vi.fn() }));

/**
 * Member audit 7c: a 500 from /api/member/resume/upload left the drop zone
 * and preview unchanged. The page must name the failure in plain language,
 * clear the busy state and let the member pick a file again.
 */

const resumeStatus = {
  originalUrl: null,
  enhancedUrl: null,
  enhancedText: null,
  hasOriginal: false,
  hasEnhanced: false,
  originalExt: null,
  enhancedExt: null,
  previewOriginalPath: null,
  previewEnhancedPath: null,
};

function stubFetch(upload: () => Response | Promise<Response>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes('/api/member/resume/upload')) return upload();
      return Response.json(resumeStatus, { status: 200 });
    }),
  );
}

function renderPage() {
  return render(
    <ResumeClient
      completeness={20}
      witData={{ name: 'Jordan Williams', email: 'jordan@example.org', phone: '', recentEmployer: '', targetJob: '', skills: '' }}
      hasOriginal={false}
      hasEnhanced={false}
    />,
  );
}

async function chooseFile() {
  // The page shows a loading state until /api/member/resume answers.
  await screen.findByText(/Drag and drop your resume here/);
  const input = document.getElementById('resume-upload-input') as HTMLInputElement;
  const file = new File(['Jordan Williams — resume'], 'resume.txt', { type: 'text/plain' });
  fireEvent.change(input, { target: { files: [file] } });
  return input;
}

describe('ResumeClient upload failure state', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('shows a plain-language alert and re-enables the picker after a 500 with a non-JSON body', async () => {
    stubFetch(() => new Response('<!doctype html><title>500</title>', { status: 500, statusText: 'Internal Server Error', headers: { 'content-type': 'text/html' } }));
    renderPage();

    const input = await chooseFile();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/temporarily unavailable/i);
    expect(alert).not.toHaveTextContent(/500|Internal Server Error/);
    await waitFor(() => {
      expect(input).toBeEnabled();
      expect(screen.getByText(/Drag and drop your resume here/)).toBeInTheDocument();
      expect(screen.queryByText('Uploading…')).toBeNull();
    });
  });

  it('keeps the server sentence for a 400 validation answer', async () => {
    stubFetch(() => Response.json({ error: 'That file has no readable text. Export it as PDF and try again.' }, { status: 400 }));
    renderPage();

    await chooseFile();

    expect(await screen.findByRole('alert')).toHaveTextContent('That file has no readable text. Export it as PDF and try again.');
  });

  it('names a network failure instead of leaving the page unchanged', async () => {
    stubFetch(() => { throw new TypeError('Failed to fetch'); });
    renderPage();

    const input = await chooseFile();

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not reach/i);
    await waitFor(() => expect(input).toBeEnabled());
  });
});
