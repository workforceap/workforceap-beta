import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import messages from '@/messages/en.json';
import EnrollmentAgreementArchiveClient from '@/components/enrollment/EnrollmentAgreementArchiveClient';
import type { EnrollmentAgreementArchive } from '@/lib/enrollmentAgreements/types';

const fetchMock = vi.fn<typeof fetch>();
const json = (body: unknown, status = 200) => Response.json(body, { status });
const row: EnrollmentAgreementArchive['rows'][number] = {
  id: 'revision-one', subjectMemberId: 'original-account', subjectName: 'Archived Student',
  status: 'pending', isCurrent: true, templateVersion: 'previous',
  uploadedAt: '2026-10-01T12:00:00Z', reviewedAt: null, reviewNote: null,
  retainedAfterAccountDeletion: true, downloadUrl: '/api/enrollment-agreements/archive/revision-one/download',
};
const archive = (overrides: Partial<EnrollmentAgreementArchive> = {}): EnrollmentAgreementArchive => ({
  rows: [row], page: 1, hasMore: false, total: 1, ...overrides,
});
function deferred() {
  let resolve!: (value: Response) => void;
  const promise = new Promise<Response>((complete) => { resolve = complete; });
  return { promise, resolve };
}
const show = () => render(<NextIntlClientProvider locale="en" timeZone="UTC" messages={messages}><EnrollmentAgreementArchiveClient /></NextIntlClientProvider>);

beforeEach(() => {
  fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn() })));
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('EnrollmentAgreementArchiveClient', () => {
  it('downloads retained revisions directly without granting review or linking to a deleted account', async () => {
    fetchMock.mockResolvedValueOnce(json(archive({ rows: [row, {
      ...row, id: 'historical-verified', status: 'verified', isCurrent: false,
      reviewedAt: '2026-09-30T12:00:00Z', reviewNote: 'Required signatures checked.',
      downloadUrl: '/api/enrollment-agreements/archive/historical-verified/download',
    }] , total: 2 })));
    const { container } = show();
    expect(await screen.findByText('Page 1 · 2 matching revisions')).toBeInTheDocument();
    const links = screen.getAllByRole('link', { name: /Download PDF for Archived Student/ });
    expect(links).toHaveLength(4);
    expect(links.map((link) => link.getAttribute('href'))).toEqual(expect.arrayContaining([
      row.downloadUrl, '/api/enrollment-agreements/archive/historical-verified/download',
    ]));
    expect(container.querySelector('a[href^="/admin/members/"]')).toBeNull();
    expect(screen.getAllByText('Retained after account deletion')).toHaveLength(4);
    expect(screen.getAllByText('Awaiting review')).toHaveLength(2);
    expect(screen.getAllByText('Verified')).toHaveLength(2);
    expect(screen.getAllByText('Historical revision · previous')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: /upload|verify|delete|correction/i })).not.toBeInTheDocument();
    expect(fetchMock.mock.calls[0][0]).toBe('/api/enrollment-agreements/archive?page=1&query=');
    expect(fetchMock.mock.calls[0][1]?.cache).toBe('no-store');
  });

  it('keeps correction records unverified and distinguishes account-linked records', async () => {
    fetchMock.mockResolvedValueOnce(json(archive({ rows: [{ ...row, status: 'needs_correction', retainedAfterAccountDeletion: false }] })));
    show(); await screen.findByText('Page 1 · 1 matching revisions');
    expect(screen.getAllByText('Needs correction')).toHaveLength(2);
    expect(screen.getAllByText('Account linked')).toHaveLength(2);
    expect(screen.getByText(/Awaiting review and Needs correction remain unverified/)).toBeInTheDocument();
    expect(screen.getByText(/does not authenticate signatures/)).toBeInTheDocument();
  });

  it('does not show an empty archive or zero count while loading', async () => {
    const read = deferred(); fetchMock.mockReturnValueOnce(read.promise); show();
    expect(screen.queryByText('No saved agreements')).not.toBeInTheDocument();
    expect(screen.queryByText(/matching revisions/)).not.toBeInTheDocument();
    await act(async () => read.resolve(json(archive({ rows: [], total: 0 }))));
    expect(screen.getAllByRole('heading', { name: 'No saved agreements' })).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
  });

  it('searches on the server and resets pagination without filtering the loaded page', async () => {
    fetchMock.mockResolvedValueOnce(json(archive({ total: 51, hasMore: true })))
      .mockResolvedValueOnce(json(archive({ page: 2, total: 51 })))
      .mockResolvedValueOnce(json(archive({ rows: [], total: 0 })));
    show(); await screen.findByText('Page 1 · 51 matching revisions');
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    await screen.findByText('Page 2 · 51 matching revisions');
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Name & original/id' } });
    await screen.findByText('Page 1 · 0 matching revisions');
    expect(fetchMock.mock.calls[2][0]).toBe('/api/enrollment-agreements/archive?page=1&query=Name+%26+original%2Fid');
    expect(screen.getAllByRole('heading', { name: 'No agreements match this search' })).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
  });

  it('shows service failure instead of a false empty result and supports retry', async () => {
    fetchMock.mockResolvedValueOnce(new Response('<html>Failure</html>', { status: 503 }));
    const { container } = show();
    expect(await within(container).findByRole('alert')).toHaveTextContent('This service is temporarily unavailable. Try again in a minute.');
    expect(screen.queryByText('No saved agreements')).not.toBeInTheDocument();
    expect(screen.queryByText(/matching revisions/)).not.toBeInTheDocument();
    fetchMock.mockResolvedValueOnce(json(archive()));
    fireEvent.click(screen.getByRole('button', { name: 'Retry archive' }));
    await screen.findByText('Page 1 · 1 matching revisions');
    expect(within(container).queryByRole('alert')).not.toBeInTheDocument();
  });

  it('ignores a stale search response and aborts the prior request', async () => {
    const old = deferred(); fetchMock.mockReturnValueOnce(old.promise)
      .mockResolvedValueOnce(json(archive({ rows: [{ ...row, subjectName: 'New Search Result' }] })));
    show(); const signal = fetchMock.mock.calls[0][1]?.signal;
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'New Search' } });
    await screen.findAllByText('New Search Result');
    expect(signal?.aborted).toBe(true);
    await act(async () => old.resolve(json(archive())));
    expect(screen.queryByText('Archived Student')).not.toBeInTheDocument();
    expect(screen.getAllByText('New Search Result')).toHaveLength(2);
  });

  it('returns to the preceding page if the requested page is now empty', async () => {
    fetchMock.mockResolvedValueOnce(json(archive({ total: 51, hasMore: true })))
      .mockResolvedValueOnce(json(archive({ page: 2, rows: [], total: 50 })))
      .mockResolvedValueOnce(json(archive({ total: 50 })));
    show(); await screen.findByText('Page 1 · 51 matching revisions');
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(await screen.findByText('Page 1 · 50 matching revisions')).toBeInTheDocument();
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      '/api/enrollment-agreements/archive?page=1&query=',
      '/api/enrollment-agreements/archive?page=2&query=',
      '/api/enrollment-agreements/archive?page=1&query=',
    ]);
  });
});
