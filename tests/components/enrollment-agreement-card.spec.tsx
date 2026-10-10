import type { ReactElement } from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import messages from '@/messages/en.json';
import EnrollmentAgreementCard from '@/components/enrollment/EnrollmentAgreementCard';
import {
  ENROLLMENT_TEMPLATE_URL, ENROLLMENT_TEMPLATE_VERSION, MAX_UPLOAD_BYTES,
  type EnrollmentAgreementSubmissionView, type EnrollmentAgreementSummary,
} from '@/lib/enrollmentAgreements/types';

const { announce } = vi.hoisted(() => ({ announce: vi.fn() }));
vi.mock('@/components/portal/kit/hooks/useAnnounce', () => ({ useAnnounce: () => announce }));

const copy = messages.enrollmentAgreement;
const fetchMock = vi.fn<typeof fetch>();
const json = (body: unknown, status = 200) => Response.json(body, { status });
const provider = (ui: ReactElement) => <NextIntlClientProvider locale="en" timeZone="UTC" messages={messages}>{ui}</NextIntlClientProvider>;
const summary = (overrides: Partial<EnrollmentAgreementSummary> = {}): EnrollmentAgreementSummary => ({
  status: 'missing', canUpload: true, canReview: false, templateUrl: ENROLLMENT_TEMPLATE_URL, submissions: [], ...overrides,
});
const submission = (overrides: Partial<EnrollmentAgreementSubmissionView> = {}): EnrollmentAgreementSubmissionView => ({
  id: 'submission-1', status: 'pending', isCurrent: true, templateVersion: ENROLLMENT_TEMPLATE_VERSION,
  uploadedAt: '2026-10-01T12:00:00.000Z', reviewedAt: null, reviewNote: null,
  downloadUrl: '/api/enrollment-agreements/submission-1/download', ...overrides,
});
const pending = (overrides: Partial<EnrollmentAgreementSummary> = {}) => summary({ status: 'pending', submissions: [submission()], ...overrides });
function deferred() {
  let resolve!: (value: Response) => void;
  const promise = new Promise<Response>((complete) => { resolve = complete; });
  return { promise, resolve };
}
function uploadInput() {
  const input = screen.getByRole('button', { name: copy.fileLabel }).querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error('Missing native file picker');
  return input;
}
function choosePdf(file = new File(['%PDF-1.7\nfixture'], 'completed.pdf', { type: 'application/pdf' })) {
  fireEvent.change(uploadInput(), { target: { files: [file] } });
  return file;
}
async function show(data = summary(), memberId?: string) {
  fetchMock.mockResolvedValueOnce(json(data));
  const result = render(provider(<EnrollmentAgreementCard memberId={memberId} />));
  await screen.findByRole('link', { name: copy.downloadTemplate });
  return result;
}
const mutations = () => fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST');
const card = () => within(screen.getByTestId('enrollment-agreement'));

beforeEach(() => {
  fetchMock.mockReset(); announce.mockReset(); vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn() })));
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('EnrollmentAgreementCard', () => {
  it('keeps missing, loading and unavailable distinct and downloads the authenticated blank template', async () => {
    const read = deferred(); fetchMock.mockReturnValueOnce(read.promise);
    render(provider(<EnrollmentAgreementCard />));
    expect(screen.getByText(copy.loading)).toBeInTheDocument();
    expect(screen.queryByText(copy.status.missing)).not.toBeInTheDocument();
    await act(async () => read.resolve(json(summary())));
    expect(screen.getByText(copy.status.missing)).toBeInTheDocument();
    expect(screen.getByText(copy.explanation.missing)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: copy.downloadTemplate })).toHaveAttribute('href', ENROLLMENT_TEMPLATE_URL);
    expect(screen.getByRole('link', { name: copy.downloadTemplate })).toHaveAttribute('download');
    expect(screen.queryByRole('link', { name: copy.downloadCurrent })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: copy.upload })).toBeDisabled();
    expect(fetchMock.mock.calls[0][0]).toBe('/api/enrollment-agreements');
    expect(fetchMock.mock.calls[0][1]?.cache).toBe('no-store');
  });

  it('never labels a failed read missing and permits retry after a non-JSON server failure', async () => {
    fetchMock.mockResolvedValueOnce(new Response('<html>Unavailable</html>', { status: 503 }));
    render(provider(<EnrollmentAgreementCard />));
    expect(await card().findByRole('alert')).toHaveTextContent('This service is temporarily unavailable. Try again in a minute.');
    expect(screen.queryByText(copy.status.missing)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: copy.upload })).not.toBeInTheDocument();
    fetchMock.mockResolvedValueOnce(json(summary()));
    fireEvent.click(screen.getByRole('button', { name: copy.retry }));
    expect(await screen.findByText(copy.status.missing)).toBeInTheDocument();
    expect(card().queryByRole('alert')).not.toBeInTheDocument();
  });

  it('explains network failure in plain language and leaves a working retry', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    render(provider(<EnrollmentAgreementCard />));
    expect(await card().findByRole('alert')).toHaveTextContent('We could not reach WorkforceAP. Check your connection and try again.');
    expect(screen.getByRole('button', { name: copy.retry })).toBeEnabled();
    expect(screen.queryByText(copy.status.missing)).not.toBeInTheDocument();
  });

  it.each(['pending', 'verified', 'needs_correction'] as const)('shows server %s status without treating an upload as a signature', async (status) => {
    await show(summary({ status, submissions: [submission({ status, reviewNote: status === 'needs_correction' ? 'Please supply the final page.' : null })] }));
    expect(screen.getByText(copy.explanation[status])).toBeInTheDocument();
    expect(screen.getByRole('link', { name: copy.downloadCurrent })).toHaveAttribute('href', '/api/enrollment-agreements/submission-1/download');
    expect(screen.queryByRole('button', { name: copy.verify })).not.toBeInTheDocument();
    if (status === 'needs_correction') expect(screen.getByText(/Please supply the final page/)).toBeInTheDocument();
  });

  it('keeps read-only access read-only while preserving authenticated document links', async () => {
    await show(pending({ canUpload: false, canReview: false }), 'member-1');
    expect(screen.queryByRole('button', { name: copy.fileLabel })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: copy.upload })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: copy.verify })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: copy.correction })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: copy.downloadCurrent })).toHaveAttribute('download');
    expect(fetchMock.mock.calls[0][0]).toBe('/api/enrollment-agreements?memberId=member-1');
  });

  it('uploads the selected PDF for the intended member as a new pending revision', async () => {
    await show(summary(), 'member/one');
    const file = choosePdf();
    fetchMock.mockResolvedValueOnce(json({ ok: true }, 201)).mockResolvedValueOnce(json(pending()));
    fireEvent.click(screen.getByRole('button', { name: copy.upload }));
    expect(await screen.findByText(copy.uploaded)).toBeInTheDocument();
    const [url, init] = mutations()[0];
    expect(url).toBe('/api/enrollment-agreements');
    const form = init?.body as FormData;
    expect(form.get('file')).toBe(file);
    expect(form.get('memberId')).toBe('member/one');
    expect(form.get('templateVersion')).toBe(ENROLLMENT_TEMPLATE_VERSION);
    expect(fetchMock.mock.calls.at(-1)?.[0]).toBe('/api/enrollment-agreements?memberId=member%2Fone');
    expect(screen.getByText(copy.explanation.pending)).toBeInTheDocument();
    expect(screen.queryByText(copy.status.verified)).not.toBeInTheDocument();
    expect(announce).toHaveBeenCalledWith(copy.uploaded);
  });

  it('preserves previous signed copies as separately downloadable history when a new copy is uploaded', async () => {
    await show(summary()); choosePdf();
    fireEvent.click(screen.getByRole('checkbox', { name: copy.previous }));
    fetchMock.mockResolvedValueOnce(json({ ok: true }, 201)).mockResolvedValueOnce(json(pending({ submissions: [
      submission({ templateVersion: 'previous' }),
      submission({ id: 'older', status: 'verified', isCurrent: false, downloadUrl: '/api/enrollment-agreements/older/download' }),
    ] })));
    fireEvent.click(screen.getByRole('button', { name: copy.upload }));
    await screen.findByText(copy.uploaded);
    expect((mutations()[0][1]?.body as FormData).get('templateVersion')).toBe('previous');
    fireEvent.click(screen.getByText(copy.history));
    const history = screen.getByRole('list');
    expect(within(history).getAllByRole('listitem')).toHaveLength(2);
    expect(within(history).getAllByRole('link', { name: copy.downloadRevision }).map((link) => link.getAttribute('href'))).toEqual([
      '/api/enrollment-agreements/submission-1/download', '/api/enrollment-agreements/older/download',
    ]);
    expect(within(history).getByText(copy.superseded)).toBeInTheDocument();
  });

  it.each([
    ['empty', () => new File([], 'empty.pdf', { type: 'application/pdf' })],
    ['non-PDF', () => new File(['not pdf'], 'file.txt', { type: 'text/plain' })],
    ['over limit', () => new File([new Uint8Array(MAX_UPLOAD_BYTES + 1)], 'large.pdf', { type: 'application/pdf' })],
  ])('does not submit a %s file', async (_label, makeFile) => {
    await show(); choosePdf(makeFile());
    fireEvent.click(screen.getByRole('button', { name: copy.upload }));
    expect(mutations()).toHaveLength(0);
    expect(screen.getByTestId('enrollment-agreement')).not.toHaveAttribute('aria-busy', 'true');
  });

  it('prevents duplicate upload while busy and retains the file when the server rejects it', async () => {
    await show(); const file = choosePdf(); const upload = deferred(); fetchMock.mockReturnValueOnce(upload.promise);
    const button = screen.getByRole('button', { name: copy.upload });
    fireEvent.click(button); fireEvent.click(button);
    expect(mutations()).toHaveLength(1);
    expect(uploadInput()).toBeDisabled();
    await act(async () => upload.resolve(json({ error: 'The PDF could not be read. Export a new PDF.' }, 400)));
    expect(await card().findByRole('alert')).toHaveTextContent('The PDF could not be read. Export a new PDF.');
    expect(screen.getByRole('button', { name: copy.upload })).toBeEnabled();
    fetchMock.mockResolvedValueOnce(json({ ok: true }, 201)).mockResolvedValueOnce(json(pending()));
    fireEvent.click(screen.getByRole('button', { name: copy.upload }));
    await screen.findByText(copy.uploaded);
    expect((mutations()[1][1]?.body as FormData).get('file')).toBe(file);
  });

  it('requires deliberate signature attestation to verify, and sends no unsigned default approval', async () => {
    await show(pending({ canReview: true }), 'member-1');
    expect(screen.getByRole('button', { name: copy.verify })).toBeDisabled();
    expect(screen.getByRole('button', { name: copy.correction })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: copy.verify }));
    expect(mutations()).toHaveLength(0);
    fireEvent.click(screen.getByRole('checkbox', { name: copy.attest }));
    const review = deferred(); fetchMock.mockReturnValueOnce(review.promise).mockResolvedValueOnce(json(summary({ status: 'verified', canReview: true, submissions: [submission({ status: 'verified' })] })));
    const button = screen.getByRole('button', { name: copy.verify });
    fireEvent.click(button); fireEvent.click(button);
    expect(mutations()).toHaveLength(1);
    expect(mutations()[0][0]).toBe('/api/enrollment-agreements/submission-1/review');
    expect(JSON.parse(String(mutations()[0][1]?.body))).toEqual({ action: 'verify', reviewNote: '', attestSignatures: true });
    await act(async () => review.resolve(json({ ok: true })));
    expect(await screen.findByText(copy.reviewSaved)).toBeInTheDocument();
    expect(screen.getByText(copy.explanation.verified)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: copy.verify })).not.toBeInTheDocument();
  });

  it('requires a correction reason, trims it, and does not attest signatures implicitly', async () => {
    await show(pending({ canReview: true }));
    const note = screen.getByRole('textbox', { name: copy.reviewNote });
    fireEvent.change(note, { target: { value: '   ' } });
    expect(screen.getByRole('button', { name: copy.correction })).toBeDisabled();
    fireEvent.change(note, { target: { value: '  Please supply the final page.  ' } });
    fetchMock.mockResolvedValueOnce(json({ ok: true })).mockResolvedValueOnce(json(summary({ status: 'needs_correction', submissions: [submission({ status: 'needs_correction', reviewNote: 'Please supply the final page.' })] })));
    fireEvent.click(screen.getByRole('button', { name: copy.correction }));
    await screen.findByText(copy.reviewSaved);
    expect(JSON.parse(String(mutations()[0][1]?.body))).toEqual({ action: 'request_correction', reviewNote: 'Please supply the final page.', attestSignatures: false });
  });

  it('keeps a rejected review pending and shows a stale-revision error instead of false success', async () => {
    await show(pending({ canReview: true }));
    fireEvent.click(screen.getByRole('checkbox', { name: copy.attest }));
    fetchMock.mockResolvedValueOnce(json({ error: 'A newer agreement was uploaded. Reload before reviewing.' }, 409));
    fireEvent.click(screen.getByRole('button', { name: copy.verify }));
    expect(await card().findByRole('alert')).toHaveTextContent('A newer agreement was uploaded. Reload before reviewing.');
    expect(screen.queryByText(copy.reviewSaved)).not.toBeInTheDocument();
    expect(screen.getByText(copy.explanation.pending)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: copy.retry })).toBeEnabled();
  });

  it('does not retain stale verified status when a successful replacement cannot be reloaded', async () => {
    await show(summary({ status: 'verified', submissions: [submission({ status: 'verified' })] }));
    choosePdf(); fetchMock.mockResolvedValueOnce(json({ ok: true }, 201)).mockResolvedValueOnce(json({ error: 'Database offline' }, 503));
    fireEvent.click(screen.getByRole('button', { name: copy.upload }));
    await card().findByRole('alert');
    expect(screen.queryByText(copy.explanation.verified)).not.toBeInTheDocument();
    expect(screen.queryByText(copy.status.missing)).not.toBeInTheDocument();
    expect(screen.queryByText(copy.uploaded)).not.toBeInTheDocument();
    fetchMock.mockResolvedValueOnce(json(pending())); fireEvent.click(screen.getByRole('button', { name: copy.retry }));
    expect(await screen.findByText(copy.explanation.pending)).toBeInTheDocument();
  });

  it('aborts and ignores a stale member read even when the transport resolves after cancellation', async () => {
    const old = deferred(); const fresh = deferred(); fetchMock.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
    const { rerender } = render(provider(<EnrollmentAgreementCard memberId="old-member" />));
    const oldSignal = fetchMock.mock.calls[0][1]?.signal;
    rerender(provider(<EnrollmentAgreementCard memberId="new-member" />));
    expect(oldSignal?.aborted).toBe(true);
    await act(async () => fresh.resolve(json(summary())));
    await act(async () => old.resolve(json(pending({ submissions: [submission({ reviewNote: 'Private old-member note.' })] }))));
    expect(screen.getByText(copy.explanation.missing)).toBeInTheDocument();
    expect(screen.queryByText(/Private old-member note/)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: copy.downloadCurrent })).not.toBeInTheDocument();
  });

  it('clears file and review state on member switch and ignores old upload completion', async () => {
    const { rerender } = await show(pending({ canReview: true }), 'old-member');
    choosePdf(); fireEvent.click(screen.getByRole('checkbox', { name: copy.attest }));
    fireEvent.change(screen.getByRole('textbox', { name: copy.reviewNote }), { target: { value: 'Old private note.' } });
    const upload = deferred(); fetchMock.mockReturnValueOnce(upload.promise).mockResolvedValueOnce(json(summary()));
    fireEvent.click(screen.getByRole('button', { name: copy.upload }));
    const signal = mutations()[0][1]?.signal;
    rerender(provider(<EnrollmentAgreementCard memberId="new-member" />));
    await screen.findByText(copy.explanation.missing);
    expect(signal?.aborted).toBe(true);
    expect(screen.getByRole('button', { name: copy.upload })).toBeDisabled();
    expect(screen.queryByDisplayValue('Old private note.')).not.toBeInTheDocument();
    await act(async () => upload.resolve(json({ ok: true }, 201)));
    expect(screen.queryByText(copy.uploaded)).not.toBeInTheDocument();
    expect(fetchMock.mock.calls).toHaveLength(3);
    expect(announce).not.toHaveBeenCalledWith(copy.uploaded);
  });
});
